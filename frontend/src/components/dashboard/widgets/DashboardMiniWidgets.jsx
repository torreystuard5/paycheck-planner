import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Clock } from 'lucide-react';
import CurrencyDisplay from '../../CurrencyDisplay';
import { Badge, Card, cn } from '../../ui';
import { formatDate } from '../../../utils/formatDate';

export function WidgetViewAllLink({ href, label = 'View all' }) {
  if (!href) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <Link
        to={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700"
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export function EmptyWidgetMessage({ children }) {
  return <p className="text-body">{children}</p>;
}

function MiniRow({ label, value, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-body truncate">{label}</span>
      <span className={cn('shrink-0 text-sm font-semibold text-foreground', valueClassName)}>
        {value}
      </span>
    </div>
  );
}

export function BillsDebtsOverviewWidget({ bills, activeDebts, href }) {
  const billCount = Array.isArray(bills)
    ? bills.filter((b) => b.is_user_responsible !== false).length
    : 0;
  const totalDebt = activeDebts.reduce((s, d) => s + (Number(d.balance) || 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card variant="inset" className="p-3">
          <p className="text-caption">Active Bills</p>
          <p className="text-money mt-1">{billCount}</p>
        </Card>
        <Card variant="inset" className="p-3">
          <p className="text-caption">Debt Balance</p>
          <CurrencyDisplay amount={totalDebt} className="text-money mt-1 block" />
        </Card>
      </div>
      <WidgetViewAllLink href={href} label="Manage bills & debts" />
    </>
  );
}

export function SavingsGoalsWidget({ savingsGoals, href }) {
  if (!Array.isArray(savingsGoals) || savingsGoals.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No savings goals yet.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Add a savings goal" />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {savingsGoals.slice(0, 4).map((goal) => {
          const target = Number(goal.target_amount) || 0;
          const current = Number(goal.current_amount) || 0;
          const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
          return (
            <div key={goal.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{goal.name}</span>
                <span className="text-caption tabular-nums">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-caption mt-1">
                <CurrencyDisplay amount={current} className="inline" />
                {' / '}
                <CurrencyDisplay amount={target} className="inline" />
              </p>
            </div>
          );
        })}
      </div>
      <WidgetViewAllLink href={href} />
    </>
  );
}

export function IncomeSummaryWidget({ incomeSummary, href }) {
  const total = incomeSummary ? Number(incomeSummary.total_net) || 0 : 0;
  const count = incomeSummary?.paycheck_count || 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption">Net income this month</p>
          <CurrencyDisplay amount={total} className="text-money mt-1 block" />
        </div>
        <Badge variant="info" className="normal-case">
          {count} paycheck{count === 1 ? '' : 's'}
        </Badge>
      </div>
      <WidgetViewAllLink href={href} label="View income" />
    </>
  );
}

export function UpcomingBillsWidget({ bills, userDateFormat, href }) {
  const upcoming = (Array.isArray(bills) ? bills : [])
    .filter((b) => b.is_user_responsible !== false && !b.is_paid)
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No upcoming bills.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} />
      </>
    );
  }

  return (
    <>
      <Card variant="inset" className="divide-y divide-border p-0">
        {upcoming.map((bill) => (
          <div key={bill.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{bill.name}</p>
              <p className="text-caption flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {bill.due_date ? formatDate(bill.due_date, userDateFormat) : '—'}
              </p>
            </div>
            <CurrencyDisplay
              amount={Number(bill.user_share ?? bill.amount) || 0}
              className="shrink-0 text-sm font-semibold"
            />
          </div>
        ))}
      </Card>
      <WidgetViewAllLink href={href} />
    </>
  );
}

export function DebtSnapshotWidget({ activeDebts, href }) {
  if (activeDebts.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No active debts.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} />
      </>
    );
  }

  const paidCount = activeDebts.filter((d) => d.is_paid_this_period).length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge variant="debt" className="normal-case">
          {activeDebts.length} active
        </Badge>
        {paidCount > 0 && (
          <span className="text-caption flex items-center gap-1 text-brand-600">
            <CheckCircle className="h-3.5 w-3.5" />
            {paidCount} paid this period
          </span>
        )}
      </div>
      <Card variant="inset" className="divide-y divide-border p-0">
        {activeDebts.slice(0, 5).map((debt) => (
          <MiniRow
            key={debt.id}
            label={debt.name}
            value={<CurrencyDisplay amount={Number(debt.balance) || 0} className="inline" />}
          />
        ))}
      </Card>
      <WidgetViewAllLink href={href} />
    </>
  );
}

