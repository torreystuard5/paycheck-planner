"""Shared due-date helpers for monthly day-of-month scheduling."""

from __future__ import annotations

from calendar import monthrange
from datetime import date


def next_monthly_due_date(
    due_day: int | None,
    *,
    today: date | None = None,
) -> date | None:
    """Return the next upcoming due date for a monthly *due_day* (1–31).

    Clamps to the last day of the month when *due_day* exceeds month length.
    Returns ``None`` when *due_day* is missing.
    """
    if not due_day:
        return None

    today = today or date.today()
    _, max_day = monthrange(today.year, today.month)
    clamped = min(int(due_day), max_day)
    candidate = today.replace(day=clamped)
    if candidate >= today:
        return candidate

    if today.month == 12:
        year, month = today.year + 1, 1
    else:
        year, month = today.year, today.month + 1
    _, max_day = monthrange(year, month)
    return date(year, month, min(int(due_day), max_day))
