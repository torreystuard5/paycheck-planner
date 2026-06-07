import { Suspense } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import { parseISO, formatDistanceToNow } from 'date-fns';
import LoadingSpinner from '../LoadingSpinner';
import CurrencyDisplay from '../CurrencyDisplay';
import { WhatsNewUnseenBadge } from '../RecentUpdates';
import DashboardWidget from './DashboardWidget';
import { buildDashboardSections } from '../../utils/dashboardLayout';
import { formatDate } from '../../utils/formatDate';
import { Badge, Card, cn } from '../ui';

function MetricRow({ label, value, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-body">{label}</span>
      <span className={cn('text-sm font-semibold text-foreground', valueClassName)}>{value}</span>
    </div>
  );
}

const WIDGET_META = {
  overview: { title: 'At a Glance', icon: DollarSign, iconTone: 'brand' },
  paycheck_plan: { title: 'Current Paycheck Plan', icon: Calendar, iconTone: 'accent' },
  quick_stats: { title: 'Quick Stats', icon: TrendingUp, iconTone: 'brand' },
  recent_payments: { title: 'Recent Activity', icon: Activity, iconTone: 'brand' },
  household_activity: { title: 'Recent Household Activity', icon: Activity, iconTone: 'accent' },
  whats_new: { title: "What's New", icon: Rocket, iconTone: 'purple' },
};

