"""Paycheck allocation engine.

Core business logic that assigns bills and debt minimum payments to specific
paychecks based on due dates and the user's pay schedule.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional


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


def _advance_to_current(
    anchor: date, frequency: str, current_date: date
) -> date:
    """Advance *anchor* forward by its frequency until it is >= *current_date*.

    Handles weekly, biweekly, semi_monthly, monthly, and unknown (monthly fallback).
    """
    if frequency == "weekly":
        weeks_behind = ((current_date - anchor).days + 6) // 7  # ceil
        return anchor + timedelta(weeks=weeks_behind)

    if frequency == "biweekly":
        periods_behind = ((current_date - anchor).days + 13) // 14  # ceil
        return anchor + timedelta(weeks=2 * periods_behind)

    if frequency == "semi_monthly":
        # Determine the two pay days in any given month
        if anchor.day <= 15:
            day_a, day_b = anchor.day, anchor.day + 15
        else:
            day_a, day_b = anchor.day - 15, anchor.day

        # Walk months starting from current_date's month, looking for the
        # nearest semi-monthly date on or after current_date
        y, m = current_date.year, current_date.month
        for _ in range(3):  # at most check this month, next month, month after
            max_day = calendar.monthrange(y, m)[1]
            for d in sorted({min(day_a, max_day), min(day_b, max_day)}):
                candidate = date(y, m, d)
                if candidate >= current_date:
                    return candidate
            # advance to next month
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
        # Shouldn't reach here, but fallback
        return current_date

    # monthly or unknown — advance month by month
    candidate = anchor
    while candidate < current_date:
        candidate = _add_months(candidate, 1)
    return candidate


def _most_recent_pay_date(
    anchor: date, frequency: str, current_date: date
) -> date:
    """Find the most recent pay date that is ON or BEFORE *current_date*.

    This is the start of the pay period the user is currently living in.
    """
    if frequency == "weekly":
        periods = (current_date - anchor).days // 7  # floor
        candidate = anchor + timedelta(weeks=periods)
        # Clamp: if anchor is in the future, candidate could overshoot
        if candidate > current_date and periods > 0:
            candidate = anchor + timedelta(weeks=periods - 1)
        return candidate

    if frequency == "biweekly":
        periods = (current_date - anchor).days // 14  # floor
        candidate = anchor + timedelta(weeks=2 * periods)
        if candidate > current_date and periods > 0:
            candidate = anchor + timedelta(weeks=2 * (periods - 1))
        return candidate

    if frequency == "semi_monthly":
        if anchor.day <= 15:
            day_a, day_b = anchor.day, anchor.day + 15
        else:
            day_a, day_b = anchor.day - 15, anchor.day

        # Walk backwards from current_date's month
        y, m = current_date.year, current_date.month
        for _ in range(3):
            max_day = calendar.monthrange(y, m)[1]
            for d in sorted({min(day_a, max_day), min(day_b, max_day)}, reverse=True):
                candidate = date(y, m, d)
                if candidate <= current_date:
                    return candidate
            if m == 1:
                y, m = y - 1, 12
            else:
                m -= 1
        return anchor  # fallback

    # monthly or unknown
    candidate = anchor
    prev = candidate
    while candidate <= current_date:
        prev = candidate
        candidate = _add_months(candidate, 1)
    return prev


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
    paid_debt_ids: set | None = None,
) -> list[dict]:
    """Assign bills and debts whose due dates fall within the pay-period window.

    Returns a list of dicts sorted by due_date (soonest first).
    """
    items: list[dict] = []
    seen_bill_ids: set = set()

    # Is this the current (active) pay period?
    is_current_period = window_start <= current_date <= window_end

    for bill in bills:
        due_dates = _due_dates_in_window(
            bill.due_day, bill.frequency, window_start, window_end
        )
        full_amount = Decimal(str(bill.amount or 0))
        # Use user_share_amount if set (household-aware), otherwise full amount
        user_amount = getattr(bill, "user_share_amount", None)
        if user_amount is None:
            user_amount = full_amount
        is_split = getattr(bill, "payment_mode", "single") == "split" and bill.household_id is not None
        split_count = getattr(bill, "split_member_count", 1) or 1
        for due_dt in due_dates:
            days = (due_dt - current_date).days

            # A bill is only "paid" for this period if paid_date falls
            # within the same pay-period window.
            paid_for_period = False
            if getattr(bill, "is_paid", False) and getattr(bill, "paid_date", None):
                pd = bill.paid_date
                try:
                    pd_date = pd.date() if isinstance(pd, datetime) else (
                        pd if isinstance(pd, date) else date.fromisoformat(str(pd)[:10])
                    )
                    paid_for_period = window_start <= pd_date <= window_end
                except (ValueError, AttributeError, TypeError):
                    paid_for_period = False

            # For the global is_paid flag (not period-specific), also accept
            # bills marked paid even if paid_date is outside the window.
            if not paid_for_period and getattr(bill, "is_paid", False):
                paid_for_period = True

            # A bill is overdue ONLY if the ENTIRE pay period it belongs to
            # has already ended AND it was not paid.  Bills in the current
            # (active) period are never overdue — they're just unpaid.
            if is_current_period:
                is_overdue = False
            else:
                # This is a past period: overdue if window has ended and
                # the bill wasn't paid.
                is_overdue = (window_end < current_date) and (not paid_for_period)

            seen_bill_ids.add(bill.id)
            items.append(
                {
                    "id": bill.id,
                    "name": bill.name,
                    "item_type": "bill",
                    "amount": user_amount,
                    "full_amount": full_amount if is_split else None,
                    "due_date": due_dt,
                    "days_until_due": days,
                    "status": _due_status(days),
                    "auto_pay": bool(bill.auto_pay),
                    "is_split": is_split,
                    "split_count": split_count if is_split else 1,
                    "is_paid": paid_for_period,
                    "is_overdue": is_overdue,
                    "hidden_overdue": bool(getattr(bill, "hidden_overdue", False)),
                }
            )

    if paid_debt_ids is None:
        paid_debt_ids = set()

    for debt in debts:
        due_dates = _due_dates_in_window(
            debt.due_day, "monthly", window_start, window_end
        )
        full_amount = Decimal(str(debt.minimum_payment or 0))
        # Use user_share_amount if set (split-aware), otherwise full amount
        user_amount = getattr(debt, "user_share_amount", None)
        if user_amount is None:
            user_amount = full_amount
        is_split = bool(getattr(debt, "is_split", False))
        split_count = getattr(debt, "split_member_count", 1) or 1
        debt_is_paid = debt.id in paid_debt_ids
        for due_dt in due_dates:
            days = (due_dt - current_date).days
            # Same logic as bills: debts in the current period are never
            # overdue.  Only past-period unpaid debts are overdue.
            if is_current_period:
                is_overdue = False
            else:
                is_overdue = (window_end < current_date) and (not debt_is_paid)

            items.append(
                {
                    "id": debt.id,
                    "name": debt.name,
                    "item_type": "debt",
                    "amount": user_amount,
                    "full_amount": full_amount if is_split else None,
                    "due_date": due_dt,
                    "days_until_due": days,
                    "status": _due_status(days),
                    "auto_pay": bool(debt.auto_pay),
                    "is_split": is_split,
                    "split_count": split_count if is_split else 1,
                    "is_paid": debt_is_paid,
                    "is_overdue": is_overdue,
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
    current_date: Optional[date] = None,
    paycheck_entries: list[Any] | None = None,
    paid_debt_ids: set | None = None,
) -> dict:
    """Build a full paycheck plan across *num_periods* pay periods.

    Returns a dict ready to be serialised as a PaycheckPlanResponse.
    """
    if current_date is None:
        current_date = date.today()

    # Determine pay schedule — prefer first active income source, fall back to user profile
    if income_sources:
        source = income_sources[0]
        default_pay_amount = Decimal(str(source.amount or 0))
        frequency = source.frequency
        next_pay = source.next_pay_date
    else:
        default_pay_amount = Decimal(str(user.net_pay_amount or 0))
        frequency = user.pay_frequency or "biweekly"
        next_pay = user.next_pay_date

    # If no anchor pay date is available, default to today so the plan still renders
    if next_pay is None:
        next_pay = current_date

    # Find the current pay period: the most recent pay date <= today.
    # This works identically regardless of whether next_pay is in the past
    # or future, so both household members always get the same result.
    most_recent = _most_recent_pay_date(next_pay, frequency, current_date)
    if most_recent <= current_date:
        next_pay = most_recent
    # else: next_pay is in the future and there's no prior pay date
    #       from this anchor — use it as the first upcoming period

    # Index logged paycheck entries by pay_date for O(1) lookup
    entry_by_date: dict[date, Decimal] = {}
    if paycheck_entries:
        for entry in paycheck_entries:
            pd = entry.pay_date
            if isinstance(pd, datetime):
                pd = pd.date()
            entry_by_date[pd] = Decimal(str(entry.net_amount or 0))

    # We need num_periods + 1 dates so the last period has a boundary
    pay_dates = generate_pay_dates(next_pay, frequency, num_periods + 1)

    paychecks: list[dict] = []
    total_income = Decimal("0")
    total_obligations = Decimal("0")

    for i in range(min(num_periods, len(pay_dates) - 1)):
        window_start, window_end = get_pay_period_window(
            pay_dates[i], pay_dates[i + 1]
        )

        # Use actual logged paycheck if one exists for this period,
        # otherwise fall back to the income source template amount.
        pay_amount = default_pay_amount
        for entry_date, entry_amount in entry_by_date.items():
            if window_start <= entry_date <= window_end:
                pay_amount = entry_amount
                break

        assigned = assign_bills_to_paycheck(
            bills, debts, window_start, window_end, current_date,
            paid_debt_ids=paid_debt_ids,
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

    # Compute current/next paycheck dates for the frontend
    current_paycheck_date = pay_dates[0] if pay_dates else None
    next_paycheck_date = pay_dates[1] if len(pay_dates) > 1 else None

    return {
        "pay_frequency": frequency,
        "currency": user.currency if hasattr(user, "currency") else "USD",
        "num_periods": len(paychecks),
        "paychecks": paychecks,
        "total_income": total_income,
        "total_obligations": total_obligations,
        "overall_status": overall,
        "current_paycheck_date": current_paycheck_date,
        "next_paycheck_date": next_paycheck_date,
    }
