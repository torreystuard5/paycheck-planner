import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import {
  DASHBOARD_WIDGET_ORDER,
  defaultDashboardLayout,
  isDefaultLayout,
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
  onResetToDefault,
  visibleCount,
  saving = false,
}) {
  const [draft, setDraft] = useState({ visibility, order: widgetOrder });
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) setDraft({ visibility, order: widgetOrder });
  }, [open, visibility, widgetOrder]);

  const savedLayout = useMemo(
    () => ({ visibility, order: widgetOrder }),
    [visibility, widgetOrder],
  );

  const defaultLayout = useMemo(() => defaultDashboardLayout(), []);

  const draftVisibleCount = useMemo(
    () => DASHBOARD_WIDGET_ORDER.filter((id) => draft.visibility[id]).length,
    [draft.visibility],
  );

  const hasChanges = useMemo(
    () => !layoutsEqual(draft, savedLayout),
    [draft, savedLayout],
  );

  const draftIsDefault = useMemo(
    () => isDefaultLayout(draft),
    [draft],
  );

  const savedIsDefault = useMemo(
    () => isDefaultLayout(savedLayout),
    [savedLayout],
  );

  const setDraftVisible = (widgetId, nextVisible) => {
    setDraft((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [widgetId]: nextVisible },
    }));
  };

  const handleResetDraft = () => {
    setDraft(defaultLayout);
  };

  const handleResetAndSave = async () => {
    setDraft(defaultLayout);
    await onResetToDefault();
    onClose();
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
    <>
      <Modal
        isOpen={open}
        onClose={handleCancel}
        title="Customize Dashboard"
        className="sm:max-w-3xl"
        footer={(
          <div className="border-t border-border bg-surface px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3">
              {!savedIsDefault && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-muted sm:w-auto sm:self-start"
                  onClick={() => setResetConfirmOpen(true)}
                  disabled={saving}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Reset to Default Layout
                </Button>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-center sm:text-left">
                  {hasChanges ? 'Unsaved changes' : `${visibleCount}/${DASHBOARD_WIDGET_ORDER.length} widgets visible`}
                  {draftVisibleCount !== visibleCount && hasChanges && (
                    <Badge variant="neutral" className="ml-2 normal-case">
                      Preview: {draftVisibleCount} visible
                    </Badge>
                  )}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApply}
                    disabled={draftVisibleCount === 0 || saving}
                  >
                    {saving ? 'Saving…' : 'Done'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      >
        <p className="text-body mb-4">
          Drag to reorder, toggle visibility, and preview your layout.
        </p>

        <div className="grid gap-5 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:items-start lg:gap-6">
          <div className="order-2 lg:order-1">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Widgets</p>
                <p className="text-caption mt-0.5 sm:hidden">
                  Hold the grip handle, then drag to reorder.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2 text-muted"
                onClick={handleResetDraft}
                disabled={draftIsDefault || saving}
                title="Reset preview to default layout"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Preview default
              </Button>
            </div>

            <SortableWidgetList
              order={draft.order}
              visibility={draft.visibility}
              onReorder={(order) => setDraft((prev) => ({ ...prev, order }))}
              onToggle={setDraftVisible}
              disabled={saving}
            />
          </div>

          <div className="order-1 lg:order-2 lg:sticky lg:top-0">
            <DashboardLayoutPreview
              visibility={draft.visibility}
              widgetOrder={draft.order}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset to Default Layout?"
        message="This restores all widgets, the original order, and saves immediately. Your current customization will be replaced."
        confirmText="Reset & Save"
        onConfirm={handleResetAndSave}
      />
    </>
  );
}
