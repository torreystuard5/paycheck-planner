import { cn } from './cn';

export default function PageHeader({ title, description, actions, className, children }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {title && <h1 className="text-display">{title}</h1>}
        {description && <p className="text-body mt-1">{description}</p>}
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
