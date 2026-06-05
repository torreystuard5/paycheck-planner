import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit, Trash2, PiggyBank, Calendar, ChevronDown, ChevronUp, TrendingUp, Target } from 'lucide-react';
import SortDropdown from '../components/SortDropdown';
import { formatFriendlyDate } from '../utils/formatDate';
import { getGoalProgress, getGoalVisual, estimateProjectedDate } from '../utils/savingsGoalMeta';
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
import {
  Badge,
  Button,
  Card,
  IconStat,
  PageHeader,
  ProgressRing,
  cn,
} from '../components/ui';

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

  const summary = useMemo(() => {
    const totalSaved = goals.reduce((s, g) => s + (Number(g.current_amount) || 0), 0);
    const totalTarget = goals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0);
    const completed = goals.filter((g) => {
      const t = Number(g.target_amount) || 0;
      const c = Number(g.current_amount) || 0;
      return t > 0 && c >= t;
    }).length;
    return { totalSaved, totalTarget, completed };
  }, [goals]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title="Savings Goals"
        description="Set goals and watch your progress grow"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
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
            <Button variant="primary" onClick={openAddContrib} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Contribution
            </Button>
            <Button variant="accent" onClick={openAddGoal} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Goal
            </Button>
          </div>
        }
      />
      {lastUpdated && user?.household_id && (
        <p className="text-caption -mt-2">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</p>
      )}

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</Card>
      )}

      {goals.length > 0 && (
        <div className="card-grid">
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <IconStat icon={PiggyBank} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">Total saved</p>
            </div>
            <CurrencyDisplay amount={summary.totalSaved} className="text-money block text-brand-600" />
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <IconStat icon={Target} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">Total target</p>
            </div>
            <CurrencyDisplay amount={summary.totalTarget} className="text-money block" />
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <IconStat icon={TrendingUp} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">Goals complete</p>
            </div>
            <p className="text-money">{summary.completed}<span className="text-lg font-medium text-muted"> / {goals.length}</span></p>
          </Card>
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No Savings Goals" message="Create a savings goal to start tracking your progress." actionLabel="Add Goal" onAction={openAddGoal} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => {
            const progress = getGoalProgress(goal);
            const isExpanded = expandedId === goal.id;
            const goalContribs = contributions.filter((c) => c.goal_id === goal.id);
            const { icon: GoalIcon, tone } = getGoalVisual(goal.name);
            const projection = estimateProjectedDate(goal, contributions);
            const remaining = Math.max((Number(goal.target_amount) || 0) - (Number(goal.current_amount) || 0), 0);

            return (
              <Card
                key={goal.id}
                className={cn(
                  'overflow-hidden transition-shadow hover:shadow-[var(--shadow-card-hover)]',
                  progress >= 100 && 'ring-1 ring-brand-200',
                )}
              >
                <div className="bg-gradient-to-br from-brand-50/80 to-surface p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <ProgressRing progress={progress} tone={tone} size={92}>
                      <GoalIcon className="h-5 w-5 text-brand-600" strokeWidth={2} />
                      <span className="mt-0.5 text-xs font-bold tabular-nums text-brand-700">
                        {progress.toFixed(0)}%
                      </span>
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-base font-semibold text-foreground">{goal.name}</h3>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => openEditGoal(goal)} className="min-h-8 px-1.5" aria-label="Edit goal">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(goal)} className="min-h-8 px-1.5 text-danger-600" aria-label="Delete goal">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : goal.id)}
                            className="min-h-8 px-1.5"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      {progress >= 100 ? (
                        <Badge variant="success" className="mt-2 normal-case">Goal reached!</Badge>
                      ) : (
                        <Badge variant="neutral" className="mt-2 normal-case">
                          {remaining > 0 ? `${remaining.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} to go` : 'In progress'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-surface/80 px-3 py-2 ring-1 ring-border/60">
                      <p className="text-caption">Saved</p>
                      <CurrencyDisplay amount={goal.current_amount || 0} className="text-sm font-bold text-brand-600" />
                    </div>
                    <div className="rounded-lg bg-surface/80 px-3 py-2 ring-1 ring-border/60">
                      <p className="text-caption">Target</p>
                      <CurrencyDisplay amount={goal.target_amount} className="text-sm font-bold" />
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-subtle ring-1 ring-border/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {projection && (
                    <div className="mt-3 flex items-center gap-1.5 text-caption">
                      <Calendar className="h-3.5 w-3.5 text-muted" />
                      {projection.complete ? (
                        <span className="font-medium text-brand-600">{projection.label}</span>
                      ) : (
                        <span>
                          {projection.isTarget ? 'Target date' : 'Projected completion'}
                          {': '}
                          <span className="font-medium text-foreground">
                            {formatFriendlyDate(projection.label)}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: isExpanded ? '400px' : '0px', opacity: isExpanded ? 1 : 0 }}
                >
                  <div className="border-t border-border px-5 pb-5 pt-3 sm:px-6">
                    {goal.created_at && (
                      <div className="mb-3 flex justify-between text-sm">
                        <span className="text-muted">Created</span>
                        <span>{formatFriendlyDate(goal.created_at)}</span>
                      </div>
                    )}
                    {goalContribs.length > 0 && (
                      <div>
                        <p className="text-caption mb-2 font-semibold uppercase tracking-wide">Recent contributions</p>
                        <div className="space-y-2">
                          {goalContribs.slice(0, 5).map((c) => (
                            <div key={c.id} className="flex justify-between rounded-lg bg-surface-subtle px-3 py-2 text-sm">
                              <span className="text-muted">
                                {c.pay_period_date ? formatFriendlyDate(c.pay_period_date) : '--'}
                              </span>
                              <CurrencyDisplay amount={c.amount} className="font-semibold text-brand-600" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {contributions.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-title">Recent Contributions</h2>
            <p className="text-caption mt-0.5">Latest deposits across all goals</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle/60">
                  <th className="px-5 py-3 text-left font-medium text-muted sm:px-6">Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted sm:px-6">Goal</th>
                  <th className="px-5 py-3 text-right font-medium text-muted sm:px-6">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 sm:px-6">{c.pay_period_date ? formatFriendlyDate(c.pay_period_date) : '--'}</td>
                    <td className="px-5 py-3 sm:px-6">{c.goal_name || goals.find((g) => g.id === c.goal_id)?.name || '--'}</td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <CurrencyDisplay amount={c.amount} className="font-semibold text-brand-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title={editingGoal ? 'Edit Goal' : 'Add Goal'}>
        <form onSubmit={handleGoalSubmit} className="space-y-4">
          <div>
            <label className="form-label">Name</label>
            <input type="text" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} className="form-input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">Target Amount</label>
              <input type="number" step="0.01" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">Current Amount</label>
              <input type="number" step="0.01" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Target Date</label>
            <DateInput value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} className="form-input" />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="ghost" onClick={() => setShowGoalModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={saving}>
              {saving ? 'Saving...' : editingGoal ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showContribModal} onClose={() => setShowContribModal(false)} title="Add Contribution">
        <form onSubmit={handleContribSubmit} className="space-y-4">
          <div>
            <label className="form-label">Goal</label>
            <select value={contribForm.goal_id} onChange={(e) => setContribForm({ ...contribForm, goal_id: e.target.value })} className="form-input">
              <option value="">Select a goal</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">Amount</label>
              <input type="number" step="0.01" value={contribForm.amount} onChange={(e) => setContribForm({ ...contribForm, amount: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">Pay Period Date</label>
              <DateInput value={contribForm.pay_period_date} onChange={(e) => setContribForm({ ...contribForm, pay_period_date: e.target.value })} className="form-input" />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="ghost" onClick={() => setShowContribModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Contribution'}
            </Button>
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
