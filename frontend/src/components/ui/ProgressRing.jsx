import { cn } from './cn';

const strokeColors = {
  brand: 'stroke-brand-500',
  accent: 'stroke-accent-500',
  debt: 'stroke-debt-500',
  success: 'stroke-brand-500',
  purple: 'stroke-purple-500',
};

export default function ProgressRing({
  progress = 0,
  size = 88,
  strokeWidth = 7,
  tone = 'brand',
  className,
  children,
}) {
  const pct = Math.min(Math.max(progress, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-subtle"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-all duration-700 ease-out', strokeColors[tone] ?? strokeColors.brand)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
