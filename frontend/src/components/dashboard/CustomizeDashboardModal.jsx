import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import {
  DASHBOARD_WIDGET_ORDER,
  defaultHiddenWidgets,
  defaultWidgetOrder,
  visibilityFromHidden,
  widgetOrderEqual,
} from '../../config/dashboardWidgets';
import { Badge, Button } from '../ui';
import DashboardLayoutPreview from './DashboardLayoutPreview';
import SortableWidgetList from './SortableWidgetList';

function layoutsEqual(a, b) {
  return (
    DASHBOARD_WIDGET_ORDER.every((id) => a.visibility[id] === b.visibility[id])
    && widgetOrderEqual(a.order, b.order)
  );
}

export default function CustomizeDashboardModal({
  open,
  onClose,
  visibility,
  widgetOrder,
  onApply,
  visibleCount,
  saving = false,
}) {
  const [draft, setDraft] = useState({ visibility, order: widgetOrder });

  useEffect(() => {
    if (open) setDraft({ visibility, order: widgetOrder });
  }, [open, visibility, widgetOrder]);

  const savedLayout = useMemo(
    () => ({ visibility, order: widgetOrder }),
    [visibility, widgetOrder],
  );

  const draftVisibleCount = useMemo(
    () => DASHBOARD_WIDGET_ORDER.filter((id) => draft.visibility[id]).length,
    [draft.visibility],
  );

  const hasChanges = useMemo(
    () => !layoutsEqual(draft, savedLayout),
    [draft, savedLayout],
  );

  const setDraftVisible = (widgetId, nextVisible) => {
    setDraft((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [widgetId]: nextVisible },
    }));
  };

  const handleResetDraft = () => {
    setDraft({
      visibility: visibilityFromHidden(defaultHiddenWidgets()),
      order: defaultWidgetOrder(),
    });
  };

  const handleApply = async () => {
    await onApply(draft);
    onClose();
  };

  const handleCancel = () => {
    setDraft(savedLayout);
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
        Drag to reorder sections, toggle visibility, and preview your layout — click Done to save.
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

          <SortableWidgetList
            order={draft.order}
            visibility={draft.visibility}
            onReorder={(order) => setDraft((prev) => ({ ...prev, order }))}
            onToggle={setDraftVisible}
          />
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-0">
          <DashboardLayoutPreview
            visibility={draft.visibility}
            widgetOrder={draft.order}
          />
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
