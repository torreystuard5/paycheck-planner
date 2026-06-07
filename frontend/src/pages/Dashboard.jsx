import { useState, useEffect, useCallback, useMemo, lazy, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  FileText,
  CreditCard,
  PiggyBank,
  AlertCircle,
  Users,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import WhatsNewBanner from '../components/WhatsNewBanner';

const PaycheckPlanEnvelope = lazy(() => import('../components/PaycheckPlanEnvelope'));
const RecentUpdates = lazy(() => import('../components/RecentUpdates'));
import usePolling from '../hooks/usePolling';
import useDashboardWidgetVisibility from '../hooks/useDashboardWidgetVisibility';
import { DashboardCustomizeButton, CustomizeDashboardModal } from '../components/dashboard';
import DashboardWidgetSections from '../components/dashboard/DashboardWidgetSections';
import DashboardWidgetsSkeleton from '../components/dashboard/DashboardWidgetsSkeleton';
import { augmentPaycheckPlan, patchPaycheckPlanItemPaid } from '../utils/paycheckPlanItems';
import { formatApiError } from '../utils/formatApiError';
import {
  Badge,
  Button,
  Card,
  IconStat,
  PageHeader,
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

export default function Dashboard() {
  const { user } = useAuth();
  const { activeBudget, budgetVersion, loading: budgetLoading } = useBudget();
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
  const [allPayments, setAllPayments] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);
  const [chores, setChores] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [taxSummary, setTaxSummary] = useState(null);
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
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);

  const {
    visibility: widgetVisibility,
    widgetOrder,
    applyLayout,
    resetWidgets,
    visibleCount,
    ready: widgetsReady,
    saving: widgetsSaving,
  } = useDashboardWidgetVisibility(user?.id);

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

  const fetchOptionalWidgetData = useCallback(async () => {
    if (!widgetsReady || user?.app_mode === 'business') return;

    const v = widgetVisibility;
    const budgetId = activeBudget?.id || localStorage.getItem('active_budget_id');
    const bq = budgetId ? `budget_id=${budgetId}` : '';
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const tasks = [];

    if (v.reports_trends || v.payments_history) {
      tasks.push(
        api.get(bq ? `/api/v1/payments?${bq}` : '/api/v1/payments')
          .then((res) => setAllPayments(Array.isArray(res.data) ? res.data : []))
          .catch(() => setAllPayments([])),
      );
    }

    if (v.budgets_overview) {
      tasks.push(
        api.get('/api/v1/budgets')
          .then((res) => setBudgets(Array.isArray(res.data) ? res.data : []))
          .catch(() => setBudgets([])),
      );
    }

    if (v.tax_prep_reminder) {
      const params = { tax_year: year, ...(budgetId ? { budget_id: budgetId } : {}) };
      tasks.push(
        api.get('/api/v1/tax/summary', { params })
          .then((res) => setTaxSummary(res.data || null))
          .catch(() => setTaxSummary(null)),
      );
    }

    if (v.calendar_upcoming) {
      tasks.push(
        api.get('/api/v1/calendar', { params: { year, month, ...(budgetId ? { budget_id: budgetId } : {}) } })
          .then((res) => setCalendarEvents(Array.isArray(res.data?.events) ? res.data.events : []))
          .catch(() => setCalendarEvents([])),
      );
    }

    if (household && (v.shopping_list || v.chore_list)) {
      if (v.shopping_list) {
        tasks.push(
          api.get('/api/v1/households/shopping-list')
            .then((res) => setShoppingItems(res.data?.items || []))
            .catch(() => setShoppingItems([])),
        );
      }
      if (v.chore_list) {
        tasks.push(
          api.get('/api/v1/households/chores')
            .then((res) => setChores(res.data?.items || []))
            .catch(() => setChores([])),
        );
      }
    } else {
      setShoppingItems([]);
      setChores([]);
    }

    await Promise.allSettled(tasks);
  }, [widgetsReady, widgetVisibility, user?.app_mode, activeBudget?.id, household]);

  useEffect(() => {
    fetchOptionalWidgetData();
  }, [fetchOptionalWidgetData, budgetVersion]);

  const refreshShoppingList = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/households/shopping-list');
      setShoppingItems(res.data?.items || []);
    } catch {
      setShoppingItems([]);
    }
  }, []);

  const toggleChecklistItem = async (item, payPeriodStart) => {
    const key = assignItemKey(item);
    const itemId = item.id || item.item_id;
    const currentState = Boolean(item.is_paid) || !!checklist[key];
    const newState = !currentState;

    setChecklist((prev) => ({ ...prev, [key]: newState }));
    setChecklistLoading((prev) => ({ ...prev, [key]: true }));

    try {
      await api.put('/api/v1/paycheck-checklist', {
        item_type: item.item_type,
        item_id: itemId,
        pay_period_start: payPeriodStart,
        is_checked: newState,
      });

      setPaycheckPlan((prev) => patchPaycheckPlanItemPaid(prev, item.item_type, itemId, newState));

      if (item.item_type === 'bill') {
        setBills((prev) =>
          prev.map((b) => (String(b.id) === String(itemId) ? { ...b, is_paid: newState } : b)),
        );
      } else if (item.item_type === 'debt') {
        setDebts((prev) =>
          prev.map((d) =>
            String(d.id) === String(itemId) ? { ...d, is_paid_this_period: newState } : d,
          ),
        );
      }

      setChecklist((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
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

  const activeDebts = useMemo(
    () => (Array.isArray(debts) ? debts.filter((d) => Number(d.balance) > 0) : []),
    [debts],
  );

  const categoryData = useMemo(() => {
    if (!Array.isArray(bills)) return [];
    return bills.reduce((acc, bill) => {
      const cat = bill.category || 'Other';
      const existing = acc.find((item) => item.name === cat);
      const amount = Number(bill.amount) || 0;
      if (existing) existing.value += amount;
      else acc.push({ name: cat, value: amount });
      return acc;
    }, []).sort((a, b) => b.value - a.value);
  }, [bills]);

  const monthlyPayments = useMemo(() => {
    const source = allPayments.length > 0 ? allPayments : recentPayments;
    if (!Array.isArray(source)) return [];
    return source.reduce((acc, payment) => {
      if (!payment.paid_date) return acc;
      const month = payment.paid_date.substring(0, 7);
      const existing = acc.find((item) => item.month === month);
      const amount = Number(payment.amount) || 0;
      if (existing) existing.amount += amount;
      else acc.push({ month, amount });
      return acc;
    }, []).sort((a, b) => a.month.localeCompare(b.month));
  }, [allPayments, recentPayments]);

  const paymentTypeBadge = useCallback((payment) => {
    if (payment.bill_id) return { label: 'Bill', variant: 'info' };
    if (payment.debt_id) return { label: 'Debt', variant: 'debt' };
    return { label: 'Payment', variant: 'neutral' };
  }, []);

  if (loading || !sectionsLoaded) return <LoadingSpinner />;

  const totalIncome = incomeSummary ? Number(incomeSummary.total_net) || 0 : 0;
  const incomePaycheckCount = incomeSummary ? incomeSummary.paycheck_count || 0 : 0;
  const totalBills = Array.isArray(bills)
    ? bills.filter((b) => b.is_user_responsible !== false).reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0)
    : 0;
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

  const whatsNewExpanded = !collapsedSections.includes('whats_new');

  const summaryCardsContent = summaryCards.map((card) => (
    <SummaryStatCard
      key={card.label}
      {...card}
      onClick={() => navigate(cardLinks[card.label])}
    />
  ));

  return (
    <div className="page-container min-w-0 space-y-6">
      <PageHeader
        title={`Welcome back${user?.first_name ? `, ${user.first_name}` : ''}`}
        description="Here's your financial overview"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DashboardCustomizeButton
              onClick={() => setWidgetSettingsOpen(true)}
              visibleCount={visibleCount}
              loading={!widgetsReady}
            />
            {household ? (
              <Badge variant="info" className="gap-1.5 px-3 py-1">
                <Users className="h-3.5 w-3.5" />
                Household Budget
              </Badge>
            ) : null}
          </div>
        )}
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

      <CustomizeDashboardModal
        open={widgetSettingsOpen}
        onClose={() => setWidgetSettingsOpen(false)}
        visibility={widgetVisibility}
        widgetOrder={widgetOrder}
        onApply={applyLayout}
        onResetToDefault={resetWidgets}
        visibleCount={visibleCount}
        saving={widgetsSaving}
      />

      {!widgetsReady && <DashboardWidgetsSkeleton />}

      {widgetsReady && visibleCount === 0 && (
        <Card className="p-4 text-center sm:p-6">
          <p className="text-sm font-medium text-foreground">All dashboard widgets are hidden.</p>
          <p className="text-caption mt-1">Restore the default layout or choose which sections to show.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => resetWidgets()}
            disabled={widgetsSaving}
          >
            {widgetsSaving ? 'Saving…' : 'Reset to Default Layout'}
          </Button>
        </Card>
      )}

      {widgetsReady && visibleCount > 0 && (
        <DashboardWidgetSections
          widgetOrder={widgetOrder}
          widgetVisibility={widgetVisibility}
          collapsedSections={collapsedSections}
          onToggleCollapse={toggleSection}
          PaycheckPlanEnvelope={PaycheckPlanEnvelope}
          RecentUpdates={RecentUpdates}
          summaryCards={summaryCardsContent}
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
          creditScore={creditScore}
          creditRatingMeta={creditRatingMeta}
          bills={bills}
          activeDebts={activeDebts}
          paidCount={paidCount}
          totalBillCount={totalBillCount}
          recentPayments={recentPayments}
          allPayments={allPayments}
          paymentTypeBadge={paymentTypeBadge}
          userDateFormat={user?.date_format}
          household={household}
          recentActivity={recentActivity}
          whatsNewExpanded={whatsNewExpanded}
          incomeSummary={incomeSummary}
          savingsGoals={savingsGoals}
          categoryData={categoryData}
          monthlyPayments={monthlyPayments}
          shoppingItems={shoppingItems}
          chores={chores}
          onRefreshShoppingList={refreshShoppingList}
          calendarEvents={calendarEvents}
          activeBudget={activeBudget}
          budgets={budgets}
          taxSummary={taxSummary}
        />
      )}
    </div>
  );
}
