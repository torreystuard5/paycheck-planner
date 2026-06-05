import { cn } from './cn';

export default function PageHeader({ title, description, eyebrow, actions, className, children }) {
  return (
    <div className={cn('animate-fade-in flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-caption mb-1 font-semibold uppercase tracking-wide text-purple-600">{eyebrow}</p>}
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
