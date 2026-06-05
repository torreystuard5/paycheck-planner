import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import BusinessStatCard from '../../components/business/BusinessStatCard';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { businessData } from '../../services/businessApi';
import { Card, FilterChips } from '../../components/ui';

const RANGE_OPTIONS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

const fmtTooltip = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BusinessReports() {
  const { teamRole } = useBusinessAccess();
  const [range, setRange] = useState('month');
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      businessData.getReportsOverview({ range }),
      businessData.getReportsAnalytics(12),
    ])
      .then(([overviewRes, analyticsRes]) => {
        setData(overviewRes.data);
        setAnalytics(analyticsRes.data);
      })
      .catch(() => setError('Failed to load business reports.'))
      .finally(() => setLoading(false));
  }, [range]);

  const profit = data?.profit || {};
  const salesTrend = (data?.sales_trend || []).map((row) => ({
    date: row.date?.slice(5) || row.date,
    amount: Number(row.amount) || 0,
  }));
  const monthlyAnalytics = (analytics?.months || []).map((row) => ({
    label: row.label,
    sales: Number(row.sales) || 0,
    deductions: Number(row.deductions) || 0,
    net_profit: Number(row.net_profit) || 0,
  }));

  return (
    <BusinessPageShell
      title="Business Reports"
      description="Profit, expenses, and trends for your workspace"
      loading={loading}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-5xl"
      actions={(
        <FilterChips
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          aria-label="Report period"
        />
      )}
    >
      <div className="card-grid !gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BusinessStatCard label="Net profit" amount={profit.net_profit} tone="purple" />
        <BusinessStatCard label="Sales" amount={profit.total_sales} tone="brand" />
        <BusinessStatCard label="Deductions" amount={profit.total_deductions} tone="warning" />
        <BusinessStatCard label="Staff pay" amount={profit.total_staff_pay} tone="accent" />
      </div>

      {salesTrend.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-4">Sales trend</h2>
          <div className="h-56 min-h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => fmtTooltip(v)} />
                <Area type="monotone" dataKey="amount" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {monthlyAnalytics.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-4">12-month net profit</h2>
          <div className="h-64 min-h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyAnalytics}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => fmtTooltip(v)} />
                <Bar dataKey="net_profit" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-3">Deductions by category</h2>
          <ul className="space-y-2 text-sm">
            {(data?.deductions_by_category || []).map((row) => (
              <li key={row.category} className="flex justify-between gap-2">
                <span className="text-foreground">{row.category}</span>
                <CurrencyDisplay amount={row.amount} className="font-medium text-foreground" />
              </li>
            ))}
            {(!data?.deductions_by_category || data.deductions_by_category.length === 0) && (
              <li className="text-body">No deductions in this period</li>
            )}
          </ul>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-3">Fund balances</h2>
          <ul className="space-y-2 text-sm">
            {(data?.fund_balances || []).map((f) => (
              <li key={f.fund_type} className="flex justify-between gap-2 capitalize">
                <span className="text-foreground">{f.fund_type.replace('_', ' ')}</span>
                <CurrencyDisplay amount={f.balance} className="font-medium text-foreground" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="text-body">
        Deeper P&amp;L breakdown:{' '}
        <Link to="/business/net-profit" className="font-medium text-purple-600 hover:text-purple-700">
          Net Profit report
        </Link>
        {' · '}
        <Link to="/business/tax-prep" className="font-medium text-purple-600 hover:text-purple-700">
          Tax prep
        </Link>
      </p>
    </BusinessPageShell>
  );
}
