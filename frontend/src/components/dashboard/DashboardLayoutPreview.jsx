import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultWidgetOrder,
} from '../../config/dashboardWidgets';
import { getWidgetIcon } from '../../config/dashboardWidgetIcons';
import { buildPreviewSections } from '../../utils/dashboardLayout';
import { Badge, IconStat, cn } from '../ui';

function SkeletonLine({ width = 'w-full' }) {
  return <div className={cn('h-1.5 rounded-full bg-border/80', width)} aria-hidden />;
}

function OverviewPreviewMini() {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-6 rounded-md border border-border/60 bg-surface-subtle/80" />
      ))}
    </div>
  );
}

function TablePreviewMini() {
  return (
    <div className="mt-2 space-y-1.5" aria-hidden>
      <SkeletonLine />
      <SkeletonLine width="w-[92%]" />
      <SkeletonLine width="w-[80%]" />
    </div>
  );
}

function BarChartPreviewMini() {
  return (
    <div className="mt-2 flex items-end gap-1" style={{ height: '2.5rem' }} aria-hidden>
      {[40, 70, 55, 85, 60].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-brand-500/40"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function ListPreviewMini({ rows = 3 }) {
  return (
    <div className="mt-2 space-y-1.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i === rows - 1 ? 'w-[66%]' : 'w-full'} />
      ))}
    </div>
  );
}

function ProgressPreviewMini() {
  return (
    <div className="mt-2 space-y-2" aria-hidden>
      <SkeletonLine width="w-[50%]" />
      <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
        <div className="h-full w-[60%] rounded-full bg-purple-500/40" />
      </div>
    </div>
  );
}

function PreviewBody({ kind }) {
  switch (kind) {
    case 'overview':
      return <OverviewPreviewMini />;
    case 'paycheck_plan':
      return <ListPreviewMini rows={4} />;
    case 'quick_stats':
      return (
        <div className="mt-2 space-y-2" aria-hidden>
          <SkeletonLine width="w-[50%]" />
          <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
            <div className="h-full w-[60%] rounded-full bg-brand-500/40" />
          </div>
          <SkeletonLine width="w-[75%]" />
        </div>
      );
    case 'recent_payments':
    case 'payments_history':
    case 'upcoming_bills':
    case 'debt_snapshot':
    case 'calendar':
      return <TablePreviewMini />;
    case 'household_activity':
    case 'whats_new':
    case 'shopping_list':
    case 'chore_list':
      return <ListPreviewMini rows={2} />;
    case 'bills_debts':
      return (
        <div className="mt-2 grid grid-cols-2 gap-1.5" aria-hidden>
          <div className="h-8 rounded-md border border-border/60 bg-surface-subtle/80" />
          <div className="h-8 rounded-md border border-border/60 bg-surface-subtle/80" />
        </div>
      );
    case 'savings':
      return <ProgressPreviewMini />;
    case 'income':
    case 'budgets':
    case 'tax_prep':
      return <SkeletonLine width="w-[45%]" />;
    case 'reports_spending':
      return <BarChartPreviewMini />;
    case 'reports_trends':
      return <BarChartPreviewMini />;
    default:
      return <ListPreviewMini rows={2} />;
  }
}

function PreviewBlock({ widgetId, position }) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = getWidgetIcon(widgetId);
  const height = meta.preview?.height || 'md';
  const kind = meta.preview?.kind || widgetId;
  const isCompact = height === 'sm';
  const isTall = height === 'lg';

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-3 shadow-sm transition-all duration-200',
        isCompact && 'py-2.5',
        isTall && 'pb-3.5',
      )}
      aria-hidden
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <IconStat
              icon={Icon}
              tone={meta.iconTone || 'accent'}
              className="rounded-md p-1.5"
              iconClassName="h-3.5 w-3.5"
            />
          )}
          <span className="truncate text-xs font-semibold text-foreground">
            {meta.label}
          </span>
        </div>
        {position != null && (
          <Badge variant="neutral" className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums">
            {position}
          </Badge>
        )}
      </div>
      <PreviewBody kind={kind} />
    </div>
  );
}

function PreviewPlanRow({ ids, startPosition }) {
  return (
    <div className={cn('grid gap-2', ids.length === 2 && 'grid-cols-2')}>
      {ids.map((id, i) => (
        <PreviewBlock
          key={id}
          widgetId={id}
          position={startPosition + i}
        />
      ))}
    </div>
  );
}

export default function DashboardLayoutPreview({
  visibility,
  widgetOrder = defaultWidgetOrder(),
  className,
  embedded = false,
}) {
  const visibleCount = DASHBOARD_WIDGET_ORDER.filter((id) => visibility[id]).length;
  const sections = buildPreviewSections(widgetOrder, visibility);

  let positionCounter = 0;

  return (
    <div
      className={cn(
        embedded
          ? 'overflow-hidden rounded-xl border border-border bg-surface-subtle/50'
          : 'rounded-xl border border-border bg-surface-subtle/50 p-4',
        className,
      )}
    >
      {!embedded && (
        <div className="mb-4 px-4 pt-4">
          <p className="text-sm font-semibold text-foreground">Live preview</p>
          <p className="text-caption mt-0.5">
            {visibleCount === 0
              ? 'No widgets selected — your dashboard will be empty.'
              : `${visibleCount} widget${visibleCount === 1 ? '' : 's'} visible`}
          </p>
        </div>
      )}

      <div className={cn('p-3 sm:p-4', embedded && 'pt-3')}>
        <div className="mb-3 flex items-center gap-2 px-1" aria-hidden>
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Dashboard
          </span>
        </div>

        <div
          className="space-y-2.5 rounded-lg border border-border/80 bg-background p-3 sm:space-y-3 sm:p-4"
          aria-label="Dashboard layout preview"
        >
          {visibleCount === 0 ? (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No widgets visible</p>
              <p className="text-caption mt-1 max-w-[14rem]">
                Turn on at least one widget to preview your layout.
              </p>
            </div>
          ) : (
            sections.map((section) => {
              if (section.type === 'plan-row') {
                const start = positionCounter + 1;
                positionCounter += section.ids.length;
                return (
                  <PreviewPlanRow
                    key={`plan-${section.ids.join('-')}`}
                    ids={section.ids}
                    startPosition={start}
                  />
                );
              }
              positionCounter += 1;
              return (
                <PreviewBlock
                  key={section.id}
                  widgetId={section.id}
                  position={positionCounter}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
