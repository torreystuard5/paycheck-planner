import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Percent,
  Receipt,
  FileText,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import {
  Badge,
  Card,
  FilterChips,
  IconStat,
  PageHeader,
} from '../components/ui';

const toSafeNumber = (value) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return isFinite(num) ? num : 0;
};

const fmtMoney = (value) => `$${toSafeNumber(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

const TABS = [
  { key: 'summary', label: 'Monthly Summary' },
  { key: 'trends', label: 'Trends' },
  { key: 'interest', label: 'Interest' },
];

const CHART_COLORS = [
  '#2563eb', // accent-600
  '#f97316', // debt-500
  '#16a34a', // brand-600
  '#d97706', // warning-600
  '#9333ea', // purple-600
  '#db2777',
  '#0891b2',
  '#ea580c',
];

const chartTooltipStyle = {
  borderRadius: '0.5rem',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: '0.8125rem',
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('summary');
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

  const categoryData = useMemo(() => bills.reduce((acc, bill) => {
    const cat = bill.category || 'Other';
    const existing = acc.find((item) => item.name === cat);
    if (existing) {
      existing.value += toSafeNumber(bill.amount);
    } else {
      acc.push({ name: cat, value: toSafeNumber(bill.amount) });
    }
    return acc;
  }, []).sort((a, b) => b.value - a.value), [bills]);

  const monthlyPayments = useMemo(() => payments.reduce((acc, payment) => {
    if (!payment.paid_date) return acc;
    const month = payment.paid_date.substring(0, 7);
    const existing = acc.find((item) => item.month === month);
    if (existing) {
      existing.amount += toSafeNumber(payment.amount);
    } else {
      acc.push({ month, amount: toSafeNumber(payment.amount) });
    }
    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month)), [payments]);

  const stats = useMemo(() => {
    const totalBills = bills.reduce((s, b) => s + toSafeNumber(b.amount), 0);
    const totalPaid = payments.reduce((s, p) => s + toSafeNumber(p.amount), 0);
    const latestInterest = interestData.length > 0 ? interestData[interestData.length - 1] : null;
    const projectedInterest = latestInterest ? toSafeNumber(latestInterest.cumulative_interest) : 0;
    const remainingBalance = latestInterest ? toSafeNumber(latestInterest.total_remaining_balance) : 0;
    return {
      totalBills,
      totalPaid,
      categoryCount: categoryData.length,
      monthCount: monthlyPayments.length,
      projectedInterest,
      remainingBalance,
    };
  }, [bills, payments, categoryData, monthlyPayments, interestData]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title="Reports"
        description="Insights into spending, payments, and debt interest"
      />

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</Card>
      )}

      <div className="card-grid">
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={FileText} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Monthly bills</p>
          </div>
          <CurrencyDisplay amount={stats.totalBills} className="text-money block" />
          <p className="text-caption mt-1">{stats.categoryCount} categories</p>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={Receipt} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Total paid</p>
          </div>
          <CurrencyDisplay amount={stats.totalPaid} className="text-money block text-brand-600" />
          <p className="text-caption mt-1">{stats.monthCount} months tracked</p>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={Percent} tone="debt" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Projected interest</p>
          </div>
          <CurrencyDisplay amount={stats.projectedInterest} className="text-money block text-debt-600" />
          <p className="text-caption mt-1">
            {stats.remainingBalance > 0 ? `${fmtMoney(stats.remainingBalance)} balance` : 'No debt data'}
          </p>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={TrendingUp} tone="purple" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Payment trend</p>
          </div>
          <p className="text-money">
            {monthlyPayments.length > 0
              ? fmtMoney(monthlyPayments[monthlyPayments.length - 1].amount)
              : '$0.00'}
          </p>
          <p className="text-caption mt-1">Latest month</p>
        </Card>
      </div>

      <FilterChips options={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'summary' && (
        <Card className="p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-title">Bills by category</h2>
              <p className="text-caption mt-0.5">Where your recurring bills are allocated</p>
            </div>
            <Badge variant="info" className="normal-case gap-1">
              <PieChartIcon className="h-3 w-3" />
              Breakdown
            </Badge>
          </div>
          {categoryData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No Bill Data" message="Add bills to see a category breakdown." />
          ) : (
            <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
              <div className="w-full max-w-sm">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [fmtMoney(value), 'Amount']}
                      contentStyle={chartTooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full flex-1 space-y-2">
                {categoryData.map((cat, idx) => {
                  const pct = stats.totalBills > 0 ? (cat.value / stats.totalBills) * 100 : 0;
                  return (
                    <div key={cat.name} className="rounded-xl border border-border/60 bg-surface-subtle/50 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                          <span className="truncate font-medium capitalize">{cat.name}</span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{fmtMoney(cat.value)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                          }}
                        />
                      </div>
                      <p className="text-caption mt-1 text-right">{pct.toFixed(1)}% of total</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'trends' && (
        <Card className="p-5 sm:p-6">
          <div className="mb-6">
            <h2 className="text-title">Monthly payment trends</h2>
            <p className="text-caption mt-0.5">Total payments recorded per month</p>
          </div>
          {monthlyPayments.length === 0 ? (
            <EmptyState icon={BarChart3} title="No Payment Data" message="Record payments to see monthly trends." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyPayments} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => [fmtMoney(value), 'Payments']} contentStyle={chartTooltipStyle} />
                <Legend />
                <Bar dataKey="amount" fill="#16a34a" name="Total Payments" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {activeTab === 'interest' && (
        <Card className="p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-title">Interest projection</h2>
              <p className="text-caption mt-0.5">Balance vs cumulative interest over time</p>
            </div>
            <div className="flex gap-3 text-caption">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent-500" />
                Balance
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-debt-500" />
                Interest
              </span>
            </div>
          </div>
          {interestData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No Interest Data" message="Add debts to see interest projections." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={interestData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => [fmtMoney(value), '']} contentStyle={chartTooltipStyle} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total_remaining_balance"
                  stroke="#2563eb"
                  fill="#93c5fd"
                  fillOpacity={0.25}
                  name="Balance"
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_interest"
                  stroke="#f97316"
                  fill="#fdba74"
                  fillOpacity={0.25}
                  name="Interest"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}
    </div>
  );
}
