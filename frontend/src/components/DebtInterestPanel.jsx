import CurrencyDisplay from './CurrencyDisplay';
import { Badge, Card, cn } from './ui';
import {
  computeMonthlyInterest,
  estimatePayoffMonths,
  formatPayoffEstimate,
  formatRatePercent,
} from '../utils/debtInterest';

export default function DebtInterestPanel({
  balance,
  apr,
  minimumPayment,
  compact = false,
  className,
}) {
  const interest = computeMonthlyInterest({ balance, apr });
  const payoffMonths = estimatePayoffMonths({ balance, apr, minimumPayment });
  const payoffLabel = formatPayoffEstimate(payoffMonths);

  if (!interest.hasData || !interest.apr || interest.apr <= 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-caption font-medium text-foreground">Interest this month</span>
          <CurrencyDisplay
            amount={interest.monthlyInterest}
            className="text-sm font-semibold text-debt-600 tabular-nums"
          />
        </div>
        <p className="text-caption text-muted">
          {formatRatePercent(interest.apr)} APR · {formatRatePercent(interest.monthlyRatePercent)} monthly
        </p>
        {minimumPayment && (
          <p className="text-caption text-muted">{payoffLabel}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-t border-debt-100 bg-debt-50/50 px-4 py-3.5 sm:px-5 sm:py-4',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Interest this month</p>
        <CurrencyDisplay
          amount={interest.monthlyInterest}
          className="text-lg font-bold text-debt-600 tabular-nums sm:text-xl"
        />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-muted">
        {formatRatePercent(interest.apr)} APR
        <span aria-hidden className="mx-1.5 text-border">·</span>
        {formatRatePercent(interest.monthlyRatePercent)} monthly rate
      </p>

      {minimumPayment && (
        <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <Badge variant="debt" className="w-fit normal-case">
            {payoffLabel}
          </Badge>
          <span className="text-caption text-muted">if only minimum payment is made</span>
        </div>
      )}
    </div>
  );
}

/** Live preview while creating/editing a debt — always visible in the modal. */
export function DebtInterestPreview({ balance, apr, minimumPayment, className }) {
  const interest = computeMonthlyInterest({ balance, apr });
  const payoffMonths = estimatePayoffMonths({ balance, apr, minimumPayment });

  const bal = Number(balance);
  const aprNum = Number(apr);
  const minPay = Number(minimumPayment);

  const hasBalance = Number.isFinite(bal) && bal > 0;
  const hasApr = Number.isFinite(aprNum) && aprNum > 0;
  const hasMinPay = Number.isFinite(minPay) && minPay > 0;
  const canCalcInterest = hasBalance && hasApr && interest.monthlyInterest != null;

  const interestAmount = canCalcInterest ? interest.monthlyInterest : null;

  let payoffLabel = '--';
  if (hasBalance && hasMinPay) {
    payoffLabel = formatPayoffEstimate(payoffMonths);
  } else if (hasBalance && !hasMinPay) {
    payoffLabel = 'Enter minimum payment';
  } else if (!hasBalance) {
    payoffLabel = 'Enter balance';
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-debt-200 bg-debt-50/40 shadow-none',
        className,
      )}
    >
      <div className="border-b border-debt-100 bg-debt-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Interest Preview</p>
        <p className="text-caption mt-0.5">
          Live estimate from balance, APR, and minimum payment
        </p>
      </div>

      <dl className="divide-y divide-border">
        <PreviewMetric
          label="Estimated monthly interest"
          hint={
            canCalcInterest
              ? `${formatRatePercent(interest.monthlyRatePercent)} monthly · balance × rate`
              : hasApr
                ? 'Enter balance to calculate'
                : 'Enter APR and balance'
          }
        >
          {canCalcInterest ? (
            <CurrencyDisplay amount={interestAmount} className="text-base font-bold text-debt-600 tabular-nums" />
          ) : (
            <span className="text-base font-semibold text-muted">--</span>
          )}
        </PreviewMetric>

        <PreviewMetric
          label="Est. months to pay off"
          hint={hasMinPay ? 'At minimum payment only' : 'Enter minimum payment'}
        >
          <span className="text-base font-semibold text-foreground">{payoffLabel}</span>
        </PreviewMetric>
      </dl>

      {(hasApr || hasBalance || hasMinPay) && (
        <div className="border-t border-border bg-surface-subtle/80 px-4 py-2.5">
          <p className="text-caption text-muted">
            {hasApr && hasBalance && (
              <>
                {formatRatePercent(aprNum)} APR on {fmtCurrencyStatic(bal)}
                {hasMinPay && ` · ${fmtCurrencyStatic(minPay)}/mo min`}
              </>
            )}
            {hasApr && !hasBalance && `${formatRatePercent(aprNum)} APR entered`}
            {!hasApr && hasBalance && `Balance ${fmtCurrencyStatic(bal)} entered`}
          </p>
        </div>
      )}
    </Card>
  );
}

function fmtCurrencyStatic(val) {
  const n = Number(val);
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function PreviewMetric({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-foreground">{label}</dt>
        <dd className="text-caption mt-0.5 text-muted">{hint}</dd>
      </div>
      <div className="shrink-0 text-right">{children}</div>
    </div>
  );
}
