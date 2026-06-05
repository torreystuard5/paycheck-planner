import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from './Card';
import IconStat from './IconStat';
import { cn } from './cn';

export default function CollapsibleCard({
  sectionKey,
  title,
  icon: Icon,
  iconTone = 'accent',
  collapsed,
  onToggle,
  children,
  className,
  badge = null,
}) {
  const isCollapsed = collapsed.includes(sectionKey);
  const panelId = `section-panel-${sectionKey}`;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-6 sm:pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/30"
        aria-expanded={!isCollapsed}
        aria-controls={panelId}
      >
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <IconStat
              icon={Icon}
              tone={iconTone}
              className="rounded-lg p-2.5"
              iconClassName="h-5 w-5"
            />
          )}
          <h2 className="text-title truncate">{title}</h2>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted transition-transform duration-200',
            isCollapsed && '-rotate-90',
          )}
        />
      </button>
      <div
        id={panelId}
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: isCollapsed ? '0px' : '3000px', opacity: isCollapsed ? 0 : 1 }}
        aria-hidden={isCollapsed}
      >
        <CardContent className="pt-0">{children}</CardContent>
      </div>
    </Card>
  );
}
