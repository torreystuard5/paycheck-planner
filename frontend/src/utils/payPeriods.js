import {
  addDays,
  endOfMonth,
  lastDayOfMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  isBefore,
  isAfter,
} from 'date-fns';

export const PAY_PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semi_monthly: 24,
  monthly: 12,
};

function fixedLengthPeriod(anchorDateStr, refDate, lenDays) {
  const ref = startOfDay(typeof refDate === 'string' ? parseISO(refDate) : refDate);
  let start = startOfDay(parseISO(anchorDateStr));
  while (isBefore(ref, start)) {
    start = addDays(start, -lenDays);
  }
  while (isAfter(ref, addDays(start, lenDays - 1))) {
    start = addDays(start, lenDays);
  }
  return { start, end: addDays(start, lenDays - 1) };
}

/**
 * Current pay period containing refDate (default today).
 * @returns {{ start: Date, end: Date } | null}
 */
export function payPeriodContaining(payFrequency, anchorDateStr, refDate = new Date()) {
  if (!payFrequency || !anchorDateStr) return null;
  const ref = typeof refDate === 'string' ? parseISO(refDate) : refDate;
  if (payFrequency === 'weekly') return fixedLengthPeriod(anchorDateStr, ref, 7);
  if (payFrequency === 'biweekly') return fixedLengthPeriod(anchorDateStr, ref, 14);
  if (payFrequency === 'monthly') {
    const s = startOfMonth(ref);
    const e = endOfMonth(ref);
    return { start: s, end: e };
  }
  if (payFrequency === 'semi_monthly') {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const d = ref.getDate();
    if (d <= 15) return { start: new Date(y, m, 1), end: new Date(y, m, 15) };
    return { start: new Date(y, m, 16), end: lastDayOfMonth(ref) };
  }
  return null;
}

export function formatDateISO(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : parseISO(d);
  return x.toISOString().slice(0, 10);
}
