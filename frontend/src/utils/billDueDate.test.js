import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBillListDueLabel, getBillDueInfo, sortBillsByDueDate } from './billDueDate';

describe('billDueDate helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats unpaid overdue bills as overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      is_paid: false,
    })).toBe('Overdue by 17 days');
  });

  it('uses the next due date once the current cycle is paid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-07-01',
      is_paid: true,
    })).toBe('Next due Jul 1');
  });

  it('advances a paid monthly bill when the API next due date still points at the paid cycle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-06-01',
      due_day: 1,
      frequency: 'monthly',
      is_paid: true,
    })).toBe('Next due Jul 1');
  });

  it('advances a paid biweekly bill when the API next due date still points at the paid cycle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-19',
      next_due_date: '2026-06-19',
      frequency: 'biweekly',
      day_of_week: 4,
      start_date: '2026-05-22',
      is_paid: true,
    })).toBe('Next due Jul 3');
  });

  it('falls back to a paid label when there is no future due date', () => {
    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      is_paid: true,
    })).toBe('Paid');
  });

  it('shows the paid date instead of overdue text when a paid bill has a stale next due date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-06-01',
      paid_date: '2026-06-01T09:00:00Z',
      is_paid: true,
    })).toBe('Paid Jun 1');
  });

  it('uses is_paid from the API as the current-cycle paid status', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-06-01',
      paid_date: '2026-06-01T09:00:00Z',
      is_paid: false,
    })).toBe('Overdue by 17 days');
  });

  it('ignores stale overdue flags when the due date is not past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-20',
      next_due_date: '2026-06-20',
      is_paid: false,
      is_overdue: true,
    })).toBe('Due in 2 days');
  });

  it('does not report paid bills as overdue in shared due info', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(getBillDueInfo({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-07-01',
      is_paid: true,
    })).toEqual({
      dateText: 'Jul 1',
      relativeText: 'Next due in 13 days',
      statusLabel: 'Paid',
      badgeVariant: 'success',
    });
  });

  it('ignores overdue flags when the API marks the occurrence paid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(getBillDueInfo({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-06-01',
      cycle_paid_date: '2026-06-01T09:00:00Z',
      frequency: 'monthly',
      due_day: 1,
      is_paid: true,
      is_overdue: true,
    })).toEqual({
      dateText: 'Jul 1',
      relativeText: 'Next due in 13 days',
      statusLabel: 'Paid',
      badgeVariant: 'success',
    });
  });

  it('never returns overdue text for a paid bill list label', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));

    const label = formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-07-05',
      cycle_paid_date: '2026-06-18T09:00:00Z',
      frequency: 'monthly',
      due_day: 5,
      is_paid: true,
      is_overdue: true,
    });

    expect(label).not.toMatch(/overdue/i);
    expect(label).toBe('Next due Jul 5');
  });

  it('sorts paid bills by the paid-aware display date instead of the stale occurrence date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    const sorted = sortBillsByDueDate([
      {
        id: 'paid-rent',
        occurrence_due_date: '2026-06-01',
        next_due_date: '2026-06-01',
        frequency: 'monthly',
        due_day: 1,
        is_paid: true,
      },
      {
        id: 'unpaid-utility',
        occurrence_due_date: '2026-06-20',
        next_due_date: '2026-06-20',
        is_paid: false,
      },
    ]);

    expect(sorted.map((bill) => bill.id)).toEqual(['unpaid-utility', 'paid-rent']);
  });
});
