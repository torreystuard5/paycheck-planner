import { differenceInCalendarDays } from 'date-fns';
import { formatFriendlyDate } from './formatDate';

function parseDueDate(item) {
  const raw = item?.due_date ?? item?.occurrence_due_date;
  if (!raw) return null;
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Short due label for paycheck plan assigned items (bills + debts).
 * @returns {{ text: string, isOverdue: boolean } | null}
 */
export function formatAssignedItemDueLabel(item) {
  const due = parseDueDate(item);
  if (!due) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = differenceInCalendarDays(due, today);
  const dateLabel = formatFriendlyDate(
    item.due_date ?? item.occurrence_due_date,
  );
  const isOverdue = Boolean(item.is_overdue) || diff < 0;

  if (isOverdue) {
    return { text: `Due ${dateLabel}`, isOverdue: true };
  }
  if (diff === 0) return { text: 'Due today', isOverdue: false };
  if (diff === 1) return { text: 'Due tomorrow', isOverdue: false };
  if (diff <= 7) return { text: `Due in ${diff} days`, isOverdue: false };
  return { text: `Due ${dateLabel}`, isOverdue: false };
}
