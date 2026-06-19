import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBillListDueLabel, getBillDueInfo } from './billDueDate';

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

  it('falls back to a paid label when there is no future due date', () => {
    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      is_paid: true,
    })).toBe('Paid for this period');
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

  it('treats backend paid dates as paid even if the boolean flag is stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));

    expect(formatBillListDueLabel({
      occurrence_due_date: '2026-06-01',
      next_due_date: '2026-06-01',
      paid_date: '2026-06-01T09:00:00Z',
      is_paid: false,
    })).toBe('Paid Jun 1');
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
});
