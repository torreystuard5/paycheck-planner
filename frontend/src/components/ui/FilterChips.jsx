import { cn } from './cn';

export default function FilterChips({ options, value, onChange, className, 'aria-label': ariaLabel = 'Filter options' }) {
  return (
    <div className={cn('w-full overflow-x-auto pb-1', className)}>
      <div
        className="flex min-w-max gap-1.5 rounded-xl border border-border bg-surface-subtle p-1.5 sm:w-fit"
        role="tablist"
        aria-label={ariaLabel}
      >
        {options.map((opt) => {
          const selected = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(opt.key)}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                selected
                  ? 'bg-surface text-foreground shadow-[var(--shadow-card)] ring-1 ring-border'
                  : 'text-muted hover:bg-surface/60 hover:text-foreground',
              )}
            >
              {opt.label}
              {opt.count != null && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    selected ? 'bg-accent-100 text-accent-700' : 'bg-surface-subtle text-muted',
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