export default function DashboardWidgetSections({
  widgetOrder,
  widgetVisibility,
  collapsedSections,
  onToggleCollapse,
  PaycheckPlanEnvelope,
  RecentUpdates,
  summaryCards,
  paycheckPlan,
  assignItemPaid,
  assignItemKey,
  checklistLoading,
  onToggleItem,
  onPullForward,
  onRevertOverride,
  overrideBusyKey,
  overrideItemKey,
  hidingOverdue,
  onHideOverdue,
  showHiddenOverdue,
  onToggleShowHidden,
  creditScore,
  creditRatingMeta,
  bills,
  activeDebts,
  paidCount,
  totalBillCount,
  recentPayments,
  paymentTypeBadge,
  userDateFormat,
  household,
  recentActivity,
  whatsNewExpanded,
}) {
  const sections = buildDashboardSections(widgetOrder, widgetVisibility);

  const isWidgetVisible = (id) => {
    if (!widgetVisibility[id]) return false;
    if (id === 'household_activity') {
      return Boolean(household && recentActivity.length > 0);
    }
    return true;
  };

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.type === 'plan-row') {
          return (
            <div
              key={`plan-${section.ids.join('-')}`}
              className={cn(
                'grid grid-cols-1 gap-5 lg:gap-6',
                section.ids.length === 2 && 'lg:grid-cols-2',
              )}
            >
              {section.ids.map((widgetId) => renderWidgetBody(widgetId))}
            </div>
          );
        }
        return renderWidgetBody(section.id);
      })}
    </div>
  );

  function renderWidgetBody(widgetId) {
    const meta = WIDGET_META[widgetId];
    if (!meta || !isWidgetVisible(widgetId)) return null;

    const shellProps = {
      widgetId,
      visible: true,
      title: meta.title,
      icon: meta.icon,
      iconTone: meta.iconTone,
      collapsed: collapsedSections,
      onToggleCollapse,
      badge: widgetId === 'whats_new' ? <WhatsNewUnseenBadge /> : null,
    };

    switch (widgetId) {
      case 'overview':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            <div className="card-grid !gap-4">
              {summaryCards}
            </div>
          </DashboardWidget>
        );

      case 'paycheck_plan':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            <Suspense fallback={<LoadingSpinner label="Loading paycheck plan" />}>
              <PaycheckPlanEnvelope
                paycheckPlan={paycheckPlan}
                assignItemPaid={assignItemPaid}
                assignItemKey={assignItemKey}
                checklistLoading={checklistLoading}
                onToggleItem={onToggleItem}
                onPullForward={onPullForward}
                onRevertOverride={onRevertOverride}
                overrideBusyKey={overrideBusyKey}
                overrideItemKey={overrideItemKey}
                hidingOverdue={hidingOverdue}
                onHideOverdue={onHideOverdue}
                showHiddenOverdue={showHiddenOverdue}
                onToggleShowHidden={onToggleShowHidden}
                className="border-0 shadow-none"
              />
            </Suspense>
          </DashboardWidget>
        );

      case 'quick_stats':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            <div className="space-y-4">
              {creditScore ? (
                (() => {
                  const pct = Number(creditScore.overall_utilization_pct || 0);
                  const rating = creditRatingMeta(pct);
                  return (
                    <div>
                      <div className="mb-3 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-caption">Credit Utilization</p>
                          <p className="text-money mt-1">
                            {creditScore.overall_utilization_pct != null
                              ? `${creditScore.overall_utilization_pct}%`
                              : '--'}
                          </p>
                        </div>
                        <Badge variant={rating.variant} className="normal-case">
                          {rating.label}
                        </Badge>
                      </div>
                      {creditScore.overall_utilization_pct != null && (
                        <div>
                          <div className="mb-1.5 flex justify-between text-caption">
                            <span>Utilization</span>
                            <span className="font-medium text-foreground">
                              {(isFinite(pct) ? pct : 0).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                            <div
                              className={cn('h-full rounded-full transition-all', rating.bar)}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="text-body">Add debts to see credit card utilization.</p>
              )}

              <Card variant="inset" className="divide-y divide-border p-0">
                <div className="px-4">
                  <MetricRow
                    label="Monthly Bills"
                    value={Array.isArray(bills) ? bills.filter((b) => b.is_user_responsible !== false).length : 0}
                  />
                </div>
                <div className="px-4">
                  <MetricRow label="Active Debts" value={activeDebts.length} />
                </div>
                {totalBillCount > 0 && (
                  <div className="px-4">
                    <MetricRow
                      label={(
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-brand-600" />
                          Bills Paid This Month
                        </span>
                      )}
                      value={`${paidCount} of ${totalBillCount}`}
                      valueClassName={paidCount === totalBillCount ? 'text-brand-600' : undefined}
                    />
                  </div>
                )}
              </Card>
            </div>
          </DashboardWidget>
        );

      case 'recent_payments':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            {Array.isArray(recentPayments) && recentPayments.length > 0 ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
                <div className="max-h-[min(22rem,52vh)] overflow-x-auto overflow-y-auto overscroll-contain sm:max-h-72">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead className="sticky top-0 z-[1] bg-surface-subtle shadow-[0_1px_0_0_var(--color-border)]">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted">Date</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted">Type</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentPayments.map((payment) => {
                        const typeBadge = paymentTypeBadge(payment);
                        return (
                          <tr key={payment.id} className="hover:bg-surface-subtle/60">
                            <td className="px-4 py-3 text-foreground">
                              {payment.paid_date ? formatDate(payment.paid_date, userDateFormat) : '--'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={typeBadge.variant} className="normal-case">
                                  {typeBadge.label}
                                </Badge>
                                {payment.is_extra && (
                                  <Badge variant="purple" className="normal-case">
                                    Extra
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <CurrencyDisplay amount={payment.amount} className="font-medium text-foreground" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-xl bg-gradient-to-t from-surface to-transparent"
                  aria-hidden
                />
              </div>
            ) : (
              <p className="text-body">No recent payments recorded.</p>
            )}
          </DashboardWidget>
        );

      case 'household_activity':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                    {(item.user_first_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{item.user_first_name}</span>
                      {' '}{item.action}{' '}
                      {item.entity_type.replace(/_/g, ' ')}
                      {' '}&apos;{item.entity_name}&apos;
                    </p>
                    <p className="text-caption mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.created_at
                        ? formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })
                        : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardWidget>
        );

      case 'whats_new':
        return (
          <DashboardWidget key={widgetId} {...shellProps}>
            <Suspense fallback={<LoadingSpinner label="Loading updates" />}>
              <RecentUpdates embedded isExpanded={whatsNewExpanded} />
            </Suspense>
          </DashboardWidget>
        );

      default:
        return null;
    }
  }
}
