import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, CreditCard, PiggyBank, TrendingUp, Calendar, AlertCircle, Users, Activity, Clock, CheckCircle, ChevronRight, ChevronDown, Square, CheckSquare, EyeOff, Eye, ChevronUp } from 'lucide-react';
import { parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import PaycheckPlanItemActions from '../components/PaycheckPlanItemActions';
import UpcomingPaychecks from '../components/UpcomingPaychecks';
import usePolling from '../hooks/usePolling';
import { formatDate, formatPaycheckDate } from '../utils/formatDate';
import { augmentPaycheckPlan } from '../utils/paycheckPlanItems';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

function CollapsibleSection({ sectionKey, title, icon: Icon, iconColor, collapsed, onToggle, children }) {
  const isCollapsed = collapsed.includes(sectionKey);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between p-6 pb-0 text-left"
      >
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {Icon && <Icon className={`w-5 h-5 ${iconColor || 'text-gray-500'}`} />}
          {title}
        </h2>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: isCollapsed ? '0px' : '2000px', opacity: isCollapsed ? 0 : 1 }}
      >
        <div className="p-6 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}

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
  const [household, setHousehold] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [checklistLoading, setChecklistLoading] = useState({});
  const [showHiddenOverdue, setShowHiddenOverdue] = useState(false);
  const [hidingOverdue, setHidingOverdue] = useState({});
  const [overrideBusyKey, setOverrideBusyKey] = useState(null);

  /** Stable key + paid flag: engine is_paid (household source of truth) OR user checklist row. */
  const assignItemKey = useCallback((item) => `${item.item_type}_${item.id || item.item_id}`, []);
  const assignItemPaid = useCallback(
    (item, map = checklist) => Boolean(item.is_paid) || Boolean(map[assignItemKey(item)]),
    [checklist, assignItemKey],
  );

  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // Load UI preferences on mount
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
      ? collapsedSections.filter(k => k !== key)
      : [...collapsedSections, key];
    setCollapsedSections(updated);
    try {
      await api.patch('/api/v1/users/me/ui-preferences', { collapsed_sections: updated });
    } catch { /* ignore */ }
  };

  const fetchChecklist = useCallback(async (payPeriodStart, assignedItems) => {
    if (!payPeriodStart) return;

    const enginePaidKeys = new Set();
    const seedMap = {};
    if (Array.isArray(assignedItems)) {
      assignedItems.forEach((item) => {
        const key = `${item.item_type}_${item.id || item.item_id}`;
        if (item.is_paid) {
          seedMap[key] = true;
          enginePaidKeys.add(key);
        }
      });
    }

    try {
      const res = await api.get(`/api/v1/paycheck-checklist?pay_period_start=${payPeriodStart}`);
      const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
      const map = { ...seedMap };
      items.forEach((entry) => {
        const key = `${entry.item_type}_${entry.item_id}`;
        if (enginePaidKeys.has(key)) return;
        const eng = Array.isArray(assignedItems)
          ? assignedItems.find((i) => `${i.item_type}_${i.id || i.item_id}` === key)
          : null;
        // Ignore stale per-user checklist "checked" when plan engine already says unpaid
        // (e.g. co-owner unchecked before we cleared other members' checklist rows).
        if (
          eng &&
          (eng.item_type === 'bill' || eng.item_type === 'debt') &&
          eng.is_paid === false &&
          entry.is_checked
        ) {
          map[key] = false;
          return;
        }
        map[key] = entry.is_checked;
      });
      setChecklist(map);
    } catch {
      setChecklist(seedMap);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (user?.app_mode === 'business') return;
    setError(null);
    const budgetId = activeBudget?.id || localStorage.getItem('active_budget_id');
    const bq = budgetId ? `budget_id=${budgetId}` : '';
    const sep = (url) => url.includes('?') ? `${url}&${bq}` : `${url}?${bq}`;
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
        if (planData?.paychecks?.[0]) {
          const pp = planData.paychecks[0];
          const payPeriodStart = pp.pay_period_start || pp.paycheck_date;
          if (payPeriodStart) fetchChecklist(payPeriodStart, pp.assigned_items);
        }
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
    } catch (err) {
      setError('Failed to load dashboard data.');
    }
  }, [fetchChecklist, user?.app_mode, activeBudget?.id]);

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
  const totalBills = Array.isArray(bills) ? bills.filter(b => b.is_user_responsible !== false).reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0) : 0;
  const activeDebts = Array.isArray(debts) ? debts.filter(d => Number(d.balance) > 0) : [];
  const totalDebt = activeDebts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
  const debtsPaidThisPeriod = activeDebts.filter(d => d.is_paid_this_period).length;
  const totalDebtCount = activeDebts.length;
  const savingsCount = Array.isArray(savingsGoals) ? savingsGoals.length : 0;

  const billsThisMonth = Array.isArray(bills) ? bills.filter(b => b.is_user_responsible !== false) : [];
  const paidBills = billsThisMonth.filter(b => b.is_paid);
  const paidCount = paidBills.length;
  const totalBillCount = billsThisMonth.length;

  const getBillSubtitle = () => {
    if (totalBillCount === 0) return null;
    const paidBillsTotal = paidBills.reduce((s, b) => s + (Number(b.user_share ?? b.amount) || 0), 0);
    return `${paidCount}/${totalBillCount} bills paid \u00b7 ${fmtCurrency(paidBillsTotal)} of ${fmtCurrency(totalBills)}`;
  };

  const currentPaycheckItems = (paycheckPlan?.paychecks?.[0]?.assigned_items) || [];
  const billItemsInPlan = currentPaycheckItems.filter(i => i.item_type === 'bill');
  const debtItemsInPlan = currentPaycheckItems.filter(i => i.item_type === 'debt');

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
    { label: 'Total Income', value: totalIncome, icon: DollarSign, color: 'text-green-500', bg: 'bg-green-50', subtitle: incomePaycheckCount > 0 ? `${incomePaycheckCount} paycheck${incomePaycheckCount !== 1 ? 's' : ''} this month` : 'No paychecks logged' },
    { label: 'Total Bills', value: totalBills, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', subtitle: getBillSubtitle(), paidSubtitle: billsPaidSubtitle },
    { label: 'Total Debt', value: totalDebt, icon: CreditCard, color: 'text-red-500', bg: 'bg-red-50', subtitle: totalDebtCount > 0 ? `${debtsPaidThisPeriod}/${totalDebtCount} paid this month` : null, paidSubtitle: debtPaidSubtitle },
    { label: 'Savings Goals', value: null, count: savingsCount, icon: PiggyBank, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user?.first_name ? `, ${user.first_name}` : ''}
          </h1>
          {household && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              <Users className="w-3 h-3" />
              Household Budget
            </span>
          )}
        </div>
        <p className="text-gray-600 mt-1">Here&apos;s your financial overview</p>
        {lastUpdated && household && (
          <p className="text-xs text-gray-400 mt-0.5">
            Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            onClick={() => navigate(cardLinks[card.label])}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                {card.value !== null ? (
                  <CurrencyDisplay amount={card.value} className="text-2xl font-bold text-gray-900 mt-1 block" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900 mt-1">{card.count}</p>
                )}
                {card.subtitle && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {card.subtitle}
                  </p>
                )}
                {card.paidSubtitle && (
                  <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {card.paidSubtitle}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`${card.bg} p-3 rounded-lg`}>
                  <card.icon className={`w-6 h-6 ${card.color}`} />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CollapsibleSection
          sectionKey="paycheck_plan"
          title="Current Paycheck Plan"
          icon={Calendar}
          iconColor="text-blue-500"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          {paycheckPlan?.current_paycheck_date && (
            <div className="mb-4 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Current Paycheck</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatPaycheckDate(paycheckPlan.current_paycheck_date)}
                </span>
              </div>
              {paycheckPlan.next_paycheck_date && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Next Paycheck</span>
                  <span className="text-sm text-gray-500">
                    {formatPaycheckDate(paycheckPlan.next_paycheck_date)}
                  </span>
                </div>
              )}
            </div>
          )}
          {paycheckPlan?.paychecks?.[1] && (
            <UpcomingPaychecks
              periods={[paycheckPlan.paychecks[1]]}
              overrideBusyKey={overrideBusyKey}
              onPullForward={handlePullForward}
              onRevert={handleRevertOverride}
            />
          )}
          {paycheckPlan && Array.isArray(paycheckPlan.paychecks) && paycheckPlan.paychecks.length > 0 ? (
            <div className="space-y-3">
              {(() => {
                const next = paycheckPlan.paychecks[0];
                const payPeriodStart = next.pay_period_start || next.paycheck_date;
                const assignedItems = Array.isArray(next.assigned_items) ? next.assigned_items : [];

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

                const checkedCount = visibleItems.filter((item) => assignItemPaid(item)).length;
                const totalItems = visibleItems.length;
                const progressPct = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

                const totalAssignedAmount = visibleItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const paidAmount = visibleItems
                  .filter((item) => assignItemPaid(item))
                  .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const stillOwed = totalAssignedAmount - paidAmount;

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Pay Period</span>
                      <span className="font-medium text-gray-900">
                        {formatPaycheckDate(next.paycheck_date)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Paycheck Amount</span>
                      <CurrencyDisplay amount={next.paycheck_amount} className="font-medium text-gray-900" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Due</span>
                      <CurrencyDisplay amount={next.total_due} className="font-medium text-gray-900" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Remaining</span>
                      <CurrencyDisplay amount={next.remaining} className={`font-medium ${Number(next.remaining) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    </div>
                    {totalItems > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-700">Assigned Items</p>
                          <span className="text-xs font-medium text-gray-500">
                            {checkedCount}/{totalItems} Paid
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mb-2">
                          <div
                            className="bg-green-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs mb-3">
                          <span className="font-semibold text-green-600">Paid: {fmtCurrency(paidAmount)}</span>
                          <span className="text-gray-400"> of {fmtCurrency(totalAssignedAmount)}</span>
                          <span className="text-gray-300 mx-1">·</span>
                          <span className="font-semibold text-amber-600">Still Owed: {fmtCurrency(stillOwed)}</span>
                        </p>

                        <div className="space-y-1.5">
                          {sortedItems.map((item) => {
                            const key = assignItemKey(item);
                            const isChecked = assignItemPaid(item);
                            const isToggling = !!checklistLoading[key];
                            const isSplit = item.is_split || (item.split_count && item.split_count > 1);
                            const isHiding = !!hidingOverdue[item.id || item.item_id];

                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-2 text-sm rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${item.is_overdue && !isChecked ? 'bg-red-50 border-l-2 border-red-400' : isChecked ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                              >
                                <button
                                  onClick={() => toggleChecklistItem(item, payPeriodStart)}
                                  disabled={isToggling}
                                  className={`shrink-0 transition-colors ${isToggling ? 'opacity-50' : ''} ${isChecked ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'}`}
                                >
                                  {isChecked
                                    ? <CheckSquare className="w-4 h-4" />
                                    : <Square className="w-4 h-4" />
                                  }
                                </button>
                                <span className={`flex-1 min-w-0 truncate ${isChecked ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                  {item.name}
                                  {item.is_overdue && !isChecked && (
                                    <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">Overdue</span>
                                  )}
                                  {item.pulled_forward && (
                                    <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                      Pulled forward
                                    </span>
                                  )}
                                  {item.pulled_forward && item.original_pay_period_start && (
                                    <span className="text-[10px] text-gray-400 ml-1">
                                      from {formatPaycheckDate(item.original_pay_period_start)}
                                    </span>
                                  )}
                                  {isSplit && <span className="text-xs text-purple-600 ml-1">(your share)</span>}
                                  {' '}<span className="text-xs text-gray-400">({item.item_type})</span>
                                </span>
                                <span className={`shrink-0 text-right ${isChecked ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                  <CurrencyDisplay amount={item.amount} className="inline" />
                                </span>
                                {isSplit && item.full_amount && (
                                  <span className="shrink-0 text-xs text-gray-400 ml-0.5">
                                    of {fmtCurrency(item.full_amount)}
                                  </span>
                                )}
                                {item.is_overdue && !isChecked && item.item_type === 'bill' && (
                                  <button
                                    onClick={() => toggleHideOverdue(item.id || item.item_id, false)}
                                    disabled={isHiding}
                                    className={`shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors ${isHiding ? 'opacity-50' : ''}`}
                                    title="Hide overdue"
                                  >
                                    <EyeOff className="w-3.5 h-3.5" />
                                  </button>
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
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => setShowHiddenOverdue((prev) => !prev)}
                              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
                            >
                              {showHiddenOverdue ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>{hiddenOverdueItems.length} hidden overdue {hiddenOverdueItems.length === 1 ? 'item' : 'items'}</span>
                            </button>
                            {showHiddenOverdue && (
                              <div className="mt-2 space-y-1.5">
                                {hiddenOverdueItems.map((item) => {
                                  const key = `${item.item_type}_${item.id || item.item_id}`;
                                  const isHiding = !!hidingOverdue[item.id || item.item_id];
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center gap-2 text-sm rounded-md px-1.5 py-1 -mx-1.5 bg-gray-50 opacity-60"
                                    >
                                      <span className="shrink-0 w-4" />
                                      <span className="flex-1 min-w-0 truncate text-gray-400">
                                        {item.name}
                                        <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-500">Hidden</span>
                                      </span>
                                      <span className="shrink-0 text-right text-gray-400">
                                        <CurrencyDisplay amount={item.amount} className="inline" />
                                      </span>
                                      <button
                                        onClick={() => toggleHideOverdue(item.id || item.item_id, true)}
                                        disabled={isHiding}
                                        className={`shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors ${isHiding ? 'opacity-50' : ''}`}
                                        title="Show overdue"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
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
            <p className="text-gray-500 text-sm">No paycheck plan configured yet.</p>
          )}
          {paycheckPlan?.paychecks?.length > 2 && (
            <UpcomingPaychecks
              periods={paycheckPlan.paychecks.slice(2, 4)}
              overrideBusyKey={overrideBusyKey}
              onPullForward={handlePullForward}
              onRevert={handleRevertOverride}
            />
          )}
        </CollapsibleSection>

        <CollapsibleSection
          sectionKey="quick_stats"
          title="Quick Stats"
          icon={TrendingUp}
          iconColor="text-green-500"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            {creditScore && (() => {
              const pct = Number(creditScore.overall_utilization_pct || 0);
              const getRating = (v) => {
                if (v < 10) return { label: 'Excellent', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' };
                if (v < 30) return { label: 'Good', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' };
                if (v < 50) return { label: 'Fair', bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500' };
                if (v < 75) return { label: 'Poor', bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' };
                return { label: 'Critical', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' };
              };
              const rating = getRating(pct);
              return (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Credit Utilization</span>
                    <span className="text-2xl font-bold text-gray-900">{creditScore.overall_utilization_pct != null ? `${creditScore.overall_utilization_pct}%` : '--'}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500">Utilization Rating</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rating.bg} ${rating.text}`}>{rating.label}</span>
                  </div>
                  {creditScore.overall_utilization_pct != null && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Credit Utilization</span>
                        <span className="text-gray-900">{(isFinite(pct) ? pct : 0).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className={`${rating.bar} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {!creditScore && <p className="text-gray-500 text-sm">Add debts to see credit card utilization.</p>}

            <div className="pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Monthly Bills</span>
                <span className="font-medium text-gray-900">{Array.isArray(bills) ? bills.filter(b => b.is_user_responsible !== false).length : 0}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-gray-600">Active Debts</span>
                <span className="font-medium text-gray-900">{activeDebts.length}</span>
              </div>
              {totalBillCount > 0 && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    Bills Paid This Month
                  </span>
                  <span className={`font-medium ${paidCount === totalBillCount ? 'text-green-600' : 'text-gray-900'}`}>
                    {paidCount} of {totalBillCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <CollapsibleSection
        sectionKey="recent_payments"
        title="Recent Payments"
        collapsed={collapsedSections}
        onToggle={toggleSection}
      >
        {Array.isArray(recentPayments) && recentPayments.length > 0 ? (
          <div className="relative rounded-lg border border-gray-100 bg-white">
            <div className="max-h-[min(22rem,52vh)] sm:max-h-72 overflow-y-auto overflow-x-auto overscroll-contain">
              <table className="w-full text-sm min-w-[280px]">
                <thead className="sticky top-0 z-[1] bg-gray-50 shadow-[0_1px_0_0_rgb(229_231_235)]">
                  <tr>
                    <th className="text-left py-2.5 px-1 sm:px-0 text-gray-600 font-medium">Date</th>
                    <th className="text-left py-2.5 px-1 sm:px-0 text-gray-600 font-medium">Type</th>
                    <th className="text-right py-2.5 px-1 sm:px-0 text-gray-600 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 text-gray-900">
                        {payment.paid_date ? formatDate(payment.paid_date, user?.date_format) : '--'}
                      </td>
                      <td className="py-3 text-gray-700">
                        {payment.bill_id ? 'Bill' : payment.debt_id ? 'Debt' : 'Payment'}
                        {payment.is_extra && <span className="ml-1 text-xs text-purple-600">(extra)</span>}
                      </td>
                      <td className="py-3 text-right">
                        <CurrencyDisplay amount={payment.amount} className="font-medium text-gray-900" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent rounded-b-lg" aria-hidden />
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No recent payments recorded.</p>
        )}
      </CollapsibleSection>

      {household && recentActivity.length > 0 && (
        <CollapsibleSection
          sectionKey="household_activity"
          title="Recent Household Activity"
          icon={Activity}
          iconColor="text-blue-500"
          collapsed={collapsedSections}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium shrink-0">
                  {(item.user_first_name || '?')[0].toUpperCase()}
                </div>
                <span className="text-gray-700 flex-1">
                  <span className="font-medium">{item.user_first_name}</span>
                  {' '}{item.action}{' '}{item.entity_type.replace(/_/g, ' ')}{' '}
                  &apos;{item.entity_name}&apos;
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {item.created_at ? formatDistanceToNow(parseISO(item.created_at), { addSuffix: true }) : ''}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
