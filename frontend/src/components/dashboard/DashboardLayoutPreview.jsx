import {
  Activity,
  Calendar,
  DollarSign,
  Rocket,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultWidgetOrder,
} from '../../config/dashboardWidgets';
import { buildPreviewSections } from '../../utils/dashboardLayout';
import { Card, IconStat, cn } from '../ui';

const WIDGET_ICONS = {
  overview: DollarSign,
  paycheck_plan: Calendar,
  quick_stats: TrendingUp,
  recent_payments: Activity,
  household_activity: Users,
  whats_new: Rocket,
};

const HEIGHT_CLASS = {
  sm: 'h-10',
  md: 'h-14',
  lg: 'h-[4.5rem]',
};

function PreviewBlock({ widgetId, className, style }) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = WIDGET_ICONS[widgetId];
  const height = HEIGHT_CLASS[meta.preview?.height || 'md'];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-all duration-200',
        height,
        className,
      )}
      style={style}
      aria-hidden
    >
      <div className="flex h-full items-center gap-2 px-2.5">
        {Icon && (
          <IconStat
            icon={Icon}
            tone={meta.iconTone || 'accent'}
            className="rounded-md p-1.5"
            iconClassName="h-3 w-3"
          />
        )}
        <span className="truncate text-[10px] font-medium text-foreground sm:text-xs">
          {meta.label}
        </span>
      </div>
    </div>
  );
}

function PreviewPlanRow({ ids, className, style }) {
  return (
    <div
      className={cn('grid gap-2', ids.length === 2 && 'grid-cols-2', className)}
      style={style}
    >
      {ids.map((id) => (
        <PreviewBlock key={id} widgetId={id} />
      ))}
    </div>
  );
}

export default function DashboardLayoutPreview({
  visibility,
  widgetOrder = defaultWidgetOrder(),
  className,
}) {
  const visibleCount = DASHBOARD_WIDGET_ORDER.filter((id) => visibility[id]).length;
  const sections = buildPreviewSections(widgetOrder, visibility);

  return (
    <Card variant="inset" className={cn('p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Live preview</p>
          <p className="text-caption mt-0.5">
            {visibleCount === 0
              ? 'No widgets selected — your dashboard will be empty.'
              : `${visibleCount} widget${visibleCount === 1 ? '' : 's'} visible`}
          </p>
        </div>
      </div>

      <div
        className="mx-auto max-w-sm space-y-2 rounded-xl border border-border/80 bg-background p-3"
        aria-label="Dashboard layout preview"
      >
        {visibleCount === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
            <p className="text-caption text-muted">Turn widgets on to see your layout</p>
          </div>
        ) : (
          sections.map((section, index) => {
            if (section.type === 'plan-row') {
              return (
                <PreviewPlanRow
                  key={`plan-${section.ids.join('-')}`}
                  ids={section.ids}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 40}ms` }}
                />
              );
            }
            return (
              <PreviewBlock
                key={section.id}
                widgetId={section.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 40}ms` }}
              />
            );
          })
        )}
      </div>
    </Card>
  );
}

export { WIDGET_ICONS };
