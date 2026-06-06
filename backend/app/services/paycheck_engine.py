"""Paycheck allocation engine.

Core business logic that assigns bills and debt minimum payments to specific
paychecks based on due dates and the user's pay schedule.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

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


def previous_period_bounds(
    current_period_start: date,
    pay_frequency: str,
    *,
    anchor_pay_date: date | None = None,
) -> tuple[date, date] | None:
    """Return (prev_start, prev_end) for the pay period before *current_period_start*.

    When *anchor_pay_date* is supplied, walk the generated pay schedule so
    semi-monthly and irregular anchors align with income.  Falls back to
    fixed calendar steps when no anchor match is found.
    """
    prev_start: date | None = None
    if anchor_pay_date is not None:
        dates = generate_pay_dates(anchor_pay_date, pay_frequency, 48)
        for i, d in enumerate(dates):
            if d == current_period_start and i > 0:
                prev_start = dates[i - 1]
                break

    if prev_start is None:
        if pay_frequency == "biweekly":
            prev_start = current_period_start - timedelta(days=14)
        elif pay_frequency == "weekly":
            prev_start = current_period_start - timedelta(days=7)
        elif pay_frequency == "semi_monthly":
            prev_start = current_period_start - timedelta(days=15)
        elif pay_frequency == "monthly":
            m = current_period_start.month - 1 or 12
            y = current_period_start.year - (1 if current_period_start.month == 1 else 0)
            d = min(
                current_period_start.day,
                calendar.monthrange(y, m)[1],
            )
            prev_start = date(y, m, d)
        else:
            return None

    if prev_start >= current_period_start:
        return None
    return prev_start, current_period_start - timedelta(days=1)


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


def _coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _bill_due_dates_in_window(
    bill: Any,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Due dates for a bill inside the pay-period window (definition-based, not cycle rows)."""
    freq = bill.frequency or "monthly"
    postpone_dt = _coerce_date(getattr(bill, "postpone_until", None))
    if postpone_dt is not None:
        return [postpone_dt] if window_start <= postpone_dt <= window_end else []

    if freq == "one_time":
        start = _coerce_date(getattr(bill, "start_date", None))
        return [start] if start and window_start <= start <= window_end else []

    day_of_week = getattr(bill, "day_of_week", None)
    use_recurrence = freq in ("weekly", "biweekly") and day_of_week is not None

    if use_recurrence:
        cadence_start = _coerce_date(getattr(bill, "start_date", None))
        engine_dates = _due_dates_in_window(
            bill.due_day or 1,
            freq,
            window_start,
            window_end,
            day_of_week=day_of_week,
            start_date=cadence_start,
        )
        try:
            from app.services.bill_cycles import occurrence_dates_for_bill

            cycle_dates = occurrence_dates_for_bill(bill, window_start, window_end)
        except Exception:
            cycle_dates = []
        return sorted(set(engine_dates) | set(cycle_dates))

    # Monthly (and bills mis-labeled biweekly without day_of_week): schedule by due_day.
    schedule_freq = freq if freq in ("semi_monthly", "quarterly", "annual", "yearly") else "monthly"
    engine_dates = _due_dates_in_window(
        bill.due_day or 1,
        schedule_freq,
        window_start,
        window_end,
    )
    try:
        from app.services.bill_cycles import occurrence_dates_for_bill

        cycle_dates = occurrence_dates_for_bill(bill, window_start, window_end)
    except Exception:
        cycle_dates = []
    return sorted(set(engine_dates) | set(cycle_dates))


# ── Assign bills / debts to a single pay period ───────────────────


