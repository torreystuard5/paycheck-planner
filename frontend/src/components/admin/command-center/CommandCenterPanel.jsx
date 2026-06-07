import { cn } from '../../ui';

export default function CommandCenterPanel({
  children,
  className,
  padding = true,
  noBorder = false,
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white shadow-sm',
        !noBorder && 'border border-gray-200/80',
        padding && 'p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CommandCenterSectionHeader({
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  className,
}) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 sm:text-lg">
          {Icon && <Icon className={cn('h-5 w-5 shrink-0 text-blue-600', iconClassName)} />}
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CommandCenterTabContent({ children, className }) {
  return (
    <div className={cn('space-y-5 sm:space-y-6', className)}>
      {children}
    </div>
  );
}

export function CommandCenterStatCard({
  label,
  value,
  icon: Icon,
  color = 'text-blue-600',
  bg = 'bg-blue-50',
  onClick,
  sublabel,
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-start gap-4 rounded-xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition-all sm:p-5',
        onClick && 'cursor-pointer hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
      )}
    >
      <div className={cn('rounded-lg p-2.5 sm:p-3', bg)}>
        <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', color)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 sm:text-sm sm:normal-case sm:tracking-normal">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900 sm:text-3xl">
          {(value ?? 0).toLocaleString()}
        </p>
        {sublabel && (
          <p className="mt-1 text-xs text-gray-400">{sublabel}</p>
        )}
      </div>
    </Wrapper>
  );
}
