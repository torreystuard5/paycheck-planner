import { useState, useEffect, useCallback } from 'react';
import { DollarSign, FileText, CreditCard, PiggyBank, TrendingUp, Calendar, AlertCircle, Users, Activity, Clock } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import StatusBadge from '../components/StatusBadge';
import usePolling from '../hooks/usePolling';
import { formatDate } from '../utils/dateFormat';

export default function Dashboard() {
  const { user } = useAuth();
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

      if (planRes.status === 'fulfilled') setPaycheckPlan(planRes.value.data);
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
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchDashboardData();
      setLoading(false);
    };
    init();
  }, [fetchDashboardData]);

  usePolling(fetchDashboardData, 30000, !!household);

  if (loading) return <LoadingSpinner />;

  const totalIncome = Array.isArray(income) ? income.reduce((sum, i) => sum + (i.amount || 0), 0) : 0;
  const totalBills = Array.isArray(bills) ? bills.reduce((sum, b) => sum + (b.amount || 0), 0) : 0;
  const totalDebt = Array.isArray(debts) ? debts.reduce((sum, d) => sum + (d.balance || 0), 0) : 0;
  const savingsCount = Array.isArray(savingsGoals) ? savingsGoals.length : 0;

  const summaryCards = [
    { label: 'Total Income', value: totalIncome, icon: DollarSign, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Total Bills', value: totalBills, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Total Debt', value: totalDebt, icon: CreditCard, color: 'text-red-500', bg: 'bg-red-50' },
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
          <div key={card.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                {card.value !== null ? (
                  <CurrencyDisplay amount={card.value} className="text-2xl font-bold text-gray-900 mt-1 block" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900 mt-1">{card.count}</p>
                )}
              </div>
              <div className={`${card.bg} p-3 rounded-lg`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Current Paycheck Plan
          </h2>
          {paycheckPlan ? (
            <div className="space-y-3">
              {paycheckPlan.next_paycheck_date && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Next Paycheck</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(paycheckPlan.next_paycheck_date, user?.date_format)}
                  </span>
                </div>
              )}
              {paycheckPlan.net_pay != null && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Net Pay</span>
                  <CurrencyDisplay amount={paycheckPlan.net_pay} className="font-medium text-gray-900" />
                </div>
              )}
              {paycheckPlan.allocated_amount != null && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Allocated</span>
                  <CurrencyDisplay amount={paycheckPlan.allocated_amount} className="font-medium text-gray-900" />
                </div>
              )}
              {paycheckPlan.remaining_amount != null && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Remaining</span>
                  <CurrencyDisplay amount={paycheckPlan.remaining_amount} className="font-medium text-green-600" />
                </div>
              )}
              {Array.isArray(paycheckPlan.bills) && paycheckPlan.bills.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Allocated Bills</p>
                  <div className="space-y-2">
                    {paycheckPlan.bills.map((bill, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{bill.name}</span>
                        <CurrencyDisplay amount={bill.amount} className="text-gray-900" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            {creditScore && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Credit Efficiency Score</span>
                  <span className="text-2xl font-bold text-gray-900">{creditScore.score ?? '--'}</span>
                </div>
                {creditScore.rating && <StatusBadge status={creditScore.rating} />}
                {creditScore.utilization_ratio != null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Credit Utilization</span>
                      <span className="text-gray-900">{(creditScore.utilization_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${Math.min(creditScore.utilization_ratio * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {!creditScore && <p className="text-gray-500 text-sm">Add debts to see credit efficiency stats.</p>}

            <div className="pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Monthly Bills</span>
                <span className="font-medium text-gray-900">{Array.isArray(bills) ? bills.length : 0}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-gray-600">Active Debts</span>
                <span className="font-medium text-gray-900">{Array.isArray(debts) ? debts.length : 0}</span>
              </div>
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
                  <th className="text-left py-2 text-gray-600 font-medium">Description</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Amount</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100">
                    <td className="py-3 text-gray-900">
                      {payment.payment_date ? formatDate(payment.payment_date, user?.date_format) : '--'}
                    </td>
                    <td className="py-3 text-gray-700">{payment.notes || payment.bill_name || payment.debt_name || 'Payment'}</td>
                    <td className="py-3 text-right">
                      <CurrencyDisplay amount={payment.amount} className="font-medium text-gray-900" />
                    </td>
                    <td className="py-3 text-gray-600">{payment.payment_method || '--'}</td>
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
