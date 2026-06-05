import CurrencyDisplay from './CurrencyDisplay';
import { Card, cn } from './ui';
import {
  computeMonthlyInterest,
  estimatePayoffMonths,
  formatPayoffEstimate,
  formatRatePercent,
} from '../utils/debtInterest';

/**
 * Live interest preview for Add/Edit Debt modal.
 * Always renders — never returns null.
 */
export default function DebtFormInterestPreview({ balance, apr, minimumPayment, className }) {
  const interest = computeMonthlyInterest({ balance, apr });
  const payoffMonths = estimatePayoffMonths({ balance, apr, minimumPayment });

  const bal = Number(balance);
  const aprNum = Number(apr);
  const minPay = Number(minimumPayment);

  const hasBalance = Number.isFinite(bal) && bal > 0;
  const hasApr = Number.isFinite(aprNum) && aprNum > 0;
  const hasMinPay = Number.isFinite(minPay) && minPay > 0;
  const canCalcInterest = hasBalance && hasApr && interest.monthlyInterest != null;

  let payoffLabel = '--';
  if (hasBalance && hasMinPay) {
    payoffLabel = formatPayoffEstimate(payoffMonths);
  } else if (hasBalance && !hasMinPay) {
    payoffLabel = 'Enter minimum payment';
  } else if (!hasBalance) {
    payoffLabel = 'Enter balance';
  }

  const amountCell = canCalcInterest ? (
    <CurrencyDisplay
      amount={interest.monthlyInterest}
      className="text-lg font-bold text-debt-600 tabular-nums"
    />
  ) : (
    <span className="text-lg font-semibold text-muted">--</span>
  );

  return (
    <Card
      data-testid="debt-interest-preview"
      className={cn(
        'overflow-hidden border-2 border-debt-500/40 bg-debt-50 shadow-none',
        className,
      )}
    >
      <div className="border-b border-debt-100 bg-debt-100/60 px-4 py-3">
        <h3 className="text-sm font-bold text-debt-700">Interest Preview</h3>
        <p className="text-caption mt-0.5 text-debt-600">
          Live estimate — updates when balance, APR, or minimum payment changes
        </p>
      </div>

      <ul className="divide-y divide-border">
        <PreviewRow
          label="Monthly interest"
          detail={hasApr ? `${formatRatePercent(interest.monthlyRatePercent)} monthly rate` : 'Enter APR (%) above'}
        >
          {amountCell}
        </PreviewRow>
        <PreviewRow
          label="Interest this month"
          detail={hasBalance ? 'Balance × monthly rate' : 'Enter balance above'}
        >
          {amountCell}
        </PreviewRow>
        <PreviewRow
          label="Est. months to pay off"
          detail={hasMinPay ? 'At minimum payment only' : 'Enter minimum payment above'}
        >
          <span className="text-sm font-bold text-foreground">{payoffLabel}</span>
        </PreviewRow>
      </ul>
    </Card>
  );
}

function PreviewRow({ label, detail, children }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-caption mt-0.5 text-muted">{detail}</p>
      </div>
      <div className="shrink-0 text-right">{children}</div>
    </li>
  );
}
