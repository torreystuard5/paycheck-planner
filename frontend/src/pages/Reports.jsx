import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const TABS = ['Monthly Summary', 'Trends', 'Interest'];
const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function Reports() {
  const [activeTab, setActiveTab] = useState('Monthly Summary');
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [interestData, setInterestData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [billsRes, paymentsRes, interestRes] = await Promise.allSettled([
        api.get('/api/v1/bills'),
        api.get('/api/v1/payments'),
        api.get('/api/v1/debts/interest-projection'),
      ]);
      if (billsRes.status === 'fulfilled') setBills(Array.isArray(billsRes.value.data) ? billsRes.value.data : []);
      if (paymentsRes.status === 'fulfilled') setPayments(Array.isArray(paymentsRes.value.data) ? paymentsRes.value.data : []);
      if (interestRes.status === 'fulfilled') setInterestData(Array.isArray(interestRes.value.data) ? interestRes.value.data : []);
    } catch {
      setError('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  const categoryData = bills.reduce((acc, bill) => {
    const cat = bill.category || 'Other';
    const existing = acc.find((item) => item.name === cat);
    if (existing) {
      existing.value += bill.amount || 0;
    } else {
      acc.push({ name: cat, value: bill.amount || 0 });
    }
    return acc;
  }, []);

  const monthlyPayments = payments.reduce((acc, payment) => {
    if (!payment.paid_date) return acc;
    const month = payment.paid_date.substring(0, 7);
    const existing = acc.find((item) => item.month === month);
    if (existing) {
      existing.amount += payment.amount || 0;
    } else {
      acc.push({ month, amount: payment.amount || 0 });
    }
    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-600 mt-1">Insights into your finances</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'Monthly Summary' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bills by Category</h2>
          {categoryData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No bill data" message="Add bills to see a category breakdown." />
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Amount']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full lg:w-64 space-y-2">
                {categoryData.map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-gray-700">{cat.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">${cat.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Trends' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Payment Trends</h2>
          {monthlyPayments.length === 0 ? (
            <EmptyState icon={BarChart3} title="No payment data" message="Record payments to see monthly trends." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyPayments}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Amount']} />
                <Legend />
                <Bar dataKey="amount" fill="#3b82f6" name="Total Payments" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeTab === 'Interest' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Interest Projection</h2>
          {interestData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No interest data" message="Add debts to see interest projections." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={interestData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, '']} />
                <Legend />
                <Area type="monotone" dataKey="total_remaining_balance" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Balance" />
                <Area type="monotone" dataKey="cumulative_interest" stroke="#ef4444" fill="#fca5a5" fillOpacity={0.3} name="Interest" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
