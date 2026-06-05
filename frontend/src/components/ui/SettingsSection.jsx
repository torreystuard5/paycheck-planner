import { Card } from './Card';
import IconStat from './IconStat';
import { cn } from './cn';

export default function SettingsSection({
  title,
  description,
  icon,
  iconTone = 'accent',
  actions,
  children,
  className,
}) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <IconStat icon={icon} tone={iconTone} className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
          )}
          <div className="min-w-0">
            <h2 className="text-title">{title}</h2>
            {description && <p className="text-caption mt-0.5">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}
