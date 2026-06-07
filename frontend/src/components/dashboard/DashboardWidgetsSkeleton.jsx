import { cn } from '../ui';

const SKELETON_BLOCKS = [
  { height: 'h-28', full: true },
  { height: 'h-48', full: false },
  { height: 'h-40', full: false },
  { height: 'h-36', full: true },
];

function SkeletonBlock({ className }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-border bg-surface-subtle',
        className,
      )}
      aria-hidden
    />
  );
}

export default function DashboardWidgetsSkeleton({ className }) {
  return (
    <div
      className={cn('space-y-6', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading dashboard layout"
    >
      <SkeletonBlock className="h-28" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {SKELETON_BLOCKS.slice(1, 3).map((block) => (
          <SkeletonBlock key={block.height} className={block.height} />
        ))}
      </div>
      <SkeletonBlock className="h-36" />
      <p className="sr-only">Loading your dashboard layout…</p>
    </div>
  );
}
