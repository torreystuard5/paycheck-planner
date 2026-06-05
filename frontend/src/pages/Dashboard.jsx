import { useState, useEffect, useCallback, lazy, Suspense, memo } from 'react';
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
} from 'lucide-react';
import { parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import WhatsNewBanner from '../components/WhatsNewBanner';

const PaycheckPlanEnvelope = lazy(() => import('../components/PaycheckPlanEnvelope'));
const RecentUpdates = lazy(() => import('../components/RecentUpdates'));
import usePolling from '../hooks/usePolling';
import { formatDate } from '../utils/formatDate';
import { augmentPaycheckPlan } from '../utils/paycheckPlanItems';
import { formatApiError } from '../utils/formatApiError';
import {
  Badge,
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

const SummaryStatCard = memo(function SummaryStatCard({
  label, value, count, icon, tone, subtitle, paidSubtitle, onClick,
}) {
  return (
    <Card
      variant="interactive"
      onClick={onClick}
      className="p-4 sm:p-5"
      role="button"
      tabIndex={0}
      aria-label={`${label}. View details.`}
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
});

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
        <Card className="flex items-center gap-3 border-danger-200 bg-danger-50 p-4" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0 text-danger-600" aria-hidden />
          <p className="text-sm text-danger-700">{error}</p>
        </Card>
      )}

      <WhatsNewBanner compact />

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
          <Suspense fallback={<LoadingSpinner label="Loading paycheck plan" />}>
            <PaycheckPlanEnvelope
              paycheckPlan={paycheckPlan}
              assignItemPaid={assignItemPaid}
              assignItemKey={assignItemKey}
              checklistLoading={checklistLoading}
              onToggleItem={toggleChecklistItem}
              onPullForward={handlePullForward}
              onRevertOverride={handleRevertOverride}
              overrideBusyKey={overrideBusyKey}
              overrideItemKey={overrideItemKey}
              hidingOverdue={hidingOverdue}
              onHideOverdue={toggleHideOverdue}
              showHiddenOverdue={showHiddenOverdue}
              onToggleShowHidden={() => setShowHiddenOverdue((prev) => !prev)}
              className="border-0 shadow-none"
            />
          </Suspense>
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

      <Suspense fallback={null}>
        <RecentUpdates />
      </Suspense>
    </div>
  );
}
