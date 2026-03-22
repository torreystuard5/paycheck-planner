import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Copy, LogOut, Activity, Clock, Settings, CheckCircle, DollarSign } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import usePolling from '../hooks/usePolling';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export default function Household() {
  const { user } = useAuth();
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
  }, [fetchHousehold, fetchActivity, fetchHouseholdBills]);

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
              <div key={member.id} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full ${getInitialColor(member.first_name)} flex items-center justify-center text-white text-sm font-medium`}>
                  {(member.first_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.first_name} {member.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Code */}
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
            disabled={!isCreator}
            className={`${inputClass} ${!isCreator ? 'bg-gray-50 cursor-not-allowed' : ''}`}
          >
            <option value="equal">Equal Split</option>
            <option value="proportional">Proportional to Income</option>
            <option value="custom">Custom</option>
          </select>
          {!isCreator && (
            <p className="text-xs text-gray-400 mt-2">Only the household creator can change this.</p>
          )}
        </div>
      </div>

      {/* Household Bills Breakdown */}
      {householdBills.length > 0 && (
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
                      <p className="text-xs text-gray-500">{bill.category || 'Uncategorized'} &middot; Due day {bill.due_day}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{fmtCurrency(bill.amount)}</span>
                  </div>

                  {bd ? (
                    <>
                      {/* Summary */}
                      <div className="flex gap-4 mb-3 text-xs">
                        <span className="text-green-600">Paid: {fmtCurrency(bd.total_paid)}</span>
                        <span className="text-amber-600">Remaining: {fmtCurrency(bd.total_remaining)}</span>
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
                                <span className="text-gray-500">Share: {fmtCurrency(member.share)}</span>
                                <span className="text-gray-500">Paid: {fmtCurrency(member.paid)}</span>
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                    <CheckCircle className="w-3 h-3" />
                                    Paid
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-medium">
                                    {fmtCurrency(balance)} due
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
          <p className="text-sm text-gray-500">No activity yet.</p>
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
