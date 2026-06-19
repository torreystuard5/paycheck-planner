import { differenceInCalendarDays } from 'date-fns';
import { formatDate, formatFriendlyDate } from './formatDate';

function parseDueDateValue(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const value = String(raw);
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  const out = new Date(value);
  out.setHours(0, 0, 0, 0);
  return out;
}

function getToday() {
  return startOfDay(new Date());
}

export function isBillPaidForCurrentCycle(bill) {
  return bill?.is_paid === true;
}

function addDays(value, days) {
  const out = startOfDay(value);
  out.setDate(out.getDate() + days);
  return out;
}

function actualDueDate(year, monthIndex, dueDay) {
  return new Date(year, monthIndex + 1, 0).getDate() < dueDay
    ? new Date(year, monthIndex + 1, 0)
    : new Date(year, monthIndex, dueDay);
}

function addMonths(value, months) {
  const source = startOfDay(value);
  const targetMonth = source.getMonth() + months;
  return actualDueDate(source.getFullYear(), targetMonth, source.getDate());
}

function firstWeekdayOnOrAfter(value, dayOfWeek) {
  const start = startOfDay(value);
  const apiWeekday = (start.getDay() + 6) % 7;
  const daysAhead = (dayOfWeek - apiWeekday + 7) % 7;
  return addDays(start, daysAhead);
}

function getNextMonthlyDueDateAfter(bill, afterDate, monthStep = 1) {
  const dueDay = Number(bill?.due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return addMonths(afterDate, monthStep);
  }

  let candidate = actualDueDate(afterDate.getFullYear(), afterDate.getMonth(), dueDay);
  while (differenceInCalendarDays(candidate, afterDate) <= 0) {
    candidate = actualDueDate(candidate.getFullYear(), candidate.getMonth() + monthStep, dueDay);
  }
  return candidate;
}

