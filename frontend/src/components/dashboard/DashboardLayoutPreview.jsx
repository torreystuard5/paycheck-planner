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
  DASHBOARD_WIDGET_PLAN_ROW,
} from '../../config/dashboardWidgets';
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

function PreviewBlock({ widgetId, visible }) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = WIDGET_ICONS[widgetId];
  const height = HEIGHT_CLASS[meta.preview?.height || 'md'];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-all duration-200',
        visible
          ? 'border-border bg-surface shadow-sm'
          : 'border-dashed border-border/60 bg-surface-subtle/40 opacity-40',
        height,
      )}
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

function PreviewPlanRow({ visibility }) {
  const visibleIds = DASHBOARD_WIDGET_PLAN_ROW.filter((id) => visibility[id]);
  if (visibleIds.length === 0) return null;

  return (
    <div className={cn('grid gap-2', visibleIds.length === 2 && 'grid-cols-2')}>
      {visibleIds.map((id) => (
        <PreviewBlock key={id} widgetId={id} visible />
      ))}
    </div>
  );
}

export default function DashboardLayoutPreview({ visibility, className }) {
  const visibleCount = DASHBOARD_WIDGET_ORDER.filter((id) => visibility[id]).length;

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
          DASHBOARD_WIDGET_ORDER.map((widgetId) => {
            const meta = DASHBOARD_WIDGETS[widgetId];
            if (meta.preview?.row === 'plan') {
              if (widgetId !== 'paycheck_plan') return null;
              return <PreviewPlanRow key="plan-row" visibility={visibility} />;
            }
            if (!visibility[widgetId]) return null;
            return (
              <PreviewBlock key={widgetId} widgetId={widgetId} visible />
            );
          })
        )}
      </div>
    </Card>
  );
}

export { WIDGET_ICONS };
