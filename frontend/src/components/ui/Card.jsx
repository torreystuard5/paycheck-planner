import { cn } from './cn';

const variants = {
  default: 'bg-surface border border-border shadow-[var(--shadow-card)]',
  interactive:
    'bg-surface border border-border shadow-[var(--shadow-card)] cursor-pointer transition-all duration-200 hover:border-accent-300/40 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.995]',
  inset: 'bg-surface-subtle border border-border',
};

export function Card({ variant = 'default', className, children, ...props }) {
  return (
    <div
      className={cn('min-w-0 rounded-xl', variants[variant] ?? variants.default, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1 p-4 sm:p-6 sm:pb-0', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2 className={cn('text-title truncate', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn('text-body', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('p-4 sm:p-6', className)} {...props}>
      {children}
    </div>
  );
}
