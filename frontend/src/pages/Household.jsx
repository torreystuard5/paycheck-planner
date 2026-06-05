import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Copy, LogOut, Activity, Clock, Settings, CheckCircle, DollarSign, ClipboardList, Trash2, ShoppingCart, Plus, Edit2 } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import usePolling from '../hooks/usePolling';
import { formatFriendlyDate } from '../utils/formatDate';
import ProFeatureGate from '../components/ProFeatureGate';
import HouseholdFinancialOverview from '../components/HouseholdFinancialOverview';
import {
  Badge,
  Button,
  Card,
  FilterChips,
  IconStat,
  PageHeader,
  cn,
} from '../components/ui';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const DEFAULT_CHILD_PERMS = {
  can_view_bills: true,
  can_view_amounts: false,
  can_view_invite_code: false,
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'members', label: 'Members' },
  { key: 'shared', label: 'Shared Items' },
  { key: 'shopping', label: 'Shopping List' },
];

const CATEGORIES = ['Grocery', 'Household', 'Personal', 'Other'];

export default function Household() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [householdBills, setHouseholdBills] = useState([]);
  const [billBreakdowns, setBillBreakdowns] = useState({});
  const [chores, setChores] = useState([]);
  const [choreTitle, setChoreTitle] = useState('');
  const [choreDue, setChoreDue] = useState('');
  const [choreAssign, setChoreAssign] = useState('');
  const [choreRecurring, setChoreRecurring] = useState('');
  const [permModalMember, setPermModalMember] = useState(null);
  const [permDraft, setPermDraft] = useState({ ...DEFAULT_CHILD_PERMS });

  // Shopping list state
  const [shoppingItems, setShoppingItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [shoppingFilter, setShoppingFilter] = useState('all');

  const fetchHousehold = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/households/me');
      setHousehold(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err.response?.status === 404) {
        setHousehold(null);
      }
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/households/activity?limit=20');
      setActivities(res.data.activities || []);
      setLastUpdated(new Date());
    } catch {
      // activity feed is optional
    }
  }, []);

  const fetchChores = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/households/chores');
      setChores(res.data.items || []);
    } catch {
      setChores([]);
    }
  }, []);

  const fetchHouseholdBills = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/bills');
      const bills = Array.isArray(res.data) ? res.data : [];
      const shared = bills.filter((b) => b.is_household_bill && b.is_active);
      setHouseholdBills(shared);

      if (shared.length === 0) {
        setBillBreakdowns({});
        return;
      }
      try {
        const bdRes = await api.get('/api/v1/bills/household-breakdowns');
        const raw = bdRes.data?.breakdowns ?? {};
        const breakdowns = {};
        for (const bill of shared) {
          const key = String(bill.id);
          if (raw[key]) breakdowns[bill.id] = raw[key];
        }
        setBillBreakdowns(breakdowns);
      } catch {
        setBillBreakdowns({});
      }
    } catch {
      setHouseholdBills([]);
      setBillBreakdowns({});
    }
  }, []);

  const fetchShoppingList = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/households/shopping-list');
      setShoppingItems(res.data.items || []);
    } catch (err) {
      setShoppingItems([]);
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string' && detail.includes('Database temporarily unavailable')) {
        setError(detail);
      }
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchHousehold(),
      fetchActivity(),
      fetchHouseholdBills(),
      fetchChores(),
      fetchShoppingList(),
    ]);
  }, [fetchHousehold, fetchActivity, fetchHouseholdBills, fetchChores, fetchShoppingList]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    };
    init();
  }, [fetchAll]);

  usePolling(fetchAll, 30000, !!household);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/v1/households', { name: createName.trim() });
      setSuccess('Household created!');
      setCreateName('');
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create household.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/v1/households/join', { invite_code: joinCode.trim().toUpperCase() });
      setSuccess('Joined household!');
      setJoinCode('');
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to join household.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = async () => {
    setError(null);
    try {
      await api.post('/api/v1/households/leave');
      setHousehold(null);
      setActivities([]);
      setHouseholdBills([]);
      setBillBreakdowns({});
      setChores([]);
      setShoppingItems([]);
      setSuccess('Left household.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to leave household.');
    }
  };

  const handleCopyCode = async () => {
    if (!household?.invite_code) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy invite code.');
    }
  };

  const handleSplitMethodChange = async (e) => {
    const newMethod = e.target.value;
    setError(null);
    try {
      const res = await api.put('/api/v1/households/split-method', { split_method: newMethod });
      setHousehold(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update split method.');
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/auth/me');
      updateUser({ ...data, app_mode: data.app_mode || 'personal' });
    } catch {
      // ignore
    }
  }, [updateUser]);

  const handleRoleChange = async (memberId, role) => {
    setError(null);
    try {
      await api.patch(`/api/v1/households/members/${memberId}/role`, { member_role: role });
      setSuccess('Member role updated.');
      const res = await api.get('/api/v1/households/me');
      setHousehold(res.data);
      if (memberId === user?.id) await refreshUser();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update role.');
    }
  };

  const openPermModal = (member) => {
    setPermDraft({ ...DEFAULT_CHILD_PERMS, ...(member.household_child_permissions || {}) });
    setPermModalMember(member);
  };

  const savePermModal = async () => {
    if (!permModalMember) return;
    setError(null);
    try {
      await api.patch(`/api/v1/households/members/${permModalMember.id}/permissions`, permDraft);
      setSuccess('Permissions saved.');
      setPermModalMember(null);
      const res = await api.get('/api/v1/households/me');
      setHousehold(res.data);
      if (permModalMember.id === user?.id) await refreshUser();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save permissions.');
    }
  };

  const handleCreateChore = async (e) => {
    e.preventDefault();
    if (!choreTitle.trim()) return;
    setError(null);
    try {
      const body = {
        title: choreTitle.trim(),
        due_date: choreDue || null,
        recurring: choreRecurring || null,
      };
      if (choreAssign) body.assigned_to = choreAssign;
      await api.post('/api/v1/households/chores', body);
      setChoreTitle('');
      setChoreDue('');
      setChoreAssign('');
      setChoreRecurring('');
      setSuccess('Chore added.');
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add chore.');
    }
  };

  const handleCompleteChore = async (id) => {
    setError(null);
    try {
      await api.patch(`/api/v1/households/chores/${id}`, { status: 'completed' });
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update chore.');
    }
  };

  const handleDeleteChore = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/v1/households/chores/${id}`);
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete chore.');
    }
  };

  // Shopping list handlers
  const handleAddShoppingItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setError(null);
    try {
      const body = { item_name: newItemName.trim() };
      if (newItemQty.trim()) body.quantity = newItemQty.trim();
      if (newItemCategory) body.category = newItemCategory;
      await api.post('/api/v1/households/shopping-list', body);
      setNewItemName('');
      setNewItemQty('');
      setNewItemCategory('');
      await fetchShoppingList();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add item.');
    }
  };

  const handleToggleShoppingItem = async (item) => {
    setError(null);
    try {
      await api.patch(`/api/v1/households/shopping-list/${item.id}`, {
        is_completed: !item.is_completed,
      });
      await fetchShoppingList();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update item.');
    }
  };

  const handleDeleteShoppingItem = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/v1/households/shopping-list/${id}`);
      await fetchShoppingList();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete item.');
    }
  };

  const startEditItem = (item) => {
    setEditingItem(item.id);
    setEditForm({
      item_name: item.item_name,
      quantity: item.quantity || '',
      category: item.category || '',
      notes: item.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editForm.item_name?.trim()) return;
    setError(null);
    try {
      await api.patch(`/api/v1/households/shopping-list/${editingItem}`, {
        item_name: editForm.item_name.trim(),
        quantity: editForm.quantity || null,
        category: editForm.category || null,
        notes: editForm.notes || null,
      });
      setEditingItem(null);
      setEditForm({});
      await fetchShoppingList();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update item.');
    }
  };

  const getInitialColor = (name) => {
    const colors = [
      'bg-accent-500', 'bg-brand-500', 'bg-purple-500', 'bg-warning-500',
      'bg-debt-500', 'bg-accent-600', 'bg-brand-600', 'bg-danger-500',
    ];
    const idx = (name || '').charCodeAt(0) % colors.length;
    return colors[idx];
  };

  if (loading) return <LoadingSpinner />;

  // No household — show create/join UI
  if (!household) {
    return (
      <div className="page-container min-w-0">
        <PageHeader
          title="Household"
          description="Create or join a household to share your budget"
        />

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</Card>
        )}
        {success && (
          <Card className="flex items-center gap-2 border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {success}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <IconStat icon={Users} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <h2 className="text-title">Create Household</h2>
            </div>
            <p className="text-body mb-4">Start a new household and invite your partner.</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="Household name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="form-input"
              />
              <Button type="submit" variant="accent" disabled={submitting} className="w-full">
                {submitting ? 'Creating...' : 'Create'}
              </Button>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <IconStat icon={UserPlus} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <h2 className="text-title">Join Household</h2>
            </div>
            <p className="text-body mb-4">Enter an invite code to join an existing household.</p>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                placeholder="Invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="form-input font-mono uppercase tracking-widest"
                maxLength={8}
              />
              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? 'Joining...' : 'Join'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // In household — show tabbed UI
  const isCreator = household.created_by === user?.id;
  const isAdult = (user?.household_member_role || 'adult') === 'adult';
  const childPerms = { ...DEFAULT_CHILD_PERMS, ...(user?.household_child_permissions || {}) };
  const showInvite = isAdult || childPerms.can_view_invite_code;
  const showSharedBills = isAdult || childPerms.can_view_bills;
  const showMoney = isAdult || childPerms.can_view_amounts;

  // Shopping list filtering
  const filteredShoppingItems = shoppingItems.filter((item) => {
    if (shoppingFilter === 'active') return !item.is_completed;
    if (shoppingFilter === 'completed') return item.is_completed;
    return true;
  });
  const activeItems = filteredShoppingItems.filter((i) => !i.is_completed);
  const completedItems = filteredShoppingItems.filter((i) => i.is_completed);

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title={household.name}
        description="Household budget & shared finances"
        actions={
          <Button variant="danger" onClick={() => setShowLeaveConfirm(true)} className="w-full border border-danger-300 bg-surface text-danger-600 hover:bg-danger-50 sm:w-auto">
            <LogOut className="h-4 w-4" />
            Leave Household
          </Button>
        }
      />

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</Card>
      )}
      {success && (
        <Card className="flex items-center gap-2 border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </Card>
      )}

      <FilterChips options={TABS} value={activeTab} onChange={setActiveTab} />

      {/* ========== OVERVIEW TAB ========== */}
      {activeTab === 'overview' && (
        <div className="min-w-0 space-y-5 sm:space-y-6">
          {showMoney && (
            <ProFeatureGate featureKey="household_overview">
              <HouseholdFinancialOverview />
            </ProFeatureGate>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {/* Invite Code */}
            {showInvite ? (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <IconStat icon={UserPlus} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
                  <h2 className="text-title">Invite Code</h2>
                </div>
                <p className="text-body mb-3">Share this code to invite someone.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-xl bg-surface-subtle px-4 py-3 text-center font-mono text-lg font-bold tracking-widest text-foreground ring-1 ring-border">
                    {household.invite_code}
                  </code>
                  <Button variant="ghost" onClick={handleCopyCode} className="min-h-11 px-2.5" title="Copy code" aria-label="Copy invite code">
                    {copied ? <CheckCircle className="h-5 w-5 text-brand-600" /> : <Copy className="h-5 w-5" />}
                  </Button>
                </div>
                {copied && <p className="text-caption mt-2 text-brand-600">Copied to clipboard!</p>}
              </Card>
            ) : (
              <Card className="flex flex-col justify-center p-5 sm:p-6">
                <p className="text-body">Invite code is hidden for your account. Ask a parent or household admin if you need it.</p>
              </Card>
            )}

            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <IconStat icon={Settings} tone="purple" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
                <h2 className="text-title">Split Method</h2>
              </div>
              <p className="text-body mb-3">How bills are split between members.</p>
              <select
                value={household.split_method || 'equal'}
                onChange={handleSplitMethodChange}
                disabled={!isCreator || !isAdult}
                className={cn('form-input', (!isCreator || !isAdult) && 'cursor-not-allowed bg-surface-subtle')}
              >
                <option value="equal">Equal Split</option>
                <option value="proportional">Proportional To Income</option>
                <option value="custom">Custom</option>
              </select>
              {(!isCreator || !isAdult) && (
                <p className="text-caption mt-2">
                  {!isAdult ? 'Only adults can change split settings.' : 'Only the household creator can change this.'}
                </p>
              )}
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconStat icon={Activity} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
                <h2 className="text-title">Activity Feed</h2>
              </div>
              {lastUpdated && (
                <span className="text-caption">
                  Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </span>
              )}
            </div>

            {activities.length === 0 ? (
              <p className="text-body">No activity yet.</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {activities.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-xl bg-surface-subtle/60 px-3 py-2.5">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white', getInitialColor(item.user_first_name))}>
                      {(item.user_first_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{item.user_first_name || 'Someone'}</span>
                        {' '}{item.action}{' '}{item.entity_type.replace(/_/g, ' ')}{' '}
                        <span className="font-medium">&apos;{item.entity_name}&apos;</span>
                        {item.details && <span className="text-muted"> &mdash; {item.details}</span>}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted" />
                        <span className="text-caption">
                          {item.created_at ? formatDistanceToNow(parseISO(item.created_at), { addSuffix: true }) : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========== MEMBERS TAB ========== */}
      {activeTab === 'members' && (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <IconStat icon={Users} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <h2 className="text-title">Members</h2>
              <Badge variant="neutral" className="ml-auto normal-case">
                {(household.members || []).length} member{(household.members || []).length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="space-y-3">
              {(household.members || []).map((member) => (
                <div key={member.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-subtle/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white', getInitialColor(member.first_name))}>
                      {(member.first_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.first_name} {member.last_name}
                        {(member.household_member_role || 'adult') === 'child' && (
                          <Badge variant="warning" className="ml-2 normal-case">Child</Badge>
                        )}
                        {(member.household_member_role || 'adult') === 'adult' && (
                          <Badge variant="info" className="ml-2 normal-case">Adult</Badge>
                        )}
                      </p>
                      <p className="truncate text-caption">{member.email}</p>
                    </div>
                  </div>
                  {isAdult && member.id !== household.created_by && (
                    <div className="flex flex-wrap items-center gap-2 pl-12">
                      <label className="text-caption">Role</label>
                      <select
                        value={member.household_member_role || 'adult'}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="form-input max-w-[8rem] py-1 text-xs"
                      >
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                      </select>
                      {(member.household_member_role || 'adult') === 'child' && (
                        <Button type="button" variant="link" size="sm" onClick={() => openPermModal(member)} className="text-xs">
                          Permissions
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {showInvite && (
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <IconStat icon={UserPlus} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
                <h2 className="text-title">Invite Code</h2>
              </div>
              <p className="text-body mb-3">Share this code to invite someone.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-surface-subtle px-4 py-3 text-center font-mono text-lg font-bold tracking-widest ring-1 ring-border">
                  {household.invite_code}
                </code>
                <Button variant="ghost" onClick={handleCopyCode} className="min-h-11 px-2.5" aria-label="Copy invite code">
                  {copied ? <CheckCircle className="h-5 w-5 text-brand-600" /> : <Copy className="h-5 w-5" />}
                </Button>
              </div>
              {copied && <p className="text-caption mt-2 text-brand-600">Copied to clipboard!</p>}
            </Card>
          )}
        </div>
      )}

      {/* ========== SHARED ITEMS TAB ========== */}
      {activeTab === 'shared' && (
        <div className="space-y-6">
          {/* Shared Bills */}
          {showSharedBills && (
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <IconStat icon={DollarSign} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
                <h2 className="text-title">Shared Bills</h2>
              </div>
              {householdBills.length === 0 ? (
                <p className="text-sm text-muted">No shared bills yet.</p>
              ) : (
                <div className="space-y-4">
                  {householdBills.map((bill) => {
                    const bd = billBreakdowns[bill.id];
                    return (
                      <div key={bill.id} className="rounded-xl border border-border/60 bg-surface-subtle/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{bill.name}</h3>
                            <p className="text-xs text-muted">{bill.category || 'Uncategorized'} &middot; Due {bill.next_due_date ? formatFriendlyDate(bill.next_due_date) : (bill.due_day ? `day ${bill.due_day}` : '--')}</p>
                          </div>
                          <span className="text-sm font-bold text-foreground">
                            {showMoney ? fmtCurrency(bill.amount) : '—'}
                          </span>
                        </div>

                        {bd ? (
                          <>
                            <div className="flex gap-4 mb-3 text-xs">
                              <span className="text-brand-600">Paid: {showMoney ? fmtCurrency(bd.total_paid) : '—'}</span>
                              <span className="text-warning-600">Remaining: {showMoney ? fmtCurrency(bd.total_remaining) : '—'}</span>
                            </div>
                            <div className="space-y-1.5">
                              {bd.members?.map((member) => {
                                const balance = Number(member.balance);
                                const isPaid = balance <= 0;
                                return (
                                  <div key={member.member_id} className="flex items-center justify-between text-sm">
                                    <span className="text-foreground">{member.member_name}</span>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-muted">Share: {showMoney ? fmtCurrency(member.share) : '—'}</span>
                                      <span className="text-muted">Paid: {showMoney ? fmtCurrency(member.paid) : '—'}</span>
                                      {isPaid ? (
                                        <Badge variant="success" className="normal-case gap-1">
                                          <CheckCircle className="h-3 w-3" aria-hidden />
                                          Paid
                                        </Badge>
                                      ) : (
                                        <span className="font-medium text-warning-600">
                                          {showMoney ? `${fmtCurrency(balance)} due` : 'Due'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted">Loading breakdown...</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <IconStat icon={ClipboardList} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <h2 className="text-title">Household Chores</h2>
            </div>
            {isAdult && (
              <form onSubmit={handleCreateChore} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 mb-6 pb-6 border-b border-border">
                <input
                  className={`form-input lg:col-span-4`}
                  placeholder="Chore title"
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                />
                <input
                  type="date"
                  className={`form-input lg:col-span-2`}
                  value={choreDue}
                  onChange={(e) => setChoreDue(e.target.value)}
                />
                <select
                  className={`form-input lg:col-span-3`}
                  value={choreAssign}
                  onChange={(e) => setChoreAssign(e.target.value)}
                >
                  <option value="">Anyone</option>
                  {(household.members || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.first_name}</option>
                  ))}
                </select>
                <select
                  className={`form-input lg:col-span-2`}
                  value={choreRecurring}
                  onChange={(e) => setChoreRecurring(e.target.value)}
                >
                  <option value="">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <Button type="submit" variant="primary" className="lg:col-span-1">
                  Add
                </Button>
              </form>
            )}
            {chores.length === 0 ? (
              <p className="text-sm text-muted">No chores yet.</p>
            ) : (
              <ul className="space-y-2">
                {chores.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface-subtle/40 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted">
                        {c.due_date ? `Due ${c.due_date}` : 'No due date'}
                        {c.recurring ? ` · Repeats ${c.recurring}` : ''}
                        {c.status === 'completed' ? ' · Done' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.status === 'pending' && (isAdult || c.assigned_to === user?.id) && (
                        <button
                          type="button"
                          onClick={() => handleCompleteChore(c.id)}
                          className="min-h-11 px-2 text-xs font-medium text-brand-700 hover:text-brand-800"
                        >
                          Mark done
                        </button>
                      )}
                      {isAdult && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChore(c.id)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
                          aria-label="Delete chore"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <IconStat icon={ShoppingCart} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <h2 className="text-title">Shopping List</h2>
              <Badge variant="neutral" className="ml-auto normal-case">
                {shoppingItems.filter((i) => !i.is_completed).length} active
              </Badge>
            </div>

            {/* Quick add */}
            <form onSubmit={handleAddShoppingItem} className="flex flex-col sm:flex-row gap-2 mb-4 pb-4 border-b border-border">
              <input
                className={`form-input sm:flex-1`}
                placeholder="Add item..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
              />
              <input
                className={`form-input sm:w-24`}
                placeholder="Qty"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
              />
              <select
                className={`form-input sm:w-32`}
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
              >
                <option value="">Category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Button type="submit" variant="primary" className="min-h-[44px]">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </form>

            <FilterChips
              className="mb-4"
              options={[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'completed', label: 'Completed' },
              ]}
              value={shoppingFilter}
              onChange={setShoppingFilter}
            />

            {/* Active items */}
            {activeItems.length > 0 && (
              <ul className="space-y-2 mb-4">
                {activeItems.map((item) => (
                  <li key={item.id} className="border border-border rounded-lg px-3 py-2">
                    {editingItem === item.id ? (
                      <div className="space-y-2">
                        <input
                          className="form-input"
                          value={editForm.item_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, item_name: e.target.value }))}
                          placeholder="Item name"
                        />
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            className={`form-input sm:w-24`}
                            value={editForm.quantity}
                            onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                            placeholder="Qty"
                          />
                          <select
                            className={`form-input sm:w-32`}
                            value={editForm.category}
                            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                          >
                            <option value="">Category</option>
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <input
                            className={`form-input sm:flex-1`}
                            value={editForm.notes}
                            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Notes"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => { setEditingItem(null); setEditForm({}); }}
                            className="min-h-11 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-subtle"
                          >
                            Cancel
                          </button>
                          <Button type="button" variant="accent" size="sm" onClick={handleSaveEdit}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleShoppingItem(item)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-border transition-colors hover:border-brand-500"
                          aria-label="Mark as purchased"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.item_name}</p>
                          <p className="text-xs text-muted">
                            {item.quantity && <span>{item.quantity}</span>}
                            {item.quantity && item.category && <span> &middot; </span>}
                            {item.category && <span>{item.category}</span>}
                            {item.notes && <span className="text-muted"> — {item.notes}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditItem(item)}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent-50 hover:text-accent-600"
                            aria-label="Edit item"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShoppingItem(item.id)}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
                            aria-label="Delete item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Completed items */}
            {completedItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Completed</p>
                <ul className="space-y-2">
                  {completedItems.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border bg-surface-subtle/50 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleShoppingItem(item)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-brand-400 bg-brand-50 transition-colors"
                          aria-label="Mark as active"
                        >
                          <CheckCircle className="h-4 w-4 text-brand-600" aria-hidden />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-muted line-through">{item.item_name}</p>
                          <p className="text-xs text-muted">
                            {item.quantity && <span>{item.quantity}</span>}
                            {item.quantity && item.category && <span> &middot; </span>}
                            {item.category && <span>{item.category}</span>}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteShoppingItem(item.id)}
                          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
                          aria-label="Delete completed item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shoppingItems.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No items yet. Add your first item above.</p>
            )}

            {shoppingFilter !== 'all' && filteredShoppingItems.length === 0 && shoppingItems.length > 0 && (
              <p className="text-sm text-muted text-center py-4">
                No {shoppingFilter} items.
              </p>
            )}
          </Card>
        </div>
      )}

      <Modal
        isOpen={!!permModalMember}
        onClose={() => setPermModalMember(null)}
        title={permModalMember ? `Permissions — ${permModalMember.first_name}` : 'Permissions'}
      >
        {permModalMember && (
          <div className="space-y-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!permDraft.can_view_bills}
                onChange={(e) => setPermDraft((d) => ({ ...d, can_view_bills: e.target.checked }))}
              />
              <span>Can view shared bills</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!permDraft.can_view_amounts}
                onChange={(e) => setPermDraft((d) => ({ ...d, can_view_amounts: e.target.checked }))}
              />
              <span>Can view dollar amounts</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!permDraft.can_view_invite_code}
                onChange={(e) => setPermDraft((d) => ({ ...d, can_view_invite_code: e.target.checked }))}
              />
              <span>Can view invite code</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPermModalMember(null)}>Cancel</Button>
              <Button type="button" variant="accent" onClick={savePermModal}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        title="Leave Household"
        message="Are you sure you want to leave this household? If you're the last member, the household will be deleted."
        confirmText="Leave"
        danger
      />
    </div>
  );
}
