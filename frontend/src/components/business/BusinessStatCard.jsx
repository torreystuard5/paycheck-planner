import CurrencyDisplay from '../CurrencyDisplay';
import { Card, cn } from '../ui';

const toneClasses = {
  brand: 'text-brand-700',
  success: 'text-brand-700',
  warning: 'text-warning-700',
  debt: 'text-debt-700',
  purple: 'text-purple-700',
  accent: 'text-accent-700',
};

export default function BusinessStatCard({
  label,
  amount,
  subAmounts = [],
  tone = 'purple',
  className,
}) {
  const valueClass = toneClasses[tone] || toneClasses.purple;

  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <p className="text-caption font-medium uppercase tracking-wide">{label}</p>
      {amount != null && (
        <CurrencyDisplay amount={amount} className={cn('text-money mt-1 block', valueClass)} />
      )}
      {subAmounts.map(({ amount: sub, className: subClass }, i) => (
        <CurrencyDisplay
          key={i}
          amount={sub}
          className={cn('text-sm block', subClass || 'text-muted')}
        />
      ))}
    </Card>
  );
}
