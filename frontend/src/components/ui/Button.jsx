import { cn } from './cn';

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600/30',
  secondary:
    'bg-surface text-foreground border border-border hover:bg-surface-subtle focus-visible:ring-border',
  accent:
    'bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-600/30',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-600/30',
  ghost:
    'text-muted hover:bg-surface-subtle hover:text-foreground focus-visible:ring-border',
  link:
    'text-accent-600 hover:text-accent-700 underline-offset-2 hover:underline p-0 min-h-0',
};

const sizes = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variant !== 'link' && sizes[size],
        variants[variant] ?? variants.primary,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