def _due_dates_in_window(
    due_day: int,
    frequency: str,
    window_start: date,
    window_end: date,
    *,
    day_of_week: int | None = None,
    start_date: date | None = None,
) -> list[date]:
    """Return all due dates for an item that fall inside *[window_start, window_end]*.

    For monthly items this is at most one date.  For weekly/biweekly items we
    use *day_of_week* and *start_date* to walk the correct cadence.
    """
    if frequency == "one_time":
        if start_date and window_start <= start_date <= window_end:
            return [start_date]
        return []

    # ── Weekly / biweekly: walk by week cadence ──────────────────
    if frequency in ("weekly", "biweekly") and day_of_week is not None:
        step_days = 7 if frequency == "weekly" else 14

        # Find the first occurrence of this day-of-week on or after window_start
        days_ahead = (day_of_week - window_start.weekday()) % 7
        candidate = window_start + timedelta(days=days_ahead)

        # For biweekly, align to the anchor cadence using start_date
        if frequency == "biweekly" and start_date is not None:
            delta = (candidate - start_date).days
            weeks_off = delta // 7
            if weeks_off % 2 != 0:
                candidate += timedelta(days=7)

        candidates: list[date] = []
        while candidate <= window_end:
            if candidate >= window_start:
                candidates.append(candidate)
            candidate += timedelta(days=step_days)
        return candidates

    # ── Monthly / semi-monthly / longer cycles: iterate months ───
    due_days = [due_day]
    months_step = 1
    if frequency == "semi_monthly":
        secondary_day = min(due_day + 15, 31) if due_day <= 15 else max(due_day - 15, 1)
        due_days = sorted({due_day, secondary_day})
    elif frequency == "quarterly":
        months_step = 3
    elif frequency in ("annual", "yearly"):
        months_step = 12

    cycle_anchor = start_date
    if months_step > 1 and cycle_anchor is None:
        anchor_month = ((window_start.month - 1) // 3) * 3 + 1 if frequency == "quarterly" else window_start.month
        cycle_anchor = _actual_due_date(due_day, window_start.year, anchor_month)

    candidates = []
    y, m = window_start.year, window_start.month
    end_y, end_m = window_end.year, window_end.month
    while (y, m) <= (end_y, end_m):
        if cycle_anchor and months_step > 1:
            month_delta = (y - cycle_anchor.year) * 12 + (m - cycle_anchor.month)
            if month_delta < 0 or month_delta % months_step != 0:
                if m == 12:
                    y, m = y + 1, 1
                else:
                    m += 1
                continue

        for day in due_days:
            d = _actual_due_date(day, y, m)
            if start_date and d < start_date:
                continue
            if window_start <= d <= window_end:
                candidates.append(d)
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    return sorted(set(candidates))


def _debt_paycheck_amount(debt: Any) -> Decimal:
    """Full minimum payment for paycheck assignment (never household-split)."""
    return Decimal(str(debt.minimum_payment or 0))


def _bill_paycheck_amount(bill: Any) -> tuple[Decimal, Decimal, bool, int]:
    """Return (user_amount, full_amount, is_split, split_count) for a bill line."""
    full_amount = Decimal(str(bill.amount or 0))
    is_split = (
        getattr(bill, "payment_mode", "single") == "split"
        and getattr(bill, "household_id", None) is not None
    )
    split_count = getattr(bill, "split_member_count", 1) or 1
    share = getattr(bill, "user_share_amount", None)
    if is_split:
        user_amount = share if share is not None else full_amount
    elif share is not None and share > 0:
        user_amount = share
    else:
        user_amount = full_amount
    return user_amount, full_amount, is_split, split_count


def normalize_paycheck_line_item(item: dict) -> dict:
    """Canonical amounts/flags for API responses (debts = full min, bills keep split)."""
    out = dict(item)
    if out.get("item_type") == "debt":
        amount = Decimal(str(out.get("amount") or 0))
        full_amount = out.get("full_amount")
        if full_amount is not None:
            amount = Decimal(str(full_amount))
        elif out.get("is_split") and int(out.get("split_count") or 1) > 1:
            amount = (amount * int(out["split_count"])).quantize(Decimal("0.01"))
        out["amount"] = amount
        out["is_split"] = False
        out["full_amount"] = None
        out["split_count"] = 1
    return out


def assign_bills_to_paycheck(
    bills: list[Any],
    debts: list[Any],
    window_start: date,
    window_end: date,
    current_date: date,
    paid_debt_ids: set | None = None,
    paid_bill_map: dict | None = None,
) -> list[dict]:
    """Assign bills and debts whose due dates fall within the pay-period window.

    Returns a list of dicts sorted by due_date (soonest first).
    """
    items: list[dict] = []
    seen_bill_ids: set = set()

    # Is this the current (active) pay period?
    is_current_period = window_start <= current_date <= window_end

    for bill in bills:
        if getattr(bill, "is_active", True) is False:
            continue
        due_dates = _bill_due_dates_in_window(bill, window_start, window_end)
        user_amount, full_amount, is_split, split_count = _bill_paycheck_amount(bill)
        bill_postpone = _coerce_date(getattr(bill, "postpone_until", None))
        for due_dt in due_dates:
            days = (due_dt - current_date).days

            # Determine if the bill is paid *for this specific pay-period window*
            # by checking whether a payment row exists with paid_date in [window_start, window_end].
            # This replaces the old approach of trusting the global Bill.is_paid flag.
            paid_for_period = False
            if paid_bill_map is not None and bill.id in paid_bill_map:
                for paid_marker in paid_bill_map[bill.id]:
                    try:
                        if isinstance(paid_marker, dict):
                            marker_due = paid_marker.get("due_date")
                            marker_due_date = marker_due.date() if isinstance(marker_due, datetime) else (
                                marker_due if isinstance(marker_due, date) else date.fromisoformat(str(marker_due)[:10])
                            )
                            if marker_due_date == due_dt:
                                paid_for_period = True
                                break
                            continue

                        # Legacy Payment rows (paid_date only): match the specific
                        # occurrence month, not merely any payment in the window.
                        # Otherwise a May payment incorrectly clears June Rent.
                        pd_date = paid_marker.date() if isinstance(paid_marker, datetime) else (
                            paid_marker if isinstance(paid_marker, date) else date.fromisoformat(str(paid_marker)[:10])
                        )
                        if (
                            pd_date.year == due_dt.year
                            and pd_date.month == due_dt.month
                            and (
                                pd_date >= due_dt
                                or abs((pd_date - due_dt).days) <= 7
                            )
                        ):
                            paid_for_period = True
                            break
                    except (ValueError, AttributeError, TypeError):
                        pass

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
                normalize_paycheck_line_item(
                    {
                        "id": bill.id,
                        "name": bill.name or "Untitled Bill",
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
                        "postpone_until": str(bill_postpone) if bill_postpone else None,
                    }
                )
            )

    if paid_debt_ids is None:
        paid_debt_ids = set()

    for debt in debts:
        if getattr(debt, "is_active", True) is False:
            continue
        postpone_dt = _coerce_date(getattr(debt, "postpone_until", None))
        if postpone_dt is not None:
            due_dates = (
                [postpone_dt]
                if window_start <= postpone_dt <= window_end
                else []
            )
        else:
            due_dates = _due_dates_in_window(
                debt.due_day or 1,
                "monthly",
                window_start,
                window_end,
            )
        min_payment = _debt_paycheck_amount(debt)
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
                normalize_paycheck_line_item(
                    {
                        "id": debt.id,
                        "name": debt.name or "Untitled Debt",
                        "item_type": "debt",
                        "amount": min_payment,
                        "full_amount": None,
                        "due_date": due_dt,
                        "days_until_due": days,
                        "status": _due_status(days),
                        "auto_pay": bool(debt.auto_pay),
                        "is_split": False,
                        "split_count": 1,
                        "is_paid": debt_is_paid,
                        "is_overdue": is_overdue,
                        "postpone_until": str(postpone_dt) if postpone_dt else None,
                        "apr": Decimal(str(getattr(debt, "apr", None) or 0)),
                        "balance": Decimal(str(getattr(debt, "balance", None) or 0)),
                    }
                )
            )

    items.sort(key=lambda x: x["due_date"])
    return items


