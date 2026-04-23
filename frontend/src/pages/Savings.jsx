import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, PiggyBank, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import SortDropdown from '../components/SortDropdown';
import { formatFriendlyDate } from '../utils/formatDate';
import { formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';
import usePolling from '../hooks/usePolling';

const defaultGoalForm = { name: '', target_amount: '', current_amount: '', target_date: '' };
const defaultContribForm = { goal_id: '', amount: '', pay_period_date: '' };

export default function Savings() {
  const { user } = useAuth();
  const { activeBudget, budgetVersion } = useBudget();
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showContribModal, setShowContribModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalForm, setGoalForm] = useState(defaultGoalForm);
  const [contribForm, setContribForm] = useState(defaultContribForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchData(true);
  }, [sortBy, sortOrder, budgetVersion]);

  const pollData = useCallback(async () => {
    const bq = activeBudget?.id ? `&budget_id=${activeBudget.id}` : '';
    try {
      const goalsRes = await api.get(`/api/v1/savings/goals?sort_by=${sortBy}&sort_order=${sortOrder}${bq}`);
      const goalsData = Array.isArray(goalsRes.data) ? goalsRes.data : [];
      setGoals(goalsData);
      const allContribs = [];
      for (const goal of goalsData.slice(0, 10)) {
        try {
          const cRes = await api.get(`/api/v1/savings/contributions/${goal.id}`);
          const items = Array.isArray(cRes.data) ? cRes.data : [];
          allContribs.push(...items.map(c => ({ ...c, goal_name: goal.name })));
        } catch { /* skip */ }
      }
      setContributions(allContribs);
      setLastUpdated(new Date());
    } catch {
      // silent poll
    }
  }, [sortBy, sortOrder, activeBudget?.id]);

  usePolling(pollData, 30000, !!user?.household_id);

  const fetchData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    const bq = activeBudget?.id ? `&budget_id=${activeBudget.id}` : '';
    try {
      const goalsRes = await api.get(`/api/v1/savings/goals?sort_by=${sortBy}&sort_order=${sortOrder}${bq}`);
      const goalsData = Array.isArray(goalsRes.data) ? goalsRes.data : [];
      setGoals(goalsData);
      const allContribs = [];
      for (const goal of goalsData.slice(0, 10)) {
        try {
          const cRes = await api.get(`/api/v1/savings/contributions/${goal.id}`);
          const items = Array.isArray(cRes.data) ? cRes.data : [];
          allContribs.push(...items.map(c => ({ ...c, goal_name: goal.name })));
        } catch { /* skip */ }
      }
      setContributions(allContribs);
    } catch {
      setError('Failed to load savings data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const openAddGoal = () => { setEditingGoal(null); setGoalForm(defaultGoalForm); setShowGoalModal(true); };
  const openEditGoal = (goal) => {
    setEditingGoal(goal);
    setGoalForm({
      name: goal.name || '',
      target_amount: goal.target_amount || '',
      current_amount: goal.current_amount || '',
      target_date: goal.target_date || '',
    });
    setShowGoalModal(true);
  };

  const openAddContrib = () => {
    setContribForm({ ...defaultContribForm, pay_period_date: new Date().toISOString().split('T')[0] });
    setShowContribModal(true);
  };

  const handleGoalSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: goalForm.name || null,
        target_amount: goalForm.target_amount ? parseFloat(goalForm.target_amount) : null,
        target_date: goalForm.target_date || null,
      };
      if (editingGoal) {
        payload.current_amount = parseFloat(goalForm.current_amount || 0);
      }
      if (editingGoal) {
        await api.put(`/api/v1/savings/goals/${editingGoal.id}`, payload);
      } else {
        await api.post('/api/v1/savings/goals', payload);
      }
      setShowGoalModal(false);
      fetchData();
    } catch {
      setError('Failed to save goal.');
    } finally {
      setSaving(false);
    }
  };

  const handleContribSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/v1/savings/contributions', {
        goal_id: contribForm.goal_id,
        amount: contribForm.amount ? parseFloat(contribForm.amount) : null,
        pay_period_date: contribForm.pay_period_date || null,
      });
      setShowContribModal(false);
      fetchData();
    } catch {
      setError('Failed to add contribution.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/savings/goals/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      setError('Failed to delete goal.');
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Savings Goals</h1>
            <p className="text-sm text-gray-600 mt-1">Set goals and track your progress</p>
            {lastUpdated && user?.household_id && (
              <p className="text-xs text-gray-400 mt-0.5">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
              options={[
                { value: 'name', label: 'Name' },
                { value: 'current_amount', label: 'Current Amount' },
                { value: 'target_amount', label: 'Target Amount' },
                { value: 'created_at', label: 'Date Added' },
              ]}
            />
            <button onClick={openAddContrib} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Contribution
            </button>
            <button onClick={openAddGoal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Goal
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No Savings Goals" message="Create a savings goal to start tracking your progress." actionLabel="Add Goal" onAction={openAddGoal} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const target = Number(goal.target_amount) || 0;
            const current = Number(goal.current_amount) || 0;
            const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const isExpanded = expandedId === goal.id;
            const goalContribs = contributions.filter(c => c.goal_id === goal.id);

            return (
              <div key={goal.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4">
                  {/* Line 1: Name + actions */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900 truncate">{goal.name}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditGoal(goal)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(goal)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : goal.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Line 2: Progress */}
                  <div className="mt-3">
                    <div className="flex justify-between text-sm mb-1">
                      <CurrencyDisplay amount={goal.current_amount || 0} className="text-gray-700" />
                      <CurrencyDisplay amount={goal.target_amount} className="text-gray-700" />
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">{(isFinite(progress) ? progress : 0).toFixed(1)}%</p>
                  </div>

                  {/* Line 3: Target date */}
                  {goal.target_date && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1.5">
                      <Calendar className="w-3 h-3" />
                      Target: {formatFriendlyDate(goal.target_date)}
                    </div>
                  )}
                </div>

                {/* Expanded section */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: isExpanded ? '400px' : '0px', opacity: isExpanded ? 1 : 0 }}
                >
                  <div className="px-4 pb-4">
                    <div className="border-t border-gray-200 pt-3 space-y-3">
                      {goal.created_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Created</span>
                          <span className="text-gray-700">{formatFriendlyDate(goal.created_at)}</span>
                        </div>
                      )}
                      {goalContribs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Contributions</p>
                          <div className="space-y-1.5">
                            {goalContribs.slice(0, 5).map((c) => (
                              <div key={c.id} className="flex justify-between text-sm">
                                <span className="text-gray-600">{c.pay_period_date ? formatFriendlyDate(c.pay_period_date) : '--'}</span>
                                <CurrencyDisplay amount={c.amount} className="font-medium text-green-600" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contributions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Contributions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-600 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Goal</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-3 text-gray-900">{c.pay_period_date ? formatFriendlyDate(c.pay_period_date) : '--'}</td>
                    <td className="py-3 text-gray-700">{c.goal_name || goals.find(g => g.id === c.goal_id)?.name || '--'}</td>
                    <td className="py-3 text-right">
                      <CurrencyDisplay amount={c.amount} className="font-medium text-green-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title={editingGoal ? 'Edit Goal' : 'Add Goal'}>
        <form onSubmit={handleGoalSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Amount</label>
              <input type="number" step="0.01" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Amount</label>
              <input type="number" step="0.01" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
            <DateInput value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowGoalModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingGoal ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showContribModal} onClose={() => setShowContribModal(false)} title="Add Contribution">
        <form onSubmit={handleContribSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Goal</label>
            <select value={contribForm.goal_id} onChange={(e) => setContribForm({ ...contribForm, goal_id: e.target.value })} className={inputClass}>
              <option value="">Select a goal</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={contribForm.amount} onChange={(e) => setContribForm({ ...contribForm, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period Date</label>
              <DateInput value={contribForm.pay_period_date} onChange={(e) => setContribForm({ ...contribForm, pay_period_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowContribModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Add Contribution'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Goal"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
