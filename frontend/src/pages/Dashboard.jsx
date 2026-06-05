import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  FileText,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Calendar,
  AlertCircle,
  Users,
  Activity,
  Clock,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Square,
  CheckSquare,
  EyeOff,
  Eye,
} from 'lucide-react';
import { parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import PaycheckPlanItemActions from '../components/PaycheckPlanItemActions';
import usePolling from '../hooks/usePolling';
import { formatDate, formatPaycheckDate } from '../utils/formatDate';
import { augmentPaycheckPlan } from '../utils/paycheckPlanItems';
import { formatApiError } from '../utils/formatApiError';
import {
  Badge,
  Button,
  Card,
  CollapsibleCard,
  IconStat,
  PageHeader,
  cn,
} from '../components/ui';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const creditRatingMeta = (pct) => {
  const v = Number(pct || 0);
  if (v < 10) return { label: 'Excellent', variant: 'success', bar: 'bg-brand-500' };
  if (v < 30) return { label: 'Good', variant: 'success', bar: 'bg-brand-500' };
  if (v < 50) return { label: 'Fair', variant: 'warning', bar: 'bg-warning-600' };
  if (v < 75) return { label: 'Poor', variant: 'debt', bar: 'bg-debt-500' };
  return { label: 'Critical', variant: 'danger', bar: 'bg-danger-500' };
};

function SummaryStatCard({ label, value, count, icon, tone, subtitle, paidSubtitle, onClick }) {
  return (
    <Card
      variant="interactive"
      onClick={onClick}
      className="p-4 sm:p-5"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium">{label}</p>
          {value !== null && value !== undefined ? (
            <CurrencyDisplay amount={value} className="text-money mt-1 block break-words" />
          ) : (
            <p className="text-money mt-1">{count}</p>
          )}
          {subtitle && (
            <p className="text-caption mt-2 flex min-w-0 items-center gap-1 text-brand-600">
              <CheckCircle className="h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{subtitle}</span>
            </p>
          )}
          {paidSubtitle && (
            <p className="text-caption mt-1 flex min-w-0 items-center gap-1 text-accent-600">
              <DollarSign className="h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{paidSubtitle}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <IconStat icon={icon} tone={tone} />
          <ChevronRight className="h-4 w-4 text-muted" />
        </div>
      </div>
    </Card>
  );
}

function MetricRow({ label, value, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-body">{label}</span>
      <span className={cn('text-sm font-semibold text-foreground tabular-nums', valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function PaycheckMetricGrid({ current }) {
  const remaining = Number(current.remaining);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card variant="inset" className="p-3">
        <p className="text-caption">Pay Period</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {formatPaycheckDate(current.paycheck_date)}
        </p>
      </Card>
      <Card variant="inset" className="p-3">
        <p className="text-caption">Paycheck Amount</p>
        <CurrencyDisplay
          amount={current.paycheck_amount}
          className="mt-1 block text-sm font-semibold text-foreground"
        />
      </Card>
      <Card variant="inset" className="p-3">
        <p className="text-caption">Total Due</p>
        <CurrencyDisplay
          amount={current.total_due}
          className="mt-1 block text-sm font-semibold text-foreground"
        />
      </Card>
      <Card variant="inset" className="p-3">
        <p className="text-caption">Remaining</p>
        <CurrencyDisplay
          amount={current.remaining}
          className={cn(
            'mt-1 block text-sm font-semibold',
            remaining >= 0 ? 'text-brand-600' : 'text-danger-600',
          )}
        />
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { activeBudget, budgetVersion, bumpBudgetVersion, loading: budgetLoading } = useBudget();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.app_mode === 'business') {
      navigate('/business/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [incomeSummary, setIncomeSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [paycheckPlan, setPaycheckPlan] = useState(null);
  const [creditScore, setCreditScore] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [household, setHousehold] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [checklistLoading, setChecklistLoading] = useState({});
  const [showHiddenOverdue, setShowHiddenOverdue] = useState(false);
  const [hidingOverdue, setHidingOverdue] = useState({});
  const [overrideBusyKey, setOverrideBusyKey] = useState(null);

  const assignItemKey = useCallback((item) => `${item.item_type}_${item.id || item.item_id}`, []);
  const assignItemPaid = useCallback(
    (item) => Boolean(item.is_paid) || Boolean(checklist[assignItemKey(item)]),
    [assignItemKey, checklist],
  );

  const [collapsedSections, setCollapsedSections] = useState([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const { data } = await api.get('/api/v1/users/me/ui-preferences');
        setCollapsedSections(data.collapsed_sections || []);
      } catch { /* defaults */ }
      setSectionsLoaded(true);
    };
    loadPrefs();
  }, []);

  const toggleSection = async (key) => {
    const updated = collapsedSections.includes(key)
      ? collapsedSections.filter((k) => k !== key)
      : [...collapsedSections, key];
    setCollapsedSections(updated);
    try {
      await api.patch('/api/v1/users/me/ui-preferences', { collapsed_sections: updated });
    } catch { /* ignore */ }
  };

  const fetchDashboardData = useCallback(async () => {
    if (user?.app_mode === 'business') return;
    setError(null);
    const budgetId = activeBudget?.id || localStorage.getItem('active_budget_id');
    const bq = budgetId ? `budget_id=${budgetId}` : '';
    const sep = (url) => (url.includes('?') ? `${url}&${bq}` : `${url}?${bq}`);
    try {
      const [incomeRes, billsRes, debtsRes, savingsRes, paymentsRes] = await Promise.allSettled([
        api.get(bq ? sep('/api/v1/paycheck-entries/monthly-summary') : '/api/v1/paycheck-entries/monthly-summary'),
        api.get(bq ? `/api/v1/bills?${bq}` : '/api/v1/bills'),
        api.get(bq ? `/api/v1/debts?${bq}` : '/api/v1/debts'),
        api.get(bq ? `/api/v1/savings/goals?${bq}` : '/api/v1/savings/goals'),
        api.get(bq ? `/api/v1/payments?limit=5&${bq}` : '/api/v1/payments?limit=5'),
      ]);

      if (incomeRes.status === 'fulfilled') setIncomeSummary(incomeRes.value.data || null);
      if (billsRes.status === 'fulfilled') setBills(billsRes.value.data || []);
      if (debtsRes.status === 'fulfilled') setDebts(debtsRes.value.data || []);
      if (savingsRes.status === 'fulfilled') setSavingsGoals(savingsRes.value.data || []);
      if (paymentsRes.status === 'fulfilled') setRecentPayments(paymentsRes.value.data || []);

      const planUrl = bq
        ? `/api/v1/paycheck-plan?periods=4&${bq}`
        : '/api/v1/paycheck-plan?periods=4';
      const [planRes, creditRes] = await Promise.allSettled([
        api.get(planUrl),
        api.get('/api/v1/debts/credit-efficiency'),
      ]);

      if (planRes.status === 'fulfilled') {
        const planData = augmentPaycheckPlan(planRes.value.data);
        setPaycheckPlan(planData);
        setChecklist({});
      } else {
        console.error('Paycheck plan fetch failed:', planRes.reason);
        const msg = formatApiError(planRes.reason);
        setError(msg || 'Failed to load paycheck plan.');
      }
      if (creditRes.status === 'fulfilled') setCreditScore(creditRes.value.data);

      try {
        const hhRes = await api.get('/api/v1/households/me');
        setHousehold(hhRes.data);
        try {
          const actRes = await api.get('/api/v1/households/activity?limit=5');
          setRecentActivity(actRes.data.activities || []);
        } catch { /* optional */ }
      } catch {
        setHousehold(null);
        setRecentActivity([]);
      }

      setLastUpdated(new Date());
    } catch {
      setError('Failed to load dashboard data.');
    }
  }, [user?.app_mode, activeBudget?.id]);

  useEffect(() => {
    if (budgetLoading) return;
    const init = async () => {
      setLoading(true);
      await fetchDashboardData();
      setLoading(false);
    };
    init();
  }, [fetchDashboardData, budgetVersion, budgetLoading]);

  usePolling(fetchDashboardData, 30000, !!household && user?.app_mode !== 'business');

  const toggleChecklistItem = async (item, payPeriodStart) => {
    const key = assignItemKey(item);
    const currentState = Boolean(item.is_paid) || !!checklist[key];
    const newState = !currentState;

    setChecklist((prev) => ({ ...prev, [key]: newState }));
    setChecklistLoading((prev) => ({ ...prev, [key]: true }));

    try {
      await api.put('/api/v1/paycheck-checklist', {
        item_type: item.item_type,
        item_id: item.id || item.item_id,
        pay_period_start: payPeriodStart,
        is_checked: newState,
      });
      await fetchDashboardData();
      bumpBudgetVersion();
    } catch {
      setChecklist((prev) => ({ ...prev, [key]: currentState }));
    } finally {
      setChecklistLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const overrideItemKey = (item) =>
    `${item.item_type}_${item.id || item.item_id}_${item.occurrence_due_date || item.due_date}`;

  const handlePullForward = async (item) => {
    const key = overrideItemKey(item);
    setOverrideBusyKey(key);
    try {
      await api.post('/api/v1/paycheck-plan/overrides', {
        item_type: item.item_type,
        item_id: item.id || item.item_id,
        occurrence_due_date: item.occurrence_due_date || item.due_date,
        budget_id: activeBudget?.id || undefined,
        target_pay_period_start: paycheckPlan?.paychecks?.[0]?.pay_period_start
          || paycheckPlan?.paychecks?.[0]?.paycheck_date,
      });
      await fetchDashboardData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not pull item into current paycheck.');
    } finally {
      setOverrideBusyKey(null);
    }
  };

  const handleRevertOverride = async (item) => {
    const key = overrideItemKey(item);
    setOverrideBusyKey(key);
    try {
      if (item.override_id) {
        const bq = activeBudget?.id ? `?budget_id=${activeBudget.id}` : '';
        await api.delete(`/api/v1/paycheck-plan/overrides/${item.override_id}${bq}`);
      } else {
        await api.post('/api/v1/pay-periods/revert-pull-forward', {
          item_type: item.item_type,
          item_id: item.id || item.item_id,
          occurrence_due_date: item.occurrence_due_date || item.due_date,
          budget_id: activeBudget?.id || undefined,
        });
      }
      await fetchDashboardData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not return item to original paycheck.');
    } finally {
      setOverrideBusyKey(null);
    }
  };

  const toggleHideOverdue = async (billId, currentlyHidden) => {
    const action = currentlyHidden ? 'unhide-overdue' : 'hide-overdue';
    setHidingOverdue((prev) => ({ ...prev, [billId]: true }));
    try {
      await api.patch(`/api/v1/bills/${billId}/${action}`);
      await fetchDashboardData();
    } catch { /* ignore */ } finally {
      setHidingOverdue((prev) => ({ ...prev, [billId]: false }));
    }
  };

  if (loading || !sectionsLoaded) return <LoadingSpinner />;

  const totalIncome = incomeSummary ? Number(incomeSummary.total_net) || 0 : 0;
  const incomePaycheckCount = incomeSummary ? incomeSummary.paycheck_count || 0 : 0;
  const totalBills = Array.isArray(bills)
    ? bills.filter((b) => b.is_user_responsible !== false).reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0)
    : 0;
  const activeDebts = Array.isArray(debts) ? debts.filter((d) => Number(d.balance) > 0) : [];
  const totalDebt = activeDebts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
  const debtsPaidThisPeriod = activeDebts.filter((d) => d.is_paid_this_period).length;
  const totalDebtCount = activeDebts.length;
  const savingsCount = Array.isArray(savingsGoals) ? savingsGoals.length : 0;

  const billsThisMonth = Array.isArray(bills) ? bills.filter((b) => b.is_user_responsible !== false) : [];
  const paidBills = billsThisMonth.filter((b) => b.is_paid);
  const paidCount = paidBills.length;
  const totalBillCount = billsThisMonth.length;

  const getBillSubtitle = () => {
    if (totalBillCount === 0) return null;
    const paidBillsTotal = paidBills.reduce((s, b) => s + (Number(b.user_share ?? b.amount) || 0), 0);
    return `${paidCount}/${totalBillCount} bills paid \u00b7 ${fmtCurrency(paidBillsTotal)} of ${fmtCurrency(totalBills)}`;
  };

  const hasPaycheckPlan =
    Boolean(paycheckPlan)
    && (
      Boolean(paycheckPlan.current_paycheck)
      || (Array.isArray(paycheckPlan.paychecks) && paycheckPlan.paychecks.length > 0)
      || paycheckPlan.current_paycheck_date
    );
  const currentPaycheckItems =
    paycheckPlan?.current_paycheck?.assigned_items
    || paycheckPlan?.paychecks?.[0]?.assigned_items
    || [];
  const billItemsInPlan = currentPaycheckItems.filter((i) => i.item_type === 'bill');
  const debtItemsInPlan = currentPaycheckItems.filter((i) => i.item_type === 'debt');

  const billsTotalInPlan = billItemsInPlan.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const billsPaidInPlan = billItemsInPlan
    .filter((i) => assignItemPaid(i))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const debtTotalInPlan = debtItemsInPlan.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const debtPaidInPlan = debtItemsInPlan
    .filter((i) => assignItemPaid(i))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const billsPaidSubtitle = billItemsInPlan.length > 0
    ? `${fmtCurrency(billsPaidInPlan)} of ${fmtCurrency(billsTotalInPlan)} paid`
    : null;
  const debtPaidSubtitle = debtItemsInPlan.length > 0
    ? `${fmtCurrency(debtPaidInPlan)} of ${fmtCurrency(debtTotalInPlan)} paid this period`
    : null;

  const cardLinks = {
    'Total Income': '/income',
    'Total Bills': '/bills-debts?tab=bills',
    'Total Debt': '/bills-debts?tab=debts',
    'Savings Goals': '/savings',
  };

  const summaryCards = [
    {
      label: 'Total Income',
      value: totalIncome,
      icon: DollarSign,
      tone: 'brand',
      subtitle: incomePaycheckCount > 0
        ? `${incomePaycheckCount} paycheck${incomePaycheckCount !== 1 ? 's' : ''} this month`
        : 'No paychecks logged',
    },
    {
      label: 'Total Bills',
      value: totalBills,
      icon: FileText,
      tone: 'accent',
      subtitle: getBillSubtitle(),
      paidSubtitle: billsPaidSubtitle,
    },
    {
      label: 'Total Debt',
      value: totalDebt,
      icon: CreditCard,
      tone: 'debt',
      subtitle: totalDebtCount > 0 ? `${debtsPaidThisPeriod}/${totalDebtCount} paid this month` : null,
      paidSubtitle: debtPaidSubtitle,
    },
    {
      label: 'Savings Goals',
      value: null,
      count: savingsCount,
      icon: PiggyBank,
      tone: 'purple',
    },
  ];

  const paymentTypeBadge = (payment) => {
    if (payment.bill_id) return { label: 'Bill', variant: 'info' };
    if (payment.debt_id) return { label: 'Debt', variant: 'debt' };
    return { label: 'Payment', variant: 'neutral' };
  };

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title={`Welcome back${user?.first_name ? `, ${user.first_name}` : ''}`}
        description="Here's your financial overview"
        actions={
          household ? (
            <Badge variant="info" className="gap-1.5 px-3 py-1">
              <Users className="h-3.5 w-3.5" />
              Household Budget
            </Badge>
          ) : null
        }
      >
        {lastUpdated && household && (
          <p className="text-caption mt-1">
            Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </p>
        )}
      </PageHeader>

      {error && (
        <Card className="flex items-center gap-3 border-danger-200 bg-danger-50 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-danger-600" />
          <p className="text-sm text-danger-700">{error}</p>
        </Card>
      )}

      <div className="card-grid">
        {summaryCards.map((card) => (
          <SummaryStatCard
            key={card.label}
            {...card}
            onClick={() => navigate(cardLinks[card.label])}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <CollapsibleCard
          sectionKey="paycheck_plan"
          title="Current Paycheck Plan"
          icon={Calendar}
          iconTone="accent"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          {paycheckPlan?.current_paycheck_date && (
            <Card variant="inset" className="mb-4 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption">Current Paycheck</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatPaycheckDate(paycheckPlan.current_paycheck_date)}
                </span>
              </div>
              {paycheckPlan.next_paycheck_date && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
                  <span className="text-caption">Next Paycheck</span>
                  <span className="text-sm text-muted">
                    {formatPaycheckDate(paycheckPlan.next_paycheck_date)}
                  </span>
                </div>
              )}
            </Card>
          )}

          {hasPaycheckPlan ? (
            <div className="space-y-4">
              {(() => {
                const current = paycheckPlan.current_paycheck || paycheckPlan.paychecks[0];
                const payPeriodStart = current.pay_period_start || current.paycheck_date;
                const assignedItems = Array.isArray(current.assigned_items) ? current.assigned_items : [];

                const visibleItems = assignedItems.filter(
                  (item) => !(item.is_overdue && item.hidden_overdue && !assignItemPaid(item)),
                );
                const hiddenOverdueItems = assignedItems.filter(
                  (item) => item.is_overdue && item.hidden_overdue && !assignItemPaid(item),
                );

                const sortedItems = [...visibleItems].sort((a, b) => {
                  const aChecked = assignItemPaid(a);
                  const bChecked = assignItemPaid(b);
                  if (aChecked !== bChecked) return aChecked ? 1 : -1;
                  return new Date(a.due_date) - new Date(b.due_date);
                });

                const checkedCount = current.assigned_paid_count ?? visibleItems.filter((item) => assignItemPaid(item)).length;
                const totalItems = current.assigned_total_count ?? visibleItems.length;
                const progressPct = current.assigned_progress_percent ?? (totalItems > 0 ? (checkedCount / totalItems) * 100 : 0);

                const totalAssignedAmount = Number(current.assigned_total_amount ?? visibleItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
                const paidAmount = Number(current.assigned_paid_amount ?? visibleItems.filter((item) => assignItemPaid(item)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
                const stillOwed = Number(current.assigned_still_owed ?? (totalAssignedAmount - paidAmount));

                return (
                  <>
                    <PaycheckMetricGrid current={current} />

                    {totalItems > 0 && (
                      <div className="border-t border-border pt-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">Assigned Items</p>
                          <Badge variant="success" className="normal-case">
                            {checkedCount}/{totalItems} paid
                          </Badge>
                        </div>

                        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
                          <span className="font-semibold text-brand-600">
                            Paid: {fmtCurrency(paidAmount)}
                          </span>
                          <span className="text-muted">of {fmtCurrency(totalAssignedAmount)}</span>
                          <span className="text-muted">·</span>
                          <span className="font-semibold text-warning-600">
                            Still owed: {fmtCurrency(stillOwed)}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {sortedItems.map((item) => {
                            const key = assignItemKey(item);
                            const isChecked = assignItemPaid(item);
                            const isToggling = !!checklistLoading[key];
                            const isSplit = item.is_split || (item.split_count && item.split_count > 1);
                            const isHiding = !!hidingOverdue[item.id || item.item_id];

                            return (
                              <div
                                key={key}
                                className={cn(
                                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors',
                                  item.is_overdue && !isChecked && 'border-l-2 border-danger-500 bg-danger-50',
                                  isChecked && 'bg-surface-subtle',
                                  !isChecked && !item.is_overdue && 'hover:bg-surface-subtle',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleChecklistItem(item, payPeriodStart)}
                                  disabled={isToggling}
                                  className={cn(
                                    'shrink-0 transition-colors',
                                    isToggling && 'opacity-50',
                                    isChecked ? 'text-brand-600' : 'text-muted hover:text-foreground',
                                  )}
                                  aria-label={isChecked ? 'Mark unpaid' : 'Mark paid'}
                                >
                                  {isChecked ? (
                                    <CheckSquare className="h-4 w-4" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span
                                      className={cn(
                                        'truncate font-medium',
                                        isChecked ? 'text-muted line-through' : 'text-foreground',
                                      )}
                                    >
                                      {item.name}
                                    </span>
                                    {item.is_overdue && !isChecked && (
                                      <Badge variant="danger" className="normal-case px-1.5 py-0 text-[10px]">
                                        Overdue
                                      </Badge>
                                    )}
                                    {item.pulled_forward && (
                                      <Badge variant="warning" className="normal-case px-1.5 py-0 text-[10px]">
                                        Pulled forward
                                      </Badge>
                                    )}
                                    {isSplit && (
                                      <Badge variant="purple" className="normal-case px-1.5 py-0 text-[10px]">
                                        Your share
                                      </Badge>
                                    )}
                                    <Badge
                                      variant={item.item_type === 'debt' ? 'debt' : 'info'}
                                      className="normal-case px-1.5 py-0 text-[10px]"
                                    >
                                      {item.item_type}
                                    </Badge>
                                  </div>
                                  {item.pulled_forward && item.original_pay_period_start && (
                                    <p className="text-caption mt-0.5">
                                      From {formatPaycheckDate(item.original_pay_period_start)}
                                    </p>
                                  )}
                                </div>

                                <div className="shrink-0 text-right">
                                  <CurrencyDisplay
                                    amount={item.amount}
                                    className={cn(
                                      'text-sm font-medium',
                                      isChecked ? 'text-muted line-through' : 'text-foreground',
                                    )}
                                  />
                                  {isSplit && item.full_amount && (
                                    <p className="text-caption">of {fmtCurrency(item.full_amount)}</p>
                                  )}
                                </div>

                                {item.is_overdue && !isChecked && item.item_type === 'bill' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleHideOverdue(item.id || item.item_id, false)}
                                    disabled={isHiding}
                                    className="min-h-8 shrink-0 px-1.5"
                                    title="Hide overdue"
                                    aria-label="Hide overdue"
                                  >
                                    <EyeOff className="h-3.5 w-3.5" />
                                  </Button>
                                )}

                                <PaycheckPlanItemActions
                                  item={item}
                                  busy={overrideBusyKey === overrideItemKey(item)}
                                  compact
                                  onPullForward={handlePullForward}
                                  onRevert={handleRevertOverride}
                                />
                              </div>
                            );
                          })}
                        </div>

                        {hiddenOverdueItems.length > 0 && (
                          <div className="mt-4 border-t border-border pt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowHiddenOverdue((prev) => !prev)}
                              className="h-auto min-h-0 w-full justify-start px-0 text-caption text-muted hover:text-foreground"
                            >
                              {showHiddenOverdue ? (
                                <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              {hiddenOverdueItems.length} hidden overdue{' '}
                              {hiddenOverdueItems.length === 1 ? 'item' : 'items'}
                            </Button>

                            {showHiddenOverdue && (
                              <div className="mt-2 space-y-2">
                                {hiddenOverdueItems.map((item) => {
                                  const key = `${item.item_type}_${item.id || item.item_id}`;
                                  const isHiding = !!hidingOverdue[item.id || item.item_id];
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-sm opacity-70"
                                    >
                                      <span className="w-4 shrink-0" />
                                      <span className="min-w-0 flex-1 truncate text-muted">
                                        {item.name}
                                        <Badge variant="neutral" className="ml-1.5 normal-case px-1.5 py-0 text-[10px]">
                                          Hidden
                                        </Badge>
                                      </span>
                                      <CurrencyDisplay amount={item.amount} className="shrink-0 text-sm text-muted" />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleHideOverdue(item.id || item.item_id, true)}
                                        disabled={isHiding}
                                        className="min-h-8 shrink-0 px-1.5"
                                        title="Show overdue"
                                        aria-label="Show overdue"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-body">No paycheck plan configured yet.</p>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          sectionKey="quick_stats"
          title="Quick Stats"
          icon={TrendingUp}
          iconTone="brand"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            {creditScore ? (
              (() => {
                const pct = Number(creditScore.overall_utilization_pct || 0);
                const rating = creditRatingMeta(pct);
                return (
                  <div>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-caption">Credit Utilization</p>
                        <p className="text-money mt-1">
                          {creditScore.overall_utilization_pct != null ? `${creditScore.overall_utilization_pct}%` : '--'}
                        </p>
                      </div>
                      <Badge variant={rating.variant} className="normal-case">
                        {rating.label}
                      </Badge>
                    </div>
                    {creditScore.overall_utilization_pct != null && (
                      <div>
                        <div className="mb-1.5 flex justify-between text-caption">
                          <span>Utilization</span>
                          <span className="font-medium text-foreground">
                            {(isFinite(pct) ? pct : 0).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                          <div
                            className={cn('h-full rounded-full transition-all', rating.bar)}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-body">Add debts to see credit card utilization.</p>
            )}

            <Card variant="inset" className="divide-y divide-border p-0">
              <div className="px-4">
                <MetricRow
                  label="Monthly Bills"
                  value={Array.isArray(bills) ? bills.filter((b) => b.is_user_responsible !== false).length : 0}
                />
              </div>
              <div className="px-4">
                <MetricRow label="Active Debts" value={activeDebts.length} />
              </div>
              {totalBillCount > 0 && (
                <div className="px-4">
                  <MetricRow
                    label={
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-brand-600" />
                        Bills Paid This Month
                      </span>
                    }
                    value={`${paidCount} of ${totalBillCount}`}
                    valueClassName={paidCount === totalBillCount ? 'text-brand-600' : undefined}
                  />
                </div>
              )}
            </Card>
          </div>
        </CollapsibleCard>
      </div>

      <CollapsibleCard
        sectionKey="recent_payments"
        title="Recent Payments"
        icon={DollarSign}
        iconTone="brand"
        collapsed={collapsedSections}
        onToggle={toggleSection}
      >
        {Array.isArray(recentPayments) && recentPayments.length > 0 ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
            <div className="max-h-[min(22rem,52vh)] overflow-x-auto overflow-y-auto overscroll-contain sm:max-h-72">
              <table className="w-full min-w-[280px] text-sm">
                <thead className="sticky top-0 z-[1] bg-surface-subtle shadow-[0_1px_0_0_var(--color-border)]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted">Type</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentPayments.map((payment) => {
                    const typeBadge = paymentTypeBadge(payment);
                    return (
                      <tr key={payment.id} className="hover:bg-surface-subtle/60">
                        <td className="px-4 py-3 text-foreground">
                          {payment.paid_date ? formatDate(payment.paid_date, user?.date_format) : '--'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={typeBadge.variant} className="normal-case">
                              {typeBadge.label}
                            </Badge>
                            {payment.is_extra && (
                              <Badge variant="purple" className="normal-case">
                                Extra
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CurrencyDisplay amount={payment.amount} className="font-medium text-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-xl bg-gradient-to-t from-surface to-transparent"
              aria-hidden
            />
          </div>
        ) : (
          <p className="text-body">No recent payments recorded.</p>
        )}
      </CollapsibleCard>

      {household && recentActivity.length > 0 && (
        <CollapsibleCard
          sectionKey="household_activity"
          title="Recent Household Activity"
          icon={Activity}
          iconTone="accent"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                  {(item.user_first_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{item.user_first_name}</span>
                    {' '}{item.action}{' '}
                    {item.entity_type.replace(/_/g, ' ')}
                    {' '}&apos;{item.entity_name}&apos;
                  </p>
                  <p className="text-caption mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.created_at
                      ? formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })
                      : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
}