export function ReportsSpendingWidget({ categoryData, href }) {
  if (!categoryData?.length) {
    return (
      <>
        <EmptyWidgetMessage>Add bills to see spending by category.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Open reports" />
      </>
    );
  }

  const max = Math.max(...categoryData.map((c) => c.value));

  return (
    <>
      <div className="space-y-2.5">
        {categoryData.slice(0, 5).map((cat) => {
          const pct = max > 0 ? (cat.value / max) * 100 : 0;
          return (
            <div key={cat.name}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{cat.name}</span>
                <CurrencyDisplay amount={cat.value} className="shrink-0 font-medium" />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-accent-500/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <WidgetViewAllLink href={href} label="Full reports" />
    </>
  );
}

export function ReportsTrendsWidget({ monthlyPayments, href }) {
  if (!monthlyPayments?.length) {
    return (
      <>
        <EmptyWidgetMessage>Record payments to see trends.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Open reports" />
      </>
    );
  }

  const recent = monthlyPayments.slice(-6);
  const max = Math.max(...recent.map((m) => m.amount));

  return (
    <>
      <div className="flex items-end gap-1.5" style={{ height: '4.5rem' }} aria-hidden>
        {recent.map((m) => {
          const h = max > 0 ? (m.amount / max) * 100 : 0;
          return (
            <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t bg-brand-500/50"
                style={{ height: `${Math.max(h, 8)}%` }}
              />
              <span className="text-[9px] text-muted">{m.month.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <WidgetViewAllLink href={href} label="Full reports" />
    </>
  );
}

export function ShoppingListWidget({ items, household, href }) {
  if (!household) {
    return <EmptyWidgetMessage>Create or join a household to use the shopping list.</EmptyWidgetMessage>;
  }
  const pending = (items || []).filter((i) => !i.is_purchased).slice(0, 6);
  if (pending.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>Shopping list is empty.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Open household" />
      </>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {pending.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm text-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
            <span className="truncate">{item.name}</span>
            {item.quantity ? (
              <span className="text-caption ml-auto shrink-0">×{item.quantity}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <WidgetViewAllLink href={href} label="Open shopping list" />
    </>
  );
}

export function ChoreListWidget({ chores, household, href }) {
  if (!household) {
    return <EmptyWidgetMessage>Create or join a household to track chores.</EmptyWidgetMessage>;
  }
  const open = (chores || []).filter((c) => c.status !== 'completed').slice(0, 6);
  if (open.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No open chores.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Open household" />
      </>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {open.map((chore) => (
          <li key={chore.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-foreground">{chore.title || chore.name}</span>
            {chore.due_date && (
              <span className="text-caption shrink-0">{chore.due_date}</span>
            )}
          </li>
        ))}
      </ul>
      <WidgetViewAllLink href={href} label="Open chore list" />
    </>
  );
}

export function CalendarUpcomingWidget({ events, userDateFormat, href }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events || [])
    .filter((e) => e.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No upcoming events on your calendar.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} label="Open calendar" />
      </>
    );
  }

  return (
    <>
      <Card variant="inset" className="divide-y divide-border p-0">
        {upcoming.map((evt, i) => (
          <div key={`${evt.type}-${evt.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{evt.title}</p>
              <p className="text-caption">{formatDate(evt.date, userDateFormat)}</p>
            </div>
            <Badge variant={evt.type === 'paycheck' ? 'success' : evt.type === 'debt' ? 'debt' : 'warning'} className="normal-case shrink-0">
              {evt.type}
            </Badge>
          </div>
        ))}
      </Card>
      <WidgetViewAllLink href={href} label="Open calendar" />
    </>
  );
}

export function BudgetsOverviewWidget({ activeBudget, budgets, href }) {
  const list = Array.isArray(budgets) ? budgets : [];
  return (
    <>
      {activeBudget ? (
        <Card variant="inset" className="p-4">
          <p className="text-caption">Active budget</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{activeBudget.name}</p>
          {activeBudget.description && (
            <p className="text-caption mt-1 line-clamp-2">{activeBudget.description}</p>
          )}
        </Card>
      ) : (
        <EmptyWidgetMessage>No active budget selected.</EmptyWidgetMessage>
      )}
      {list.length > 1 && (
        <p className="text-caption mt-3">{list.length} budgets total</p>
      )}
      <WidgetViewAllLink href={href} label="Manage budgets" />
    </>
  );
}

export function TaxPrepReminderWidget({ taxSummary, href }) {
  const total = taxSummary ? Number(taxSummary.total_deductions ?? taxSummary.total) || 0 : 0;
  const count = taxSummary?.deduction_count ?? taxSummary?.count ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption">Deductions this tax year</p>
          <CurrencyDisplay amount={total} className="text-money mt-1 block" />
        </div>
        <Badge variant="warning" className="normal-case">
          {count} item{count === 1 ? '' : 's'}
        </Badge>
      </div>
      <WidgetViewAllLink href={href} label="Open tax prep" />
    </>
  );
}

export function PaymentsHistoryWidget({ payments, paymentTypeBadge, userDateFormat, href }) {
  if (!Array.isArray(payments) || payments.length === 0) {
    return (
      <>
        <EmptyWidgetMessage>No payments recorded yet.</EmptyWidgetMessage>
        <WidgetViewAllLink href={href} />
      </>
    );
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {payments.slice(0, 8).map((payment) => {
                const typeBadge = paymentTypeBadge(payment);
                return (
                  <tr key={payment.id} className="hover:bg-surface-subtle/60">
                    <td className="px-3 py-2.5 text-foreground">
                      {payment.paid_date ? formatDate(payment.paid_date, userDateFormat) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={typeBadge.variant} className="normal-case">
                        {typeBadge.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <CurrencyDisplay amount={payment.amount} className="font-medium" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <WidgetViewAllLink href={href} />
    </>
  );
}
