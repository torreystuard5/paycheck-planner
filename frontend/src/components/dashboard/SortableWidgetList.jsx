import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
import { IconStat, Switch, cn } from '../ui';
import { WIDGET_ICONS } from './DashboardLayoutPreview';

function SortableWidgetRow({
  widgetId,
  checked,
  onToggle,
}) {
  const meta = DASHBOARD_WIDGETS[widgetId];
  const Icon = WIDGET_ICONS[widgetId];
  const switchId = `dashboard-widget-${widgetId}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'touch-none list-none',
        isDragging && 'z-10',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border px-2 py-3 transition-shadow sm:gap-3 sm:px-3',
          checked
            ? 'border-border bg-surface'
            : 'border-border/60 bg-surface-subtle/50',
          isDragging && 'border-accent-300/60 shadow-lg ring-2 ring-accent-500/20',
        )}
      >
        <button
          type="button"
          className={cn(
            'flex min-h-10 min-w-10 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted',
            'hover:bg-surface-subtle hover:text-foreground active:cursor-grabbing',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
          )}
          aria-label={`Drag to reorder ${meta.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>

        {Icon && (
          <IconStat
            icon={Icon}
            tone={meta.iconTone || 'accent'}
            className="hidden shrink-0 rounded-lg p-2 sm:flex"
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
          onCheckedChange={onToggle}
          aria-label={`Show ${meta.label}`}
        />
      </div>
    </li>
  );
}

export default function SortableWidgetList({
  order,
  visibility,
  onReorder,
  onToggle,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
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
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {order.map((widgetId) => (
            <SortableWidgetRow
              key={widgetId}
              widgetId={widgetId}
              checked={visibility[widgetId]}
              onToggle={(next) => onToggle(widgetId, next)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
