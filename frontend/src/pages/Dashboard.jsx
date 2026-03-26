import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DollarSign, FileText, CreditCard, PiggyBank, TrendingUp, Calendar, AlertCircle, Users, Activity, Clock, Gift, CheckCircle, ChevronRight, Square, CheckSquare } from 'lucide-react';
import { parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import usePolling from '../hooks/usePolling';
import { formatDate, formatPaycheckDate } from '../utils/formatDate';
import RecentUpdates from '../components/RecentUpdates';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [income, setIncome] = useState([]);
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

  const fetchChecklist = useCallback(async (payPeriodStart, assignedItems) => {
    if (!payPeriodStart) return;

    // Seed from bill is_paid status so paid bills show immediately
    const seedMap = {};
    if (Array.isArray(assignedItems)) {
      assignedItems.forEach((item) => {
        if (item.is_paid) {
          seedMap[`${item.item_type}_${item.id || item.item_id}`] = true;
        }
      });
    }

    try {
      const res = await api.get(`/api/v1/paycheck-checklist?pay_period_start=${payPeriodStart}`);
      const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
      const map = { ...seedMap };
      items.forEach((entry) => {
        map[`${entry.item_type}_${entry.item_id}`] = entry.is_checked;
      });
      setChecklist(map);
    } catch {
      setChecklist(seedMap);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setError(null);
    try {
      const [incomeRes, billsRes, debtsRes, savingsRes, paymentsRes] = await Promise.allSettled([
        api.get('/api/v1/income'),
        api.get('/api/v1/bills'),
        api.get('/api/v1/debts'),
        api.get('/api/v1/savings/goals'),
        api.get('/api/v1/payments?limit=5'),
      ]);

      if (incomeRes.status === 'fulfilled') setIncome(incomeRes.value.data || []);
      if (billsRes.status === 'fulfilled') setBills(billsRes.value.data || []);
      if (debtsRes.status === 'fulfilled') setDebts(debtsRes.value.data || []);
      if (savingsRes.status === 'fulfilled') setSavingsGoals(savingsRes.value.data || []);
      if (paymentsRes.status === 'fulfilled') setRecentPayments(paymentsRes.value.data || []);

      const [planRes, creditRes] = await Promise.allSettled([
        api.get('/api/v1/paycheck-plan'),
        api.get('/api/v1/debts/credit-efficiency'),
      ]);

      if (planRes.status === 'fulfilled') {
        const planData = planRes.value.data;
        setPaycheckPlan(planData);
        if (planData?.paychecks?.[0]) {
          const pp = planData.paychecks[0];
          const payPeriodStart = pp.pay_period_start || pp.paycheck_date;
          if (payPeriodStart) fetchChecklist(payPeriodStart, pp.assigned_items);
        }
      }
      if (creditRes.status === 'fulfilled') setCreditScore(creditRes.value.data);

      // Household data
      try {
        const hhRes = await api.get('/api/v1/households/me');
        setHousehold(hhRes.data);
        try {
          const actRes = await api.get('/api/v1/households/activity?limit=5');
          setRecentActivity(actRes.data.activities || []);
        } catch {
          // optional
        }
      } catch {
        setHousehold(null);
        setRecentActivity([]);
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load dashboard data.');
    }
  }, [fetchChecklist]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchDashboardData();
      setLoading(false);
    };
    init();
  }, [fetchDashboardData]);

  usePolling(fetchDashboardData, 30000, !!household);

  const toggleChecklistItem = async (item, payPeriodStart) => {
    const key = `${item.item_type}_${item.id || item.item_id}`;
    const currentState = !!checklist[key];
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
    } catch {
      setChecklist((prev) => ({ ...prev, [key]: currentState }));
    } finally {
      setChecklistLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) return <LoadingSpinner />;

  const totalIncome = Array.isArray(income) ? income.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) : 0;
  const totalBills = Array.isArray(bills) ? bills.filter(b => b.is_user_responsible !== false).reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0) : 0;
  const totalDebt = Array.isArray(debts) ? debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0) : 0;
  const savingsCount = Array.isArray(savingsGoals) ? savingsGoals.length : 0;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const billsThisMonth = Array.isArray(bills) ? bills.filter(b => b.is_user_responsible !== false) : [];
  const paidThisMonth = billsThisMonth.filter((b) => {
    if (!b.is_paid || !b.paid_date) return false;
    const pd = new Date(b.paid_date);
    return pd.getMonth() === currentMonth && pd.getFullYear() === currentYear;
  });
  const paidCount = paidThisMonth.length;
  const totalBillCount = billsThisMonth.length;

  // Build bill subtitle with split/single payment info
  const getBillSubtitle = () => {
    if (totalBillCount === 0) return null;
    const splitBills = billsThisMonth.filter(b => b.payment_mode === 'split' && b.is_household_bill);
    const singleBills = billsThisMonth.filter(b => b.payment_mode !== 'split' || !b.is_household_bill);
    const parts = [];

    if (splitBills.length > 0) {
      const splitPaid = splitBills.filter(b => b.is_paid).length;
      parts.push(`${splitPaid}/${splitBills.length} split paid`);
    }
    if (singleBills.length > 0) {
      const singlePaid = singleBills.filter(b => b.is_paid).length;
      parts.push(`${singlePaid}/${singleBills.length} paid`);
    }

    if (parts.length === 0) return `${paidCount}/${totalBillCount} paid`;
    return parts.join(' · ');
  };

  // Compute paid amounts for bills and debts from current paycheck period checklist
  const currentPaycheckItems = (paycheckPlan?.paychecks?.[0]?.assigned_items) || [];
  const billItemsInPlan = currentPaycheckItems.filter(i => i.item_type === 'bill');
  const debtItemsInPlan = currentPaycheckItems.filter(i => i.item_type === 'debt');

  const billsTotalInPlan = billItemsInPlan.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const billsPaidInPlan = billItemsInPlan
    .filter(i => !!checklist[`${i.item_type}_${i.id || i.item_id}`])
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const debtTotalInPlan = debtItemsInPlan.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const debtPaidInPlan = debtItemsInPlan
    .filter(i => !!checklist[`${i.item_type}_${i.id || i.item_id}`])
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const billsPaidSubtitle = billItemsInPlan.length > 0
    ? `${fmtCurrency(billsPaidInPlan)} of ${fmtCurrency(billsTotalInPlan)} paid`
    : null;
  const debtPaidSubtitle = debtItemsInPlan.length > 0
    ? `${fmtCurrency(debtPaidInPlan)} of ${fmtCurrency(debtTotalInPlan)} paid this period`
    : null;

  const cardLinks = {
    'Total Income': '/income',
    'Total Bills': '/bills',
    'Total Debt': '/debts',
    'Savings Goals': '/savings',
  };

  const summaryCards = [
    { label: 'Total Income', value: totalIncome, icon: DollarSign, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Total Bills', value: totalBills, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', subtitle: getBillSubtitle(), paidSubtitle: billsPaidSubtitle },
    { label: 'Total Debt', value: totalDebt, icon: CreditCard, color: 'text-red-500', bg: 'bg-red-50', paidSubtitle: debtPaidSubtitle },
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

      <RecentUpdates />

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

      <Link
        to="/refer"
        className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 p-2 rounded-lg">
            <Gift className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">Get free months &mdash; Refer a friend</p>
            <p className="text-xs text-gray-500">Share PayDrift and earn rewards for each friend who subscribes</p>
          </div>
          <span className="text-blue-600 text-sm font-medium shrink-0">&rarr;</span>
        </div>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Current Paycheck Plan
          </h2>
          {paycheckPlan && Array.isArray(paycheckPlan.paychecks) && paycheckPlan.paychecks.length > 0 ? (
            <div className="space-y-3">
              {(() => {
                const next = paycheckPlan.paychecks[0];
                const payPeriodStart = next.pay_period_start || next.paycheck_date;
                const assignedItems = Array.isArray(next.assigned_items) ? next.assigned_items : [];

                // Sort: unchecked first, checked last
                const sortedItems = [...assignedItems].sort((a, b) => {
                  const aKey = `${a.item_type}_${a.id || a.item_id}`;
                  const bKey = `${b.item_type}_${b.id || b.item_id}`;
                  const aChecked = !!checklist[aKey];
                  const bChecked = !!checklist[bKey];
                  if (aChecked === bChecked) return 0;
                  return aChecked ? 1 : -1;
                });

                const checkedCount = assignedItems.filter(
                  (item) => !!checklist[`${item.item_type}_${item.id || item.item_id}`]
                ).length;
                const totalItems = assignedItems.length;
                const progressPct = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

                // Paid / Still Owed totals
                const totalAssignedAmount = assignedItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const paidAmount = assignedItems
                  .filter((item) => !!checklist[`${item.item_type}_${item.id || item.item_id}`])
                  .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const stillOwed = totalAssignedAmount - paidAmount;

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Next Paycheck</span>
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
                        {/* Progress indicator */}
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
                            const key = `${item.item_type}_${item.id || item.item_id}`;
                            const isChecked = !!checklist[key];
                            const isToggling = !!checklistLoading[key];
                            const isSplit = item.is_split || (item.split_count && item.split_count > 1);

                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-2 text-sm rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${isChecked ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
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
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No paycheck plan configured yet.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Quick Stats
          </h2>
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
                <span className="font-medium text-gray-900">{Array.isArray(debts) ? debts.length : 0}</span>
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
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h2>
        {Array.isArray(recentPayments) && recentPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-600 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Type</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100">
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
        ) : (
          <p className="text-gray-500 text-sm">No recent payments recorded.</p>
        )}
      </div>

      {household && recentActivity.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Recent Household Activity
          </h2>
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
        </div>
      )}
    </div>
  );
}
