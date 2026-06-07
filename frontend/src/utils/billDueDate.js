import { differenceInCalendarDays } from 'date-fns';
import { formatDate, formatFriendlyDate } from './formatDate';

/** Resolve the effective due date from bill API fields. */
export function parseBillDueDate(bill) {
  const raw = bill?.occurrence_due_date || bill?.next_due_date || bill?.due_date;
  if (!raw) return null;
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Amount the current user owes (handles split household bills). */
export function getBillDisplayAmount(bill) {
  const isSplit = bill?.payment_mode === 'split' && bill?.is_household_bill;
  if (isSplit) return Number(bill.user_share ?? bill.amount) || 0;
  return Number(bill.user_share ?? bill.amount) || 0;
}

/** Full bill amount when split (for "your share of $X" line). */
export function getBillTotalAmount(bill) {
  return Number(bill?.amount) || 0;
}

export function isSplitHouseholdBill(bill) {
  return bill?.payment_mode === 'split' && bill?.is_household_bill;
}

/**
 * Due date label, relative text, and status badge for list rows.
 */
export function getBillDueInfo(bill, userDateFormat) {
  const due = parseBillDueDate(bill);
  const isoDate = due ? due.toISOString().slice(0, 10) : null;

  if (!due) {
    if (bill?.due_day) {
      return {
        dateText: `Day ${bill.due_day}`,
        relativeText: null,
        statusLabel: 'Scheduled',
        badgeVariant: 'neutral',
      };
    }
    return {
      dateText: 'Date unknown',
      relativeText: null,
      statusLabel: null,
      badgeVariant: 'neutral',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diff = differenceInCalendarDays(dueDay, today);

  const dateText = userDateFormat
    ? formatDate(isoDate, userDateFormat)
    : formatFriendlyDate(isoDate);

  if (bill?.is_overdue || diff < 0) {
    const days = Math.abs(diff);
    return {
      dateText,
      relativeText: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
      statusLabel: 'Overdue',
      badgeVariant: 'danger',
    };
  }

  if (diff === 0) {
    return {
      dateText,
      relativeText: 'Due today',
      statusLabel: 'Due today',
      badgeVariant: 'warning',
    };
  }

  if (diff === 1) {
    return {
      dateText,
      relativeText: 'Due tomorrow',
      statusLabel: 'Tomorrow',
      badgeVariant: 'warning',
    };
  }

  if (diff <= 7) {
    return {
      dateText,
      relativeText: `Due in ${diff} days`,
      statusLabel: 'Due soon',
      badgeVariant: 'warning',
    };
  }

  return {
    dateText,
    relativeText: `Due in ${diff} days`,
    statusLabel: 'Upcoming',
    badgeVariant: 'info',
  };
}

export function sortBillsByDueDate(bills) {
  return [...bills].sort((a, b) => {
    const da = parseBillDueDate(a);
    const db = parseBillDueDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });
}
