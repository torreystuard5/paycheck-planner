import { describe, expect, it } from 'vitest';
import { patchPaycheckPlanItemPaid } from './paycheckPlanItems';

describe('patchPaycheckPlanItemPaid', () => {
  const basePlan = {
    current_paycheck: {
      pay_period_start: '2026-06-01',
      assigned_items: [
        { item_type: 'bill', id: 1, name: 'Rent', amount: 1000, is_paid: false },
        { item_type: 'debt', id: 2, name: 'Card', amount: 50, is_paid: false },
      ],
      assigned_paid_count: 0,
      assigned_total_count: 2,
      assigned_total_amount: 1050,
      assigned_paid_amount: 0,
      assigned_still_owed: 1050,
      assigned_progress_percent: 0,
    },
    paychecks: [
      {
        pay_period_start: '2026-06-01',
        assigned_items: [
          { item_type: 'bill', id: 1, name: 'Rent', amount: 1000, is_paid: false },
          { item_type: 'debt', id: 2, name: 'Card', amount: 50, is_paid: false },
        ],
        assigned_paid_count: 0,
        assigned_total_count: 2,
        assigned_total_amount: 1050,
        assigned_paid_amount: 0,
        assigned_still_owed: 1050,
        assigned_progress_percent: 0,
      },
    ],
  };

  it('marks a bill paid and recomputes stats', () => {
    const next = patchPaycheckPlanItemPaid(basePlan, 'bill', 1, true);
    expect(next.current_paycheck.assigned_items[0].is_paid).toBe(true);
    expect(next.current_paycheck.assigned_paid_count).toBe(1);
    expect(next.current_paycheck.assigned_paid_amount).toBe(1000);
    expect(next.current_paycheck.assigned_still_owed).toBe(50);
    expect(next.current_paycheck.assigned_progress_percent).toBe(50);
    expect(next.paychecks[0].assigned_items[0].is_paid).toBe(true);
  });

  it('marks a debt unpaid and recomputes stats', () => {
    const paid = patchPaycheckPlanItemPaid(basePlan, 'bill', 1, true);
    const next = patchPaycheckPlanItemPaid(paid, 'bill', 1, false);
    expect(next.current_paycheck.assigned_items[0].is_paid).toBe(false);
    expect(next.current_paycheck.assigned_paid_count).toBe(0);
    expect(next.current_paycheck.assigned_paid_amount).toBe(0);
  });
});
