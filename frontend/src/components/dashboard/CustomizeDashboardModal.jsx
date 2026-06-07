import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import {
  DASHBOARD_WIDGET_CATEGORIES,
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultDashboardLayout,
  isDefaultLayout,
  widgetOrderEqual,
} from '../../config/dashboardWidgets';
import { Badge, Button, FilterChips } from '../ui';
import DashboardLayoutPreview from './DashboardLayoutPreview';
import SortableWidgetList from './SortableWidgetList';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All widgets' },
  ...DASHBOARD_WIDGET_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

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
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    if (open) {
      setDraft({ visibility, order: widgetOrder });
      setCategoryFilter('all');
    }
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

  const statusLabel = hasChanges
    ? 'Unsaved changes'
    : `${visibleCount} of ${DASHBOARD_WIDGET_ORDER.length} widgets visible`;

  const filteredCount = categoryFilter === 'all'
    ? DASHBOARD_WIDGET_ORDER.length
    : draft.order.filter((id) => DASHBOARD_WIDGETS[id]?.category === categoryFilter).length;

  return (
    <>
      <Modal
        isOpen={open}
        onClose={handleCancel}
        title="Customize Dashboard"
        description="Drag to reorder sections, filter by category, and toggle what appears on your dashboard."
        className="sm:max-w-2xl lg:max-w-4xl"
        footer={(
          <div className="border-t border-border bg-surface-subtle/40 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4">
              {!savedIsDefault && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 self-start text-muted"
                  onClick={() => setResetConfirmOpen(true)}
                  disabled={saving}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Reset to Default Layout
                </Button>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <Badge
                    variant={hasChanges ? 'warning' : 'neutral'}
                    className="normal-case px-2.5 py-1 text-xs"
                  >
                    {statusLabel}
                  </Badge>
                  {draftVisibleCount !== visibleCount && hasChanges && (
                    <span className="text-caption text-muted">
                      Previewing {draftVisibleCount} visible
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApply}
                    disabled={draftVisibleCount === 0 || saving}
                    className="min-w-[7rem]"
                  >
                    {saving ? 'Saving…' : 'Save layout'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)] lg:items-start lg:gap-8">
          <section aria-labelledby="customize-widgets-heading" className="order-2 min-w-0 lg:order-1">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="customize-widgets-heading" className="text-sm font-semibold text-foreground">
                  Widget catalog
                </h3>
                <p className="text-caption mt-1 max-w-prose leading-relaxed">
                  {DASHBOARD_WIDGET_ORDER.length} widgets across {DASHBOARD_WIDGET_CATEGORIES.length} categories.
                  Use the grip handle to reorder.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={handleResetDraft}
                disabled={draftIsDefault || saving}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Preview default
              </Button>
            </div>

            <FilterChips
              options={CATEGORY_FILTERS}
              value={categoryFilter}
              onChange={setCategoryFilter}
              className="mb-4"
              aria-label="Filter widgets by category"
            />

            {categoryFilter !== 'all' && (
              <p className="text-caption mb-3 text-muted">
                Showing {filteredCount} widget{filteredCount === 1 ? '' : 's'} in this category.
                Drag still updates your full dashboard order.
              </p>
            )}

            <SortableWidgetList
              order={draft.order}
              visibility={draft.visibility}
              onReorder={(order) => setDraft((prev) => ({ ...prev, order }))}
              onToggle={setDraftVisible}
              disabled={saving}
              categoryFilter={categoryFilter}
            />
          </section>

          <section
            aria-labelledby="customize-preview-heading"
            className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-0"
          >
            <div className="mb-3 lg:mb-4">
              <h3 id="customize-preview-heading" className="text-sm font-semibold text-foreground">
                Live preview
              </h3>
              <p className="text-caption mt-1 hidden sm:block">
                Updates as you reorder and toggle widgets.
              </p>
            </div>

            <DashboardLayoutPreview
              visibility={draft.visibility}
              widgetOrder={draft.order}
              embedded
            />
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset to Default Layout?"
        message="This restores the default six visible widgets, full catalog order, and saves immediately. Optional widgets stay hidden."
        confirmText="Reset & Save"
        onConfirm={handleResetAndSave}
      />
    </>
  );
}
