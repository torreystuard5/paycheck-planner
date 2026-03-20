"""Paycheck allocation engine.

Core business logic that assigns bills and debt minimum payments to specific
paychecks based on due dates and the user's pay schedule.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any


# ── Pay-date generation ────────────────────────────────────────────


def _add_months(src: date, months: int) -> date:
    """Return *src* advanced by *months* calendar months, clamping to month-end."""
    month = src.month - 1 + months
    year = src.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(src.day, max_day))


def _semi_monthly_dates(anchor: date, num_periods: int) -> list[date]:
    """Generate semi-monthly dates (1st & 15th style).

    Uses the anchor's day to determine the two pay days.  If anchor.day <= 15
    the pair is (anchor.day, anchor.day + 15-clamped-to-month-end); otherwise
    (anchor.day - 15, anchor.day).  Falls back to 1st/15th when arithmetic
    doesn't line up cleanly.
    """
    dates: list[date] = []
    if anchor.day <= 15:
        day_a, day_b = anchor.day, anchor.day + 15
    else:
        day_a, day_b = anchor.day - 15, anchor.day

    current = anchor
    while len(dates) < num_periods:
        year, month = current.year, current.month
        max_day = calendar.monthrange(year, month)[1]
        d_a = date(year, month, min(day_a, max_day))
        d_b = date(year, month, min(day_b, max_day))
        for d in sorted({d_a, d_b}):
            if d >= anchor and len(dates) < num_periods:
                dates.append(d)
        # advance to next month
        current = _add_months(current, 1)
    return dates


def generate_pay_dates(
    next_pay_date: date,
    frequency: str,
    num_periods: int,
) -> list[date]:
    """Return *num_periods* upcoming pay dates starting from *next_pay_date*."""
    if num_periods <= 0:
        return []

    if frequency == "weekly":
        return [next_pay_date + timedelta(weeks=i) for i in range(num_periods)]

    if frequency == "biweekly":
        return [next_pay_date + timedelta(weeks=2 * i) for i in range(num_periods)]

    if frequency == "semi_monthly":
        return _semi_monthly_dates(next_pay_date, num_periods)

    if frequency == "monthly":
        return [_add_months(next_pay_date, i) for i in range(num_periods)]

    # Fallback — treat unknown frequency as monthly
    return [_add_months(next_pay_date, i) for i in range(num_periods)]


# ── Pay-period windows ─────────────────────────────────────────────


def get_pay_period_window(
    pay_date: date,
    next_pay_date: date,
) -> tuple[date, date]:
    """Return (window_start, window_end) for a pay period.

    The window runs from *pay_date* through *next_pay_date - 1 day* inclusive.
    """
    return pay_date, next_pay_date - timedelta(days=1)


# ── Due-date helpers ───────────────────────────────────────────────


def _actual_due_date(due_day: int, year: int, month: int) -> date:
    """Clamp *due_day* to the actual last day of *year/month*."""
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(due_day, max_day))


def _due_status(days_until_due: int) -> str:
    if days_until_due < 0:
        return "overdue"
    if days_until_due <= 1:
        return "urgent"
    if days_until_due <= 4:
        return "due_soon"
    return "upcoming"


# ── Assign bills / debts to a single pay period ───────────────────


def _due_dates_in_window(
    due_day: int,
    frequency: str,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Return all due dates for an item that fall inside *[window_start, window_end]*.

    For monthly items this is at most one date.  For higher-frequency items we
    generate candidates for every month the window touches.
    """
    candidates: list[date] = []
    # Iterate over every month the window spans
    y, m = window_start.year, window_start.month
    end_y, end_m = window_end.year, window_end.month
    while (y, m) <= (end_y, end_m):
        d = _actual_due_date(due_day, y, m)
        if window_start <= d <= window_end:
            candidates.append(d)
        # advance month
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    return candidates


def assign_bills_to_paycheck(
    bills: list[Any],
    debts: list[Any],
    window_start: date,
    window_end: date,
    current_date: date,
) -> list[dict]:
    """Assign bills and debts whose due dates fall within the pay-period window.

    Returns a list of dicts sorted by due_date (soonest first).
    """
    items: list[dict] = []

    for bill in bills:
        due_dates = _due_dates_in_window(
            bill.due_day, bill.frequency, window_start, window_end
        )
        for due_dt in due_dates:
            days = (due_dt - current_date).days
            items.append(
                {
                    "id": bill.id,
                    "name": bill.name,
                    "item_type": "bill",
                    "amount": Decimal(str(bill.amount)),
                    "due_date": due_dt,
                    "days_until_due": days,
                    "status": _due_status(days),
                    "auto_pay": bool(bill.auto_pay),
                }
            )

    for debt in debts:
        due_dates = _due_dates_in_window(
            debt.due_day, "monthly", window_start, window_end
        )
        for due_dt in due_dates:
            days = (due_dt - current_date).days
            items.append(
                {
                    "id": debt.id,
                    "name": debt.name,
                    "item_type": "debt",
                    "amount": Decimal(str(debt.minimum_payment)),
                    "due_date": due_dt,
                    "days_until_due": days,
                    "status": _due_status(days),
                    "auto_pay": bool(debt.auto_pay),
                }
            )

    items.sort(key=lambda x: x["due_date"])
    return items


# ── Main orchestrator ──────────────────────────────────────────────


def build_paycheck_plan(
    user: Any,
    income_sources: list[Any],
    bills: list[Any],
    debts: list[Any],
    num_periods: int = 4,
    current_date: date | None = None,
) -> dict:
    """Build a full paycheck plan across *num_periods* pay periods.

    Returns a dict ready to be serialised as a PaycheckPlanResponse.
    """
    if current_date is None:
        current_date = date.today()

    # Determine pay schedule — prefer first active income source, fall back to user profile
    if income_sources:
        source = income_sources[0]
        pay_amount = Decimal(str(source.amount))
        frequency = source.frequency
        next_pay = source.next_pay_date
    else:
        pay_amount = Decimal(str(user.net_pay_amount))
        frequency = user.pay_frequency
        next_pay = user.next_pay_date

    # We need num_periods + 1 dates so the last period has a boundary
    pay_dates = generate_pay_dates(next_pay, frequency, num_periods + 1)

    paychecks: list[dict] = []
    total_income = Decimal("0")
    total_obligations = Decimal("0")

    for i in range(min(num_periods, len(pay_dates) - 1)):
        window_start, window_end = get_pay_period_window(
            pay_dates[i], pay_dates[i + 1]
        )

        assigned = assign_bills_to_paycheck(
            bills, debts, window_start, window_end, current_date
        )

        total_due = sum((item["amount"] for item in assigned), Decimal("0"))
        remaining = pay_amount - total_due

        paychecks.append(
            {
                "paycheck_date": pay_dates[i],
                "paycheck_amount": pay_amount,
                "assigned_items": assigned,
                "total_due": total_due,
                "remaining": remaining,
                "status": "on_track" if remaining >= 0 else "over_budget",
            }
        )

        total_income += pay_amount
        total_obligations += total_due

    net = total_income - total_obligations
    if net < 0:
        overall = "over_budget"
    elif any(p["status"] == "over_budget" for p in paychecks):
        overall = "some_periods_over"
    else:
        overall = "on_track"

    return {
        "pay_frequency": frequency,
        "currency": user.currency if hasattr(user, "currency") else "USD",
        "num_periods": len(paychecks),
        "paychecks": paychecks,
        "total_income": total_income,
        "total_obligations": total_obligations,
        "overall_status": overall,
    }
