import { cn } from './cn';

const variantStyles = {
  success: 'bg-brand-100 text-brand-700',
  info: 'bg-accent-100 text-accent-700',
  warning: 'bg-warning-100 text-warning-700',
  debt: 'bg-debt-100 text-debt-700',
  danger: 'bg-danger-100 text-danger-700',
  neutral: 'bg-surface-subtle text-muted border border-border',
  purple: 'bg-purple-50 text-purple-600',
};

/** Map legacy status strings to semantic badge variants. */
export const statusToVariant = {
  on_track: 'success',
  upcoming: 'info',
  due_soon: 'warning',
  urgent: 'danger',
  overdue: 'danger',
  over_budget: 'danger',
  paid: 'success',
  excellent: 'success',
  good: 'success',
  fair: 'warning',
  poor: 'debt',
  critical: 'danger',
};

export default function Badge({
  variant = 'neutral',
  status,
  children,
  className,
  ...props
}) {
  const resolvedVariant = status ? (statusToVariant[status] ?? 'neutral') : variant;
  const label = children ?? (status ? status.replace(/_/g, ' ') : null);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        variantStyles[resolvedVariant] ?? variantStyles.neutral,
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}