function getNextSemiMonthlyDueDateAfter(bill, afterDate) {
  const dueDay = Number(bill?.due_day) || 1;
  const secondaryDay = dueDay <= 15 ? Math.min(dueDay + 15, 31) : Math.max(dueDay - 15, 1);
  const dueDays = [...new Set([dueDay, secondaryDay])].sort((a, b) => a - b);

  let year = afterDate.getFullYear();
  let month = afterDate.getMonth();
  for (let i = 0; i < 24; i += 1) {
    for (const day of dueDays) {
      const candidate = actualDueDate(year, month, day);
      if (differenceInCalendarDays(candidate, afterDate) > 0) {
        return candidate;
      }
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return null;
}

function getNextWeeklyDueDateAfter(bill, afterDate, intervalDays) {
  const dayOfWeek = Number(bill?.day_of_week);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return addDays(afterDate, intervalDays);
  }

  if (intervalDays === 14 && bill?.start_date) {
    const startDate = parseDueDateValue(bill.start_date);
    if (startDate) {
      let candidate = firstWeekdayOnOrAfter(startDate, dayOfWeek);
      while (differenceInCalendarDays(candidate, afterDate) <= 0) {
        candidate = addDays(candidate, 14);
      }
      return candidate;
    }
  }

  const nextWeekday = firstWeekdayOnOrAfter(addDays(afterDate, 1), dayOfWeek);
  if (intervalDays === 7) return nextWeekday;
  return differenceInCalendarDays(nextWeekday, afterDate) <= 7
    ? addDays(startOfDay(afterDate), 14)
    : nextWeekday;
}

function getNextScheduledDateAfter(bill, afterDate) {
  if (!afterDate) return null;
  const normalizedAfterDate = startOfDay(afterDate);
  const frequency = bill?.frequency;
  if (!frequency) return null;

  if (frequency === 'weekly') return getNextWeeklyDueDateAfter(bill, normalizedAfterDate, 7);
  if (frequency === 'biweekly') return getNextWeeklyDueDateAfter(bill, normalizedAfterDate, 14);
  if (frequency === 'semi_monthly') return getNextSemiMonthlyDueDateAfter(bill, normalizedAfterDate);
  if (frequency === 'quarterly') return getNextMonthlyDueDateAfter(bill, normalizedAfterDate, 3);
  if (frequency === 'annual' || frequency === 'yearly') return getNextMonthlyDueDateAfter(bill, normalizedAfterDate, 12);
  if (frequency === 'one_time') return null;
  return getNextMonthlyDueDateAfter(bill, normalizedAfterDate, 1);
}

function getPaidCycleDueDate(bill) {
  return parseDueDateValue(bill?.occurrence_due_date || bill?.due_date || bill?.next_due_date);
}

function getPaidNextDueDate(bill) {
  const today = getToday();
  const paidCycleDueDate = getPaidCycleDueDate(bill);
  const rawNextDueDate = parseDueDateValue(bill?.next_due_date);

  if (rawNextDueDate) {
    const nextDueDate = startOfDay(rawNextDueDate);
    const isUpcoming = differenceInCalendarDays(nextDueDate, today) >= 0;
    const advancesPastPaidCycle = !paidCycleDueDate
      || differenceInCalendarDays(nextDueDate, startOfDay(paidCycleDueDate)) > 0;
    if (isUpcoming && advancesPastPaidCycle) {
      return nextDueDate;
    }
  }

  const fallbackAnchor = paidCycleDueDate || rawNextDueDate;
  const computedNextDueDate = fallbackAnchor
    ? getNextScheduledDateAfter(bill, fallbackAnchor)
    : null;
  if (computedNextDueDate && differenceInCalendarDays(computedNextDueDate, today) >= 0) {
    return startOfDay(computedNextDueDate);
  }

  return null;
}

function getPaidStatusLabel(bill, userDateFormat) {
  const nextDue = getPaidNextDueDate(bill);

  if (nextDue) {
    return `Next due ${formatBillDateText(nextDue.toISOString().slice(0, 10), userDateFormat)}`;
  }

  const paidAt = bill?.cycle_paid_date || bill?.paid_date;
  if (paidAt) {
    return `Paid ${formatFriendlyDate(paidAt)}`;
  }

  return 'Paid';
}

/** Resolve the effective due date from bill API fields. */
export function parseBillDueDate(bill) {
  return parseDueDateValue(bill?.occurrence_due_date || bill?.next_due_date || bill?.due_date);
}

export function parseBillDisplayDueDate(bill) {
  if (isBillPaidForCurrentCycle(bill)) {
    return getPaidNextDueDate(bill);
  }
  return parseBillDueDate(bill);
}

function parseBillSortDate(bill) {
  const displayDueDate = parseBillDisplayDueDate(bill);
  if (displayDueDate) return displayDueDate;

  if (isBillPaidForCurrentCycle(bill)) {
    return parseDueDateValue(bill?.cycle_paid_date || bill?.paid_date);
  }

  return null;
}

function formatBillDateText(isoDate, userDateFormat) {
  return userDateFormat
    ? formatDate(isoDate, userDateFormat)
    : formatFriendlyDate(isoDate);
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
  if (isBillPaidForCurrentCycle(bill)) {
    const nextDue = parseBillDisplayDueDate(bill);
    const isoDate = nextDue ? nextDue.toISOString().slice(0, 10) : null;
    const today = getToday();
    const diff = nextDue ? differenceInCalendarDays(startOfDay(nextDue), today) : null;
    const paidAt = bill?.cycle_paid_date || bill?.paid_date;

    return {
      dateText: nextDue && isoDate
        ? formatBillDateText(isoDate, userDateFormat)
        : paidAt
          ? formatFriendlyDate(paidAt)
          : 'Paid',
      relativeText:
        nextDue && diff !== null
          ? diff > 0
            ? `Next due in ${diff} days`
            : diff === 0
              ? 'Next due today'
              : null
          : null,
      statusLabel: 'Paid',
      badgeVariant: 'success',
    };
  }

  const due = parseBillDisplayDueDate(bill);
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

  const today = getToday();
  const dueDay = startOfDay(due);
  const diff = differenceInCalendarDays(dueDay, today);

  const dateText = formatBillDateText(isoDate, userDateFormat);

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

export function formatBillListDueLabel(bill, userDateFormat) {
  if (isBillPaidForCurrentCycle(bill)) {
    return getPaidStatusLabel(bill, userDateFormat);
  }

  const due = parseBillDisplayDueDate(bill);
  if (due) {
    const today = getToday();
    const dueDay = startOfDay(due);
    const diff = differenceInCalendarDays(dueDay, today);
    const dateLabel = formatBillDateText(due.toISOString().slice(0, 10), userDateFormat);

    if (diff < 0) {
      const days = Math.abs(diff);
      return days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`;
    }
    if (diff === 0) return `Due ${dateLabel}`;
    if (diff <= 7) return diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`;
    return `Due ${dateLabel}`;
  }

  if (bill?.due_day) {
    const month = new Date().toLocaleDateString('en-US', { month: 'short' });
    return `Due ${month} ${bill.due_day}`;
  }

  return 'Due date unknown';
}

export function sortBillsByDueDate(bills) {
  return [...bills].sort((a, b) => {
    const da = parseBillSortDate(a);
    const db = parseBillSortDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });
}
