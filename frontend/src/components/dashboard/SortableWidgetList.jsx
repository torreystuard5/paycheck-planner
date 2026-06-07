import { useState, Fragment } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import {
  DASHBOARD_WIDGET_CATEGORIES,
  DASHBOARD_WIDGETS,
  getCategoryMeta,
} from '../../config/dashboardWidgets';
import { getWidgetIcon } from '../../config/dashboardWidgetIcons';
import { Badge, IconStat, Switch, cn } from '../ui';

function CategoryDivider({ categoryKey }) {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) return null;
  return (
    <div className="pt-2 first:pt-0" role="presentation">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {meta.label}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function WidgetRowContent({
  widgetId,
  checked,
  onToggle,
  position,
  isOverlay = false,
  dragHandleProps = null,
  showCategory = false,
}) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = getWidgetIcon(widgetId);
  const switchId = `dashboard-widget-${widgetId}`;
  const categoryMeta = getCategoryMeta(meta.category);

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-3 sm:grid-cols-[auto_auto_1fr_auto] sm:gap-4 sm:p-4',
        checked
          ? 'border-border bg-surface shadow-[var(--shadow-card)]'
          : 'border-dashed border-border/70 bg-surface-subtle/60',
        isOverlay && 'border-accent-300/70 bg-surface shadow-lg ring-2 ring-accent-500/15',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex min-h-11 min-w-11 shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-surface-subtle text-muted',
          'transition-colors hover:border-accent-300/50 hover:bg-surface hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
          dragHandleProps ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
        {...dragHandleProps}
        aria-label={dragHandleProps ? `Drag to reorder ${meta.label}` : undefined}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
        {position != null && (
          <span className="text-[10px] font-semibold tabular-nums leading-none text-muted">
            {position}
          </span>
        )}
      </button>

      {Icon && (
        <IconStat
          icon={Icon}
          tone={checked ? (meta.iconTone || 'accent') : 'neutral'}
          className={cn(
            'hidden rounded-lg p-2 sm:flex',
            !checked && 'opacity-70',
          )}
          iconClassName="h-4 w-4"
        />
      )}

      <label
        htmlFor={isOverlay ? undefined : switchId}
        className="min-w-0 cursor-pointer py-0.5"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'text-sm font-semibold leading-snug',
            checked ? 'text-foreground' : 'text-muted',
          )}
          >
            {meta.label}
          </span>
          {showCategory && categoryMeta && (
            <Badge variant="neutral" className="normal-case px-1.5 py-0 text-[10px]">
              {categoryMeta.label}
            </Badge>
          )}
          {!checked && (
            <Badge variant="neutral" className="normal-case px-1.5 py-0 text-[10px]">
              Hidden
            </Badge>
          )}
          {meta.requiresHousehold && (
            <Badge variant="info" className="normal-case px-1.5 py-0 text-[10px]">
              Household
            </Badge>
          )}
        </span>
        <span className="text-caption mt-1 block leading-relaxed text-muted">
          {meta.description}
        </span>
      </label>

      {!isOverlay && (
        <div className="flex shrink-0 items-center justify-end pl-1 sm:pl-0">
          <Switch
            id={switchId}
            checked={checked}
            onCheckedChange={onToggle}
            aria-label={`Show ${meta.label}`}
          />
        </div>
      )}
    </div>
  );
}

function SortableWidgetRow({
  widgetId,
  checked,
  onToggle,
  position,
  disabled,
  showCategory,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('list-none', isDragging && 'opacity-50')}
    >
      <WidgetRowContent
        widgetId={widgetId}
        checked={checked}
        onToggle={onToggle}
        position={position}
        showCategory={showCategory}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        }}
      />
    </li>
  );
}

export default function SortableWidgetList({
  order,
  visibility,
  onReorder,
  onToggle,
  disabled = false,
  categoryFilter = 'all',
  showCategoryBadges = false,
}) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = [...order];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next);
  };

  const displayOrder = categoryFilter === 'all'
    ? order
    : order.filter((id) => DASHBOARD_WIDGETS[id]?.category === categoryFilter);

  const showDividers = categoryFilter === 'all';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveId(event.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3" aria-label="Dashboard widgets">
          {displayOrder.map((widgetId, index) => {
            const position = order.indexOf(widgetId) + 1;
            const category = DASHBOARD_WIDGETS[widgetId]?.category;
            const prevId = index > 0 ? displayOrder[index - 1] : null;
            const prevCategory = prevId ? DASHBOARD_WIDGETS[prevId]?.category : null;
            const showDivider = showDividers && category !== prevCategory;

            return (
              <Fragment key={widgetId}>
                {showDivider && <CategoryDivider categoryKey={category} />}
                <SortableWidgetRow
                  widgetId={widgetId}
                  checked={visibility[widgetId]}
                  position={position}
                  onToggle={(next) => onToggle(widgetId, next)}
                  disabled={disabled}
                  showCategory={showCategoryBadges}
                />
              </Fragment>
            );
          })}
        </ul>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
        {activeId ? (
          <WidgetRowContent
            widgetId={activeId}
            checked={visibility[activeId]}
            position={order.indexOf(activeId) + 1}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export { DASHBOARD_WIDGET_CATEGORIES };
