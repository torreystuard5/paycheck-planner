import { useMemo } from 'react';
import {
  Wallet,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import CurrencyDisplay from './CurrencyDisplay';
import PaycheckPlanItemActions from './PaycheckPlanItemActions';
import EmptyState from './EmptyState';
import { Badge, Button, Card, cn } from './ui';
import { formatPaycheckDate } from '../utils/formatDate';
import { formatAssignedItemDueLabel } from '../utils/assignedItemDueLabel';

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

function AssignedItemDueLabel({ item, isChecked }) {
  const dueLabel = formatAssignedItemDueLabel(item);
  if (!dueLabel) return null;

  return (
    <p
      className={cn(
        'text-caption mt-0.5 tabular-nums',
        isChecked && 'text-muted',
        !isChecked && dueLabel.isOverdue && 'text-danger-600',
        !isChecked && !dueLabel.isOverdue && 'text-muted',
      )}
    >
      {dueLabel.text}
    </p>
  );
}

export default function PaycheckPlanEnvelope({
  paycheckPlan,
  assignItemPaid,
  assignItemKey,
  checklistLoading = {},
  onToggleItem,
  onPullForward,
  onRevertOverride,
  overrideBusyKey,
  overrideItemKey,
  hidingOverdue = {},
  onHideOverdue,
  showHiddenOverdue = false,
  onToggleShowHidden,
  className,
}) {
  const hasPlan =
    Boolean(paycheckPlan)
    && (
      Boolean(paycheckPlan.current_paycheck)
      || (Array.isArray(paycheckPlan.paychecks) && paycheckPlan.paychecks.length > 0)
      || paycheckPlan.current_paycheck_date
    );

  if (!hasPlan) {
    return (
      <Card className={className}>
        <EmptyState
          icon={Wallet}
          title="No paycheck plan yet"
          message="Log a paycheck on Income and add bills or debts to build your envelope allocation."
        />
      </Card>
    );
  }

  const current = paycheckPlan.current_paycheck || paycheckPlan.paychecks[0];
  const payPeriodStart = current.pay_period_start || current.paycheck_date;
  const assignedItems = Array.isArray(current.assigned_items) ? current.assigned_items : [];

  const { visibleItems, hiddenOverdueItems, sortedItems, stats } = useMemo(() => {
    const visible = assignedItems.filter(
      (item) => !(item.is_overdue && item.hidden_overdue && !assignItemPaid(item)),
    );
    const hidden = assignedItems.filter(
      (item) => item.is_overdue && item.hidden_overdue && !assignItemPaid(item),
    );
    const sorted = [...visible].sort((a, b) => {
      const aChecked = assignItemPaid(a);
      const bChecked = assignItemPaid(b);
      if (aChecked !== bChecked) return aChecked ? 1 : -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

    const checkedCount = current.assigned_paid_count ?? visible.filter((i) => assignItemPaid(i)).length;
    const totalItems = current.assigned_total_count ?? visible.length;
    const progressPct = current.assigned_progress_percent ?? (totalItems > 0 ? (checkedCount / totalItems) * 100 : 0);
    const totalAssignedAmount = Number(
      current.assigned_total_amount ?? visible.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    );
    const paidAmount = Number(
      current.assigned_paid_amount
      ?? visible.filter((i) => assignItemPaid(i)).reduce((s, i) => s + (Number(i.amount) || 0), 0),
    );
    const stillOwed = Number(current.assigned_still_owed ?? (totalAssignedAmount - paidAmount));

    const billAssigned = visible
      .filter((i) => i.item_type === 'bill')
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const debtAssigned = visible
      .filter((i) => i.item_type === 'debt')
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);

    return {
      visibleItems: visible,
      hiddenOverdueItems: hidden,
      sortedItems: sorted,
      stats: {
        checkedCount,
        totalItems,
        progressPct,
        totalAssignedAmount,
        paidAmount,
        stillOwed,
        billAssigned,
        debtAssigned,
      },
    };
  }, [assignedItems, assignItemPaid, current]);

  const paycheckAmt = Number(current.paycheck_amount) || 0;
  const totalDue = Number(current.total_due) || 0;
  const remaining = Number(current.remaining) || 0;

  const billBarPct = paycheckAmt > 0 ? Math.min((stats.billAssigned / paycheckAmt) * 100, 100) : 0;
  const debtBarPct = paycheckAmt > 0 ? Math.min((stats.debtAssigned / paycheckAmt) * 100, 100 - billBarPct) : 0;
  const remainBarPct = paycheckAmt > 0
    ? Math.max(0, Math.min((Math.max(remaining, 0) / paycheckAmt) * 100, 100 - billBarPct - debtBarPct))
    : 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Envelope header */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-4 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-3 ring-1 ring-white/20">
              <Wallet className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-100">
                Paycheck envelope
              </p>
              <CurrencyDisplay
                amount={current.paycheck_amount}
                className="mt-0.5 block text-2xl font-bold text-white sm:text-3xl"
              />
              <p className="mt-1 text-xs text-brand-100">
                Pay period {formatPaycheckDate(current.paycheck_date)}
              </p>
            </div>
          </div>
          {paycheckPlan.next_paycheck_date && (
            <div className="rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15">
              <p className="text-xs text-brand-100">Next paycheck</p>
              <p className="font-semibold">{formatPaycheckDate(paycheckPlan.next_paycheck_date)}</p>
            </div>
          )}
        </div>

        {paycheckAmt > 0 && (
          <div className="mt-5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/20">
              {billBarPct > 0 && (
                <div
                  className="bg-accent-300 transition-all duration-500"
                  style={{ width: `${billBarPct}%` }}
                  title="Bills"
                />
              )}
              {debtBarPct > 0 && (
                <div
                  className="bg-debt-300 transition-all duration-500"
                  style={{ width: `${debtBarPct}%` }}
                  title="Debts"
                />
              )}
              {remainBarPct > 0 && (
                <div
                  className="bg-white/50 transition-all duration-500"
                  style={{ width: `${remainBarPct}%` }}
                  title="Remaining"
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-100">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent-300" />
                Bills {fmtCurrency(stats.billAssigned)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-debt-300" />
                Debts {fmtCurrency(stats.debtAssigned)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white/50" />
                Unassigned {fmtCurrency(Math.max(remaining, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Remaining to assign — hero */}
      <div className="border-b border-border bg-brand-50/60 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-brand-700">
              Remaining to assign
            </p>
            <CurrencyDisplay
              amount={remaining}
              className={cn(
                'text-money mt-1 block',
                remaining >= 0 ? 'text-brand-700' : 'text-danger-600',
              )}
            />
            <p className="text-caption mt-1 text-muted">
              {remaining >= 0
                ? 'Left after bills and debts are allocated'
                : 'Over-allocated — review assigned amounts'}
            </p>
          </div>
          <div className="flex gap-6 sm:text-right">
            <div>
              <p className="text-caption">Total due</p>
              <CurrencyDisplay amount={totalDue} className="text-lg font-bold text-foreground" />
            </div>
            <div>
              <p className="text-caption">Assigned</p>
              <CurrencyDisplay amount={stats.totalAssignedAmount} className="text-lg font-bold text-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Assigned items */}
      {stats.totalItems > 0 ? (
        <div className="p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Assigned items</p>
            <Badge variant="success" className="normal-case">
              {stats.checkedCount}/{stats.totalItems} paid
            </Badge>
          </div>

          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${stats.progressPct}%` }}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
            <span className="font-semibold text-brand-600">Paid: {fmtCurrency(stats.paidAmount)}</span>
            <span className="text-muted">of {fmtCurrency(stats.totalAssignedAmount)}</span>
            <span className="text-muted">·</span>
            <span className="font-semibold text-warning-600">
              Still owed: {fmtCurrency(stats.stillOwed)}
            </span>
          </div>

          <div className="space-y-2">
            {sortedItems.map((item) => {
              const key = assignItemKey(item);
              const isChecked = assignItemPaid(item);
              const isToggling = !!checklistLoading[key];
              const isSplit = item.is_split || (item.split_count && item.split_count > 1);
              const isHiding = !!hidingOverdue[item.id || item.item_id];

              return (
                <div
                  key={key}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors',
                    item.is_overdue && !isChecked && 'border-danger-200 bg-danger-50',
                    isChecked && 'bg-surface-subtle',
                    !isChecked && !item.is_overdue && 'hover:border-border hover:bg-surface-subtle',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggleItem?.(item, payPeriodStart)}
                    disabled={isToggling || !onToggleItem}
                    className={cn(
                      'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isToggling && 'opacity-50',
                      isChecked ? 'text-brand-600' : 'text-muted hover:bg-surface-subtle hover:text-foreground',
                    )}
                    aria-label={isChecked ? 'Mark unpaid' : 'Mark paid'}
                  >
                    {isChecked ? <CheckSquare className="h-5 w-5" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate font-medium',
                          isChecked ? 'text-muted line-through' : 'text-foreground',
                        )}
                      >
                        {item.name}
                      </span>
                      {item.is_overdue && !isChecked && (
                        <Badge variant="danger" className="normal-case px-1.5 py-0 text-[10px]">
                          Overdue
                        </Badge>
                      )}
                      {item.pulled_forward && (
                        <Badge variant="warning" className="normal-case px-1.5 py-0 text-[10px]">
                          Pulled forward
                        </Badge>
                      )}
                      {isSplit && (
                        <Badge variant="purple" className="normal-case px-1.5 py-0 text-[10px]">
                          Your share
                        </Badge>
                      )}
                      <Badge
                        variant={item.item_type === 'debt' ? 'debt' : 'info'}
                        className="normal-case px-1.5 py-0 text-[10px]"
                      >
                        {item.item_type}
                      </Badge>
                    </div>
                    <AssignedItemDueLabel item={item} isChecked={isChecked} />
                    {item.pulled_forward && item.original_pay_period_start && (
                      <p className="text-caption mt-0.5">
                        From {formatPaycheckDate(item.original_pay_period_start)}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <CurrencyDisplay
                      amount={item.amount}
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        isChecked ? 'text-muted line-through' : 'text-foreground',
                      )}
                    />
                    {isSplit && item.full_amount && (
                      <p className="text-caption">of {fmtCurrency(item.full_amount)}</p>
                    )}
                  </div>

                  {item.is_overdue && !isChecked && item.item_type === 'bill' && onHideOverdue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onHideOverdue(item.id || item.item_id, false)}
                      disabled={isHiding}
                      className="min-h-8 shrink-0 px-1.5"
                      title="Hide overdue"
                      aria-label="Hide overdue"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {onPullForward && onRevertOverride && (
                    <PaycheckPlanItemActions
                      item={item}
                      busy={overrideBusyKey === overrideItemKey?.(item)}
                      compact
                      onPullForward={onPullForward}
                      onRevert={onRevertOverride}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {hiddenOverdueItems.length > 0 && onToggleShowHidden && (
            <div className="mt-4 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleShowHidden}
                className="h-auto min-h-0 w-full justify-start px-0 text-caption text-muted hover:text-foreground"
              >
                {showHiddenOverdue ? (
                  <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                )}
                {hiddenOverdueItems.length} hidden overdue{' '}
                {hiddenOverdueItems.length === 1 ? 'item' : 'items'}
              </Button>

              {showHiddenOverdue && (
                <div className="mt-2 space-y-2">
                  {hiddenOverdueItems.map((item) => {
                    const key = `${item.item_type}_${item.id || item.item_id}`;
                    const isHiding = !!hidingOverdue[item.id || item.item_id];
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-sm opacity-70"
                      >
                        <span className="w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-muted">{item.name}</span>
                            <Badge variant="neutral" className="normal-case px-1.5 py-0 text-[10px]">
                              Hidden
                            </Badge>
                          </div>
                          <AssignedItemDueLabel item={item} isChecked={false} />
                        </div>
                        <CurrencyDisplay amount={item.amount} className="shrink-0 text-sm text-muted" />
                        {onHideOverdue && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onHideOverdue(item.id || item.item_id, true)}
                            disabled={isHiding}
                            className="min-h-8 shrink-0 px-1.5"
                            title="Show overdue"
                            aria-label="Show overdue"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-2 sm:px-6">
          <EmptyState
            title="Nothing assigned yet"
            message="Bills and debts due this pay period will appear here once allocated."
          />
        </div>
      )}
    </Card>
  );
}
