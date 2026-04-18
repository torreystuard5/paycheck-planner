import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Copy, LogOut, Activity, Clock, Settings, CheckCircle, DollarSign, ClipboardList, Trash2 } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import usePolling from '../hooks/usePolling';
import { formatFriendlyDate } from '../utils/formatDate';

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

export default function Household() {
  const { user, updateUser } = useAuth();
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

      // Fetch breakdowns for each household bill
      const breakdowns = {};
      await Promise.allSettled(
        shared.map(async (bill) => {
          try {
            const bdRes = await api.get(`/api/v1/bills/${bill.id}/breakdown`);
            breakdowns[bill.id] = bdRes.data;
          } catch {
            // skip failed breakdowns
          }
        })
      );
      setBillBreakdowns(breakdowns);
    } catch {
      // silent
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await fetchHousehold();
    await fetchActivity();
    await fetchHouseholdBills();
    await fetchChores();
  }, [fetchHousehold, fetchActivity, fetchHouseholdBills, fetchChores]);

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

  const getInitialColor = (name) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500',
      'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-red-500',
    ];
    const idx = (name || '').charCodeAt(0) % colors.length;
    return colors[idx];
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  // No household — show create/join UI
  if (!household) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Household</h1>
          <p className="text-sm text-gray-600 mt-1">Create or join a household to share your budget</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Create Household</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">Start a new household and invite your partner.</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="Household name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Join Household</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">Enter an invite code to join an existing household.</p>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                placeholder="Invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className={inputClass}
                maxLength={8}
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Joining...' : 'Join'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // In household — show full household UI
  const isCreator = household.created_by === user?.id;
  const isAdult = (user?.household_member_role || 'adult') === 'adult';
  const childPerms = { ...DEFAULT_CHILD_PERMS, ...(user?.household_child_permissions || {}) };
  const showInvite = isAdult || childPerms.can_view_invite_code;
  const showSharedBills = isAdult || childPerms.can_view_bills;
  const showMoney = isAdult || childPerms.can_view_amounts;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{household.name}</h1>
          <p className="text-sm text-gray-600 mt-1">Household Budget</p>
        </div>
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Leave Household
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Members */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          </div>
          <div className="space-y-3">
            {(household.members || []).map((member) => (
              <div key={member.id} className="flex flex-col gap-2 border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${getInitialColor(member.first_name)} flex items-center justify-center text-white text-sm font-medium`}>
                    {(member.first_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.first_name} {member.last_name}
                      {(member.household_member_role || 'adult') === 'child' && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Child</span>
                      )}
                      {(member.household_member_role || 'adult') === 'adult' && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Adult</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.email}</p>
                  </div>
                </div>
                {isAdult && member.id !== household.created_by && (
                  <div className="flex flex-wrap items-center gap-2 pl-11">
                    <label className="text-xs text-gray-500">Role</label>
                    <select
                      value={member.household_member_role || 'adult'}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
                    >
                      <option value="adult">Adult</option>
                      <option value="child">Child</option>
                    </select>
                    {(member.household_member_role || 'adult') === 'child' && (
                      <button
                        type="button"
                        onClick={() => openPermModal(member)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Permissions
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Invite Code */}
        {showInvite ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Invite Code</h2>
            </div>
            <p className="text-sm text-gray-600 mb-3">Share this code to invite someone.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-100 px-4 py-2.5 rounded-lg text-lg font-mono font-bold text-gray-900 text-center tracking-widest">
                {household.invite_code}
              </code>
              <button
                onClick={handleCopyCode}
                className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Copy code"
              >
                {copied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            {copied && <p className="text-xs text-green-600 mt-2">Copied to clipboard!</p>}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
            <p className="text-sm text-gray-500">Invite code is hidden for your account. Ask a parent or household admin if you need it.</p>
          </div>
        )}

        {/* Split Method */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Split Method</h2>
          </div>
          <p className="text-sm text-gray-600 mb-3">How bills are split between members.</p>
          <select
            value={household.split_method || 'equal'}
            onChange={handleSplitMethodChange}
            disabled={!isCreator || !isAdult}
            className={`${inputClass} ${(!isCreator || !isAdult) ? 'bg-gray-50 cursor-not-allowed' : ''}`}
          >
            <option value="equal">Equal Split</option>
            <option value="proportional">Proportional To Income</option>
            <option value="custom">Custom</option>
          </select>
          {(!isCreator || !isAdult) && (
            <p className="text-xs text-gray-400 mt-2">
              {!isAdult ? 'Only adults can change split settings.' : 'Only the household creator can change this.'}
            </p>
          )}
        </div>
      </div>

      {/* Household Bills Breakdown */}
      {showSharedBills && householdBills.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Shared Bills</h2>
          </div>
          <div className="space-y-4">
            {householdBills.map((bill) => {
              const bd = billBreakdowns[bill.id];
              return (
                <div key={bill.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{bill.name}</h3>
                      <p className="text-xs text-gray-500">{bill.category || 'Uncategorized'} &middot; Due {bill.next_due_date ? formatFriendlyDate(bill.next_due_date) : (bill.due_day ? `day ${bill.due_day}` : '--')}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      {showMoney ? fmtCurrency(bill.amount) : '—'}
                    </span>
                  </div>

                  {bd ? (
                    <>
                      {/* Summary */}
                      <div className="flex gap-4 mb-3 text-xs">
                        <span className="text-green-600">Paid: {showMoney ? fmtCurrency(bd.total_paid) : '—'}</span>
                        <span className="text-amber-600">Remaining: {showMoney ? fmtCurrency(bd.total_remaining) : '—'}</span>
                      </div>
                      {/* Per-member */}
                      <div className="space-y-1.5">
                        {bd.members?.map((member) => {
                          const balance = Number(member.balance);
                          const isPaid = balance <= 0;
                          return (
                            <div key={member.member_id} className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">{member.member_name}</span>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">Share: {showMoney ? fmtCurrency(member.share) : '—'}</span>
                                <span className="text-gray-500">Paid: {showMoney ? fmtCurrency(member.paid) : '—'}</span>
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                    <CheckCircle className="w-3 h-3" />
                                    Paid
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-medium">
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
                    <p className="text-xs text-gray-400">Loading breakdown...</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chores */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">Household chores</h2>
        </div>
        {isAdult && (
          <form onSubmit={handleCreateChore} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 mb-6 pb-6 border-b border-gray-100">
            <input
              className={`${inputClass} lg:col-span-4`}
              placeholder="Chore title"
              value={choreTitle}
              onChange={(e) => setChoreTitle(e.target.value)}
            />
            <input
              type="date"
              className={`${inputClass} lg:col-span-2`}
              value={choreDue}
              onChange={(e) => setChoreDue(e.target.value)}
            />
            <select
              className={`${inputClass} lg:col-span-3`}
              value={choreAssign}
              onChange={(e) => setChoreAssign(e.target.value)}
            >
              <option value="">Anyone</option>
              {(household.members || []).map((m) => (
                <option key={m.id} value={m.id}>{m.first_name}</option>
              ))}
            </select>
            <select
              className={`${inputClass} lg:col-span-2`}
              value={choreRecurring}
              onChange={(e) => setChoreRecurring(e.target.value)}
            >
              <option value="">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              type="submit"
              className="lg:col-span-1 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
            >
              Add
            </button>
          </form>
        )}
        {chores.length === 0 ? (
          <p className="text-sm text-gray-500">No chores yet.</p>
        ) : (
          <ul className="space-y-2">
            {chores.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{c.title}</p>
                  <p className="text-xs text-gray-500">
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
                      className="text-xs font-medium text-teal-700 hover:text-teal-900"
                    >
                      Mark done
                    </button>
                  )}
                  {isAdult && (
                    <button
                      type="button"
                      onClick={() => handleDeleteChore(c.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Activity Feed</h2>
          </div>
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No Activity Yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-3">
            {activities.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full ${getInitialColor(item.user_first_name)} flex items-center justify-center text-white text-xs font-medium shrink-0`}>
                  {(item.user_first_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{item.user_first_name || 'Someone'}</span>
                    {' '}{item.action}{' '}{item.entity_type.replace(/_/g, ' ')}{' '}
                    <span className="font-medium">&apos;{item.entity_name}&apos;</span>
                    {item.details && <span className="text-gray-500"> &mdash; {item.details}</span>}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {item.created_at ? formatDistanceToNow(parseISO(item.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
              <button type="button" onClick={() => setPermModalMember(null)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              <button type="button" onClick={savePermModal} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
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
