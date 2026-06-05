import { cn } from './cn';

export default function FilterChips({ options, value, onChange, className }) {
  return (
    <div className={cn('w-full overflow-x-auto pb-1', className)}>
      <div
        className="flex min-w-max gap-1 rounded-lg bg-surface-subtle p-1 sm:w-fit"
        role="tablist"
      >
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={value === opt.key}
            onClick={() => onChange(opt.key)}
            className={cn(
              'min-h-[44px] rounded-md px-5 py-2 text-sm font-medium transition-colors',
              value === opt.key
                ? 'bg-surface text-foreground shadow-[var(--shadow-card)]'
                : 'text-muted hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
