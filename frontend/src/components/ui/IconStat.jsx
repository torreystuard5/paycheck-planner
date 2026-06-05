import { cn } from './cn';

const tones = {
  brand: 'bg-brand-50 text-brand-600',
  accent: 'bg-accent-50 text-accent-600',
  debt: 'bg-debt-50 text-debt-600',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  purple: 'bg-purple-50 text-purple-600',
  neutral: 'bg-surface-subtle text-muted',
};

export default function IconStat({ icon: Icon, tone = 'accent', className, iconClassName }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-xl p-3', tones[tone] ?? tones.accent, className)}
    >
      <Icon className={cn('h-6 w-6', iconClassName)} strokeWidth={2} />
    </div>
  );
}
