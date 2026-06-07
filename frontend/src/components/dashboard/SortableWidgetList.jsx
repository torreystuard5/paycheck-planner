import { useState } from 'react';
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
import { DASHBOARD_WIDGETS } from '../../config/dashboardWidgets';
import { Badge, IconStat, Switch, cn } from '../ui';
import { WIDGET_ICONS } from './DashboardLayoutPreview';

function WidgetRowContent({
  widgetId,
  checked,
  onToggle,
  isOverlay = false,
  dragHandleProps = null,
}) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = WIDGET_ICONS[widgetId];
  const switchId = `dashboard-widget-${widgetId}`;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border px-2 py-3 sm:gap-3 sm:px-3',
        checked
          ? 'border-border bg-surface'
          : 'border-border/60 bg-surface-subtle/50 opacity-90',
        isOverlay && 'border-accent-300/60 shadow-lg ring-2 ring-accent-500/20',
      )}
    >
      <div
        className={cn(
          'flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-muted',
          dragHandleProps ? 'cursor-grab hover:bg-surface-subtle hover:text-foreground active:cursor-grabbing' : '',
        )}
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </div>

      {Icon && (
        <IconStat
          icon={Icon}
          tone={meta.iconTone || 'accent'}
          className="shrink-0 rounded-lg p-1.5 sm:p-2"
          iconClassName="h-3.5 w-3.5 sm:h-4 sm:w-4"
        />
      )}

      <label
        htmlFor={isOverlay ? undefined : switchId}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
          {!checked && (
            <Badge variant="neutral" className="normal-case px-1.5 py-0 text-[10px]">
              Hidden
            </Badge>
          )}
        </span>
        <span className="text-caption mt-0.5 line-clamp-2 block leading-snug sm:line-clamp-none">
          {meta.description}
        </span>
      </label>

      {!isOverlay && (
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={onToggle}
          aria-label={`Show ${meta.label}`}
        />
      )}
    </div>
  );
}

function SortableWidgetRow({
  widgetId,
  checked,
  onToggle,
  disabled,
}) {
  const meta = DASHBOARD_WIDGETS[widgetId];

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
      className={cn('list-none', isDragging && 'opacity-40')}
    >
      <WidgetRowContent
        widgetId={widgetId}
        checked={checked}
        onToggle={onToggle}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          role: 'button',
          'aria-label': `Drag to reorder ${meta.label}`,
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
}) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveId(event.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="Dashboard widgets">
          {order.map((widgetId) => (
            <SortableWidgetRow
              key={widgetId}
              widgetId={widgetId}
              checked={visibility[widgetId]}
              onToggle={(next) => onToggle(widgetId, next)}
              disabled={disabled}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {activeId ? (
          <WidgetRowContent
            widgetId={activeId}
            checked={visibility[activeId]}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
