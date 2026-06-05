import { describe, it, expect } from 'vitest';
import {
  buildExtraPercentPayoffScenarios,
  computeMonthlyInterest,
  estimatePayoffMonths,
  estimatePayoffMonthsExtraPercent,
  formatPayoffEstimate,
} from './debtInterest';

describe('computeMonthlyInterest', () => {
  it('calculates monthly interest from balance and APR', () => {
    const result = computeMonthlyInterest({ balance: 1200, apr: 24 });
    expect(result.hasData).toBe(true);
    expect(result.monthlyInterest).toBeCloseTo(24, 1);
    expect(result.monthlyRatePercent).toBeCloseTo(2, 1);
  });

  it('returns no data for zero balance', () => {
    expect(computeMonthlyInterest({ balance: 0, apr: 18 }).hasData).toBe(false);
  });
});

describe('estimatePayoffMonths', () => {
  it('returns null when minimum payment does not cover interest', () => {
    expect(estimatePayoffMonths({ balance: 5000, apr: 24, minimumPayment: 50 })).toBeNull();
  });

  it('returns a positive month count for viable payments', () => {
    const months = estimatePayoffMonths({ balance: 1000, apr: 12, minimumPayment: 100 });
    expect(months).toBeGreaterThan(0);
    expect(months).toBeLessThan(24);
  });
});

describe('formatPayoffEstimate', () => {
  it('describes null as min payment too low', () => {
    expect(formatPayoffEstimate(null)).toMatch(/too low/i);
  });
});

describe('estimatePayoffMonthsExtraPercent', () => {
  it('pays off faster with 25% above minimum', () => {
    const base = estimatePayoffMonths({ balance: 1000, apr: 12, minimumPayment: 100 });
    const boosted = estimatePayoffMonthsExtraPercent({
      balance: 1000,
      apr: 12,
      minimumPayment: 100,
      extraPercent: 25,
    });
    expect(boosted).toBeLessThan(base);
  });
});

describe('buildExtraPercentPayoffScenarios', () => {
  it('returns minimum and boosted scenarios', () => {
    const scenarios = buildExtraPercentPayoffScenarios({
      balance: 1000,
      apr: 12,
      minimumPayment: 100,
    });
    expect(scenarios).toHaveLength(4);
    expect(scenarios[0].extraPercent).toBe(0);
    expect(scenarios[1].extraPercent).toBe(10);
  });
});
