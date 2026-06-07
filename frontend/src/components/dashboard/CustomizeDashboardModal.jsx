import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultHiddenWidgets,
} from '../../config/dashboardWidgets';
import { Badge, Button, IconStat, Switch, cn } from '../ui';
import DashboardLayoutPreview, { WIDGET_ICONS } from './DashboardLayoutPreview';

function defaultVisibilityFromHidden(hidden = []) {
  return DASHBOARD_WIDGET_ORDER.reduce((acc, id) => {
    acc[id] = !hidden.includes(id);
    return acc;
  }, {});
}

export default function CustomizeDashboardModal({
  open,
  onClose,
  visibility,
  onApply,
  visibleCount,
  saving = false,
}) {
  const [draft, setDraft] = useState(visibility);

  useEffect(() => {
    if (open) setDraft(visibility);
  }, [open, visibility]);

  const draftVisibleCount = useMemo(
    () => DASHBOARD_WIDGET_ORDER.filter((id) => draft[id]).length,
    [draft],
  );

  const hasChanges = useMemo(
    () => DASHBOARD_WIDGET_ORDER.some((id) => draft[id] !== visibility[id]),
    [draft, visibility],
  );

  const setDraftVisible = (widgetId, nextVisible) => {
    setDraft((prev) => ({ ...prev, [widgetId]: nextVisible }));
  };

  const handleResetDraft = () => {
    setDraft(defaultVisibilityFromHidden(defaultHiddenWidgets()));
  };

  const handleApply = async () => {
    await onApply(draft);
    onClose();
  };

  const handleCancel = () => {
    setDraft(visibility);
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleCancel}
      title="Customize Dashboard"
      className="sm:max-w-3xl"
    >
      <p className="text-body mb-5">
        Choose which sections appear on your dashboard. Changes preview instantly — click Done to save.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:items-start">
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Widgets</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 text-muted"
              onClick={handleResetDraft}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset all
            </Button>
          </div>

          <ul className="space-y-2">
            {DASHBOARD_WIDGET_ORDER.map((widgetId) => {
              const meta = DASHBOARD_WIDGETS[widgetId];
              const Icon = WIDGET_ICONS[widgetId];
              const checked = draft[widgetId];
              const switchId = `dashboard-widget-${widgetId}`;

              return (
                <li key={widgetId}>
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors',
                      checked
                        ? 'border-border bg-surface'
                        : 'border-border/60 bg-surface-subtle/50',
                    )}
                  >
                    {Icon && (
                      <IconStat
                        icon={Icon}
                        tone={meta.iconTone || 'accent'}
                        className="shrink-0 rounded-lg p-2"
                        iconClassName="h-4 w-4"
                      />
                    )}
                    <label
                      htmlFor={switchId}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                      <span className="text-caption mt-0.5 block leading-snug">{meta.description}</span>
                    </label>
                    <Switch
                      id={switchId}
                      checked={checked}
                      onCheckedChange={(next) => setDraftVisible(widgetId, next)}
                      aria-label={`Show ${meta.label}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-0">
          <DashboardLayoutPreview visibility={draft} />
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-center sm:text-left">
          {hasChanges ? 'Unsaved changes' : `${visibleCount}/${DASHBOARD_WIDGET_ORDER.length} widgets visible`}
          {draftVisibleCount !== visibleCount && hasChanges && (
            <Badge variant="neutral" className="ml-2 normal-case">
              Preview: {draftVisibleCount} visible
            </Badge>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={draftVisibleCount === 0 || saving}>
            {saving ? 'Saving…' : 'Done'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
