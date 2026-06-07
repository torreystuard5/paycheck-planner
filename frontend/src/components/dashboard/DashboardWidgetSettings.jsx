import { useEffect, useRef } from 'react';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { DASHBOARD_WIDGET_ORDER, DASHBOARD_WIDGETS } from '../../config/dashboardWidgets';
import { Badge, Button, Card, cn } from '../ui';

export default function DashboardWidgetSettings({
  open,
  onOpenChange,
  visibility,
  onToggleWidget,
  onReset,
  visibleCount,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      onOpenChange(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="dashboard-widget-settings-panel"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Widgets
        {visibleCount < DASHBOARD_WIDGET_ORDER.length && (
          <Badge variant="neutral" className="ml-0.5 normal-case px-1.5 py-0 text-[10px]">
            {visibleCount}/{DASHBOARD_WIDGET_ORDER.length}
          </Badge>
        )}
      </Button>

      {open && (
        <Card
          id="dashboard-widget-settings-panel"
          className="absolute right-0 top-full z-20 mt-2 w-[min(100vw-2rem,22rem)] border border-border p-4 shadow-lg"
          role="region"
          aria-label="Dashboard widget visibility"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Show widgets</p>
              <p className="text-caption mt-0.5">Choose which sections appear on your dashboard.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 px-2"
              onClick={onReset}
              title="Reset to defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          <ul className="space-y-1">
            {DASHBOARD_WIDGET_ORDER.map((widgetId) => {
              const meta = DASHBOARD_WIDGETS[widgetId];
              const checked = visibility[widgetId];
              return (
                <li key={widgetId}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors',
                      'hover:bg-surface-subtle',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand-600 focus:ring-brand-500/30"
                      checked={checked}
                      onChange={() => onToggleWidget(widgetId)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                      <span className="text-caption mt-0.5 block">{meta.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