# ── Main orchestrator ──────────────────────────────────────────────


async def build_paycheck_plan(
    user: Any,
    income_sources: list[Any],
    bills: list[Any],
    debts: list[Any],
    num_periods: int = 4,
    current_date: Optional[date] = None,
    paycheck_entries: list[Any] | None = None,
    paid_debt_ids: set | None = None,
    paid_bill_map: dict | None = None,
    db: Any | None = None,
    user_ids: list | None = None,
    get_paid_bill_ids_fn: Any | None = None,
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

    # Fetch paid-bill map ONCE for the entire plan window (perf: single query)
    if paid_bill_map is None and db is not None and get_paid_bill_ids_fn is not None:
        bill_ids = [b.id for b in bills]
        overall_start = pay_dates[0] if pay_dates else current_date
        overall_end = pay_dates[-1] if pay_dates else current_date
        paid_bill_map = await get_paid_bill_ids_fn(
            db,
            user_ids or [],
            bill_ids,
            overall_start,
            overall_end,
            bills=bills,
            user=user,
        )
    if paid_bill_map is None:
        paid_bill_map = {}

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
            paid_bill_map=paid_bill_map,
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


# ---------------------------------------------------------------------------
# Canonical paycheck planning state (shared by assigned items + pull widget)
# ---------------------------------------------------------------------------


def occurrence_key(item_type: str, item_id: UUID, due_date: date) -> str:
    return f"{item_type}:{item_id}:{due_date.isoformat()}"


def planning_item_id(item: dict) -> UUID:
    raw = item.get("item_id") or item.get("id")
    return raw if isinstance(raw, UUID) else UUID(str(raw))


def normalize_planning_item(item: dict) -> dict:
    """Stable item_type + item_id + occurrence key for matching across lists."""
    out = dict(item)
    iid = planning_item_id(item)
    due = parse_item_due_date(item)
    out["item_id"] = iid
    out["id"] = iid
    out["occurrence_due_date"] = due
    out["planning_key"] = occurrence_key(item["item_type"], iid, due)
    return out


def parse_item_due_date(item: dict) -> date:
    raw = item.get("due_date")
    if isinstance(raw, date):
        return raw
    if isinstance(raw, datetime):
        return raw.date()
    return date.fromisoformat(str(raw)[:10])


def active_cycle_overdue(
    due_date: date,
    today: date,
    cycle_year: int,
    cycle_month: int,
) -> bool:
    """Overdue only when due falls in the active calendar cycle and is before today."""
    if due_date >= today:
        return False
    return due_date.year == cycle_year and due_date.month == cycle_month

def apply_planning_due_labels(
    item: dict,
    *,
    today: date,
    cycle_year: int,
    cycle_month: int,
) -> dict:
    """Single place for overdue / due labels on planning items."""
    out = dict(item)
    due = parse_item_due_date(item)
    days = (due - today).days
    overdue = active_cycle_overdue(due, today, cycle_year, cycle_month)
    out["is_overdue"] = overdue
    out["due_status"] = "overdue" if overdue else "due"
    out["days_until_due"] = days
    return out
