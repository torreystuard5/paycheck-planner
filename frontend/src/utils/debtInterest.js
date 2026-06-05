/**
 * Client-side APR-based interest helpers for debt display.
 * APR is stored as a percentage (e.g. 22.9 for 22.9%).
 */

export function computeMonthlyInterest({ balance, apr }) {
  const bal = Number(balance);
  const aprNum = Number(apr);

  if (!Number.isFinite(bal) || bal <= 0) {
    return { monthlyRatePercent: null, monthlyInterest: null, hasData: false, apr: aprNum || null };
  }

  if (!Number.isFinite(aprNum) || aprNum <= 0) {
    return { monthlyRatePercent: 0, monthlyInterest: 0, hasData: true, apr: 0 };
  }

  const monthlyRateDecimal = aprNum / 100 / 12;
  const monthlyRatePercent = aprNum / 12;
  const monthlyInterest = bal * monthlyRateDecimal;

  return {
    monthlyRatePercent,
    monthlyInterest,
    hasData: true,
    apr: aprNum,
  };
}

/**
 * Rough amortization: months until paid off if only minimum payment is made.
 * Returns null when the minimum payment does not cover monthly interest.
 */
export function estimatePayoffMonths({ balance, apr, minimumPayment }) {
  let remaining = Number(balance);
  const minPay = Number(minimumPayment);
  const aprNum = Number(apr) || 0;

  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(minPay) || minPay <= 0) return null;

  const monthlyRate = aprNum > 0 ? aprNum / 100 / 12 : 0;
  let months = 0;
  const MAX_MONTHS = 600;

  while (remaining > 0.01 && months < MAX_MONTHS) {
    const interest = remaining * monthlyRate;
    const principal = minPay - interest;
    if (principal <= 0) return null;
    remaining -= principal;
    months += 1;
  }

  if (months >= MAX_MONTHS) return null;
  return months;
}

export function formatPayoffEstimate(months) {
  if (months === null) return 'Min payment too low to pay off';
  if (months === 0) return 'Paid off';
  if (months === 1) return '~1 month to pay off';
  return `~${months} months to pay off`;
}

/** Default scenarios: minimum only plus 10%, 25%, and 50% above minimum. */
export const EXTRA_PAY_PERCENT_SCENARIOS = [0, 10, 25, 50];

/**
 * Months to pay off when paying (1 + extraPercent/100) × minimum each month.
 */
export function estimatePayoffMonthsExtraPercent({
  balance,
  apr,
  minimumPayment,
  extraPercent = 0,
}) {
  let remaining = Number(balance);
  const minPay = Number(minimumPayment);
  const aprNum = Number(apr) || 0;
  const pct = Number(extraPercent) || 0;

  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(minPay) || minPay <= 0) return null;

  const payment = minPay * (1 + pct / 100);
  const monthlyRate = aprNum > 0 ? aprNum / 100 / 12 : 0;
  let months = 0;
  const MAX_MONTHS = 600;

  while (remaining > 0.01 && months < MAX_MONTHS) {
    const interest = remaining * monthlyRate;
    const principal = payment - interest;
    if (principal <= 0) return null;
    remaining -= principal;
    months += 1;
  }

  if (months >= MAX_MONTHS) return null;
  return months;
}

export function buildExtraPercentPayoffScenarios({ balance, apr, minimumPayment }) {
  const bal = Number(balance);
  const minPay = Number(minimumPayment);
  if (!Number.isFinite(bal) || bal <= 0 || !Number.isFinite(minPay) || minPay <= 0) {
    return [];
  }

  const baseline = estimatePayoffMonths({ balance: bal, apr, minimumPayment: minPay });
  return EXTRA_PAY_PERCENT_SCENARIOS.map((pct) => {
    const months = estimatePayoffMonthsExtraPercent({
      balance: bal,
      apr,
      minimumPayment: minPay,
      extraPercent: pct,
    });
    const payment = minPay * (1 + pct / 100);
    return {
      extraPercent: pct,
      payment,
      months,
      label: pct === 0 ? 'Minimum only' : `${pct}% more`,
      monthsSaved:
        baseline != null && months != null && pct > 0
          ? Math.max(0, baseline - months)
          : null,
    };
  });
}

export function formatExtraPercentScenario(scenario) {
  if (!scenario) return '--';
  if (scenario.months === null) return 'Payment too low';
  return formatPayoffEstimate(scenario.months);
}

export function formatRatePercent(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(digits)}%`;
}
