import { describe, expect, it } from 'vitest';
import { formatAssignedItemDueLabel } from './assignedItemDueLabel';

describe('formatAssignedItemDueLabel', () => {
  it('returns relative label within a week', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(today);
    due.setDate(due.getDate() + 3);

    const label = formatAssignedItemDueLabel({
      due_date: due.toISOString().slice(0, 10),
      is_overdue: false,
    });

    expect(label).toEqual({ text: 'Due in 3 days', isOverdue: false });
  });

  it('returns overdue due date label', () => {
    const label = formatAssignedItemDueLabel({
      due_date: '2026-06-05',
      is_overdue: true,
    });

    expect(label?.isOverdue).toBe(true);
    expect(label?.text).toMatch(/^Due Jun 5/);
  });
});
