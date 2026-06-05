import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  Banknote,
  PieChart,
  Plus,
} from 'lucide-react';
import { formatFriendlyDate } from '../../utils/formatDate';
import { formatApiError } from '../../utils/formatApiError';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import BusinessStatCard from '../../components/business/BusinessStatCard';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { businessData } from '../../services/businessApi';
import { Button, Card, cn } from '../../components/ui';

export default function BusinessDashboard() {
  const salesWrite = useBusinessWrite('manage_sales');
  const dedWrite = useBusinessWrite('manage_deductions');
  const payWrite = useBusinessWrite('manage_staff_pay');
  const fundWrite = useBusinessWrite('manage_funds');
  const { teamRole } = useBusinessAccess();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    businessData.getDashboard()
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const pct = (fund) => {
    if (!fund?.target_amount || Number(fund.target_amount) <= 0) return null;
    return Math.min(100, Math.round((Number(fund.current_balance) / Number(fund.target_amount)) * 100));
  };

  const quickAction = (write, to, label, variant) => {
    const btn = (
      <>
        <Plus className="h-4 w-4" />
        {label}
      </>
    );
    if (write.allowed) {
      return (
        <Link to={to} className="inline-flex">
          <Button variant={variant} type="button">{btn}</Button>
        </Link>
      );
    }
    return (
      <Button variant={variant} disabled title={write.title}>{btn}</Button>
    );
  };

  return (
    <BusinessPageShell
      title="Business Dashboard"
      description="Sales, profit, and funds at a glance"
      loading={loading}
      error={error}
      teamRole={teamRole}
    >
      <div className="card-grid !gap-4">
        <BusinessStatCard
          label="Today / week / MTD sales"
          amount={data?.mtd_sales}
          tone="brand"
          subAmounts={[
            { amount: data?.today_sales, className: 'text-brand-600 font-medium' },
            { amount: data?.week_sales, className: 'text-muted' },
          ]}
        />
        <BusinessStatCard label="MTD Deductions" amount={data?.mtd_deductions} tone="warning" />
        <BusinessStatCard label="MTD Staff Pay" amount={data?.mtd_staff_pay} tone="accent" />
        <BusinessStatCard label="MTD Net Profit" amount={data?.mtd_net_profit} tone="purple" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {['contingency_fund', 'upgrade_fund'].map((key) => {
          const fund = data?.[key];
          const label = key === 'contingency_fund' ? 'Contingency Fund' : 'Upgrade Fund';
          const to = key === 'contingency_fund' ? '/business/contingency-fund' : '/business/upgrade-fund';
          const p = pct(fund);
          return (
            <Card key={key} className="p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-title">{label}</h2>
                <Link to={to} className="text-caption font-medium text-purple-600 hover:text-purple-700">
                  Manage
                </Link>
              </div>
              {fund ? (
                <>
                  <CurrencyDisplay amount={fund.current_balance} className="text-money text-foreground" />
                  {fund.target_amount != null && (
                    <p className="text-caption mt-1">
                      Target <CurrencyDisplay amount={fund.target_amount} className="inline font-medium" />
                    </p>
                  )}
                  {p != null && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all"
                          style={{ width: `${p}%` }}
                        />
                      </div>
                      <p className="text-caption mt-1">{p}% of target</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-body">No fund yet</p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickAction(salesWrite, '/business/sales', 'Add Sale', 'primary')}
        {quickAction(dedWrite, '/business/deductions', 'Add Deduction', 'secondary')}
        {quickAction(payWrite, '/business/staff-pay', 'Pay Run', 'secondary')}
        {quickAction(fundWrite, '/business/contingency-fund', 'Fund Tx', 'secondary')}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { key: 'recent_sales', title: 'Recent sales', icon: TrendingUp, tone: 'text-brand-600', items: data?.recent_sales, render: (s) => (
            <>
              <span className="truncate text-foreground">{s.source || s.category || 'Sale'}</span>
              <span className="flex shrink-0 flex-col items-end text-xs">
                <CurrencyDisplay amount={s.amount} className="font-semibold text-foreground" />
                <span className="text-muted">{formatFriendlyDate(s.date)}</span>
              </span>
            </>
          ) },
          { key: 'recent_deductions', title: 'Recent deductions', icon: Receipt, tone: 'text-warning-600', items: data?.recent_deductions, render: (d) => (
            <>
              <span className="truncate text-foreground">{d.category}</span>
              <span className="shrink-0 text-muted">{formatFriendlyDate(d.date)}</span>
            </>
          ) },
          { key: 'recent_pay_runs', title: 'Recent pay runs', icon: Banknote, tone: 'text-accent-600', items: data?.recent_pay_runs, render: (p) => (
            <>
              <span className="text-foreground">Net pay</span>
              <CurrencyDisplay amount={p.net_pay} className="shrink-0 font-medium text-foreground" />
            </>
          ) },
        ].map(({ key, title, icon: Icon, tone, items, render }) => (
          <Card key={key} className="p-4">
            <h3 className={cn('text-title mb-3 flex items-center gap-2')}>
              <Icon className={cn('h-4 w-4', tone)} />
              {title}
            </h3>
            <ul className="space-y-2 text-sm">
              {(items || []).map((item) => (
                <li key={item.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0">
                  {render(item)}
                </li>
              ))}
              {(!items || items.length === 0) && (
                <li className="text-body">Nothing recorded yet</li>
              )}
            </ul>
          </Card>
        ))}
      </div>

      <Link
        to="/business/net-profit"
        className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900"
      >
        <PieChart className="h-4 w-4" />
        View net profit report
      </Link>
    </BusinessPageShell>
  );
}
