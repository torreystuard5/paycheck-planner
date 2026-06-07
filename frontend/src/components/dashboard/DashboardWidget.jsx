import CollapsibleCard from '../ui/CollapsibleCard';
import { cn } from '../ui';

/**
 * Reusable dashboard section — wraps CollapsibleCard with widget visibility gate.
 */
export default function DashboardWidget({
  widgetId,
  visible = true,
  title,
  icon,
  iconTone = 'accent',
  collapsed,
  onToggleCollapse,
  badge = null,
  className,
  children,
}) {
  if (!visible) return null;

  return (
    <CollapsibleCard
      sectionKey={widgetId}
      title={title}
      icon={icon}
      iconTone={iconTone}
      collapsed={collapsed}
      onToggle={onToggleCollapse}
      badge={badge}
      className={cn(className)}
    >
      {children}
    </CollapsibleCard>
  );
}
