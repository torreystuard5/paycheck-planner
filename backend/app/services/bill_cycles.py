from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.bill_cycle_payment import BillCyclePayment
from app.models.transaction import Payment
from app.models.user import User

DEFAULT_TIMEZONE = "America/Chicago"

RECURRING_FREQUENCIES = frozenset(
    {"weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "annual", "yearly"}
)


def _actual_due_date(due_day: int, year: int, month: int) -> date:
    return date(year, month, min(due_day, calendar.monthrange(year, month)[1]))


def resolve_user_timezone(user: User | None = None) -> ZoneInfo:
    tz_name = DEFAULT_TIMEZONE
    if user is not None:
        for attr in ("timezone", "time_zone"):
            raw = getattr(user, attr, None)
            if raw:
                tz_name = str(raw)
                break
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def local_today(user: User | None = None) -> date:
    return datetime.now(resolve_user_timezone(user)).date()


def is_recurring_bill(bill: Bill) -> bool:
    freq = (bill.frequency or "monthly").lower()
    return freq in RECURRING_FREQUENCIES


def is_cadence_recurring_bill(bill: Bill) -> bool:
    """Weekly/biweekly bills located by day_of_week + optional start_date anchor."""
    freq = (bill.frequency or "monthly").lower()
    return freq in ("weekly", "biweekly") and bill.day_of_week is not None


def due_date_for_month(bill: Bill, year: int, month: int) -> date | None:
    if bill.due_day is None:
        return None
    return _actual_due_date(bill.due_day, year, month)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    return start, end


def months_in_range(start: date, end: date) -> list[tuple[int, int]]:
    pairs: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        pairs.append((y, m))
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    return pairs


def current_month_due_date(bill: Bill, today: date | None = None) -> date | None:
    today = today or date.today()
    freq = bill.frequency or "monthly"
    if freq in ("weekly", "biweekly", "one_time"):
        return None
    if bill.due_day is None:
        return None
    if freq in ("monthly", "semi_monthly"):
        return due_date_for_month(bill, today.year, today.month)

    month_start, month_end = month_bounds(today.year, today.month)
    dates = occurrence_dates_for_bill(bill, month_start, month_end)
    return dates[0] if dates else None


def _add_months(src: date, months: int) -> date:
    month = src.month - 1 + months
    year = src.year + month // 12
    month = month % 12 + 1
    return _actual_due_date(src.day, year, month)


def _as_date(value: Any) -> date | None:
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


def biweekly_anchor(start_date: date, day_of_week: int) -> date:
    """First day_of_week on or after start_date — anchor for every-other-week cadence."""
    days = (day_of_week - start_date.weekday()) % 7
    return start_date + timedelta(days=days)


def first_biweekly_on_or_after(anchor: date, on_or_after: date) -> date:
    """First date on anchor's 14-day cadence that falls on or after on_or_after."""
    if on_or_after <= anchor:
        return anchor
    delta = (on_or_after - anchor).days
    periods = (delta + 13) // 14
    return anchor + timedelta(days=periods * 14)


def weekly_occurrences_in_window(
    day_of_week: int,
    window_start: date,
    window_end: date,
) -> list[date]:
    if window_end < window_start:
        return []
    days_ahead = (day_of_week - window_start.weekday()) % 7
    candidate = window_start + timedelta(days=days_ahead)
    occurrences: list[date] = []
    while candidate <= window_end:
        occurrences.append(candidate)
        candidate += timedelta(days=7)
    return occurrences


def biweekly_occurrences_in_window(
    day_of_week: int,
    start_date: date | None,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Every-other day_of_week occurrence in [window_start, window_end], anchored on start_date."""
    if window_end < window_start:
        return []
    if start_date is not None:
        anchor = biweekly_anchor(start_date, day_of_week)
        candidate = first_biweekly_on_or_after(anchor, window_start)
    else:
        days_ahead = (day_of_week - window_start.weekday()) % 7
        candidate = window_start + timedelta(days=days_ahead)
    occurrences: list[date] = []
    while candidate <= window_end:
        occurrences.append(candidate)
        candidate += timedelta(days=14)
    return occurrences


def occurrence_dates_for_bill(
    bill: Bill,
    window_start: date,
    window_end: date,
) -> list[date]:
    freq = bill.frequency or "monthly"
    if window_end < window_start:
        return []

    postpone_until = _as_date(getattr(bill, "postpone_until", None))
    if postpone_until:
        return [postpone_until] if window_start <= postpone_until <= window_end else []

    if freq == "one_time":
        start = _as_date(bill.start_date)
        return [start] if start and window_start <= start <= window_end else []

    if freq == "weekly":
        if bill.day_of_week is None:
            return []
        return weekly_occurrences_in_window(bill.day_of_week, window_start, window_end)

    if freq == "biweekly":
        if bill.day_of_week is None:
            return []
        return biweekly_occurrences_in_window(
            bill.day_of_week,
            _as_date(bill.start_date),
            window_start,
            window_end,
        )

    if freq == "semi_monthly":
        due_day = bill.due_day or 1
        secondary_day = min(due_day + 15, 31) if due_day <= 15 else max(due_day - 15, 1)
        due_days = sorted({due_day, secondary_day})
    else:
        due_days = [bill.due_day or 1]

    months_step = 1
    if freq == "quarterly":
        months_step = 3
    elif freq in ("annual", "yearly"):
        months_step = 12

    anchor = _as_date(bill.start_date)
    if months_step > 1 and anchor is None:
        if freq == "quarterly":
            anchor_month = ((window_start.month - 1) // 3) * 3 + 1
        else:
            anchor_month = window_start.month
        anchor = _actual_due_date(bill.due_day or 1, window_start.year, anchor_month)
    y, m = window_start.year, window_start.month
    occurrences: list[date] = []
    while (y, m) <= (window_end.year, window_end.month):
        if anchor and months_step > 1:
            month_delta = (y - anchor.year) * 12 + (m - anchor.month)
            if month_delta < 0 or month_delta % months_step != 0:
                if m == 12:
                    y, m = y + 1, 1
                else:
                    m += 1
                continue

        for day in due_days:
            candidate = _actual_due_date(day, y, m)
            if anchor and candidate < anchor:
                continue
            if window_start <= candidate <= window_end:
                occurrences.append(candidate)

        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1

    return sorted(set(occurrences))


def occurrence_dates_for_month(bill: Bill, year: int, month: int) -> list[date]:
    start, end = month_bounds(year, month)
    return occurrence_dates_for_bill(bill, start, end)


def next_due_date_for_bill(bill: Bill, today: date | None = None) -> date | None:
    today = today or date.today()
    month_due = current_month_due_date(bill, today)
    if month_due is not None:
        if month_due >= today:
            return month_due
        freq = bill.frequency or "monthly"
        if freq not in ("weekly", "biweekly"):
            return month_due
    dates = occurrence_dates_for_bill(bill, today, _add_months(today, 18))
    for due in dates:
        if due >= today:
            result = due
            break
    else:
        result = dates[0] if dates else None

    if (getattr(bill, "name", None) or "").strip().lower() == "amanda car":
        try:
            from app.services.debug_bill_dates import log_amanda_car

            log_amanda_car(
                "next_due_date_for_bill",
                today=str(today),
                start_date=str(getattr(bill, "start_date", None)),
                day_of_week=getattr(bill, "day_of_week", None),
                frequency=getattr(bill, "frequency", None),
                candidate_dates=[str(d) for d in dates[:6]],
                next_due_date=str(result) if result else None,
            )
        except Exception:
            pass

    return result


def cycle_window_start(today: date | None = None) -> date:
    today = today or date.today()
    return today.replace(day=1)


async def get_visible_bill_query(db: AsyncSession, current_user: User, bill_id: UUID | None = None):
    if current_user.household_id:
        query = select(Bill).where(
            or_(
                Bill.user_id == current_user.id,
                Bill.household_id == current_user.household_id,
            )
        )
    else:
        query = select(Bill).where(Bill.user_id == current_user.id)
    if bill_id:
        query = query.where(Bill.id == bill_id)
    return query


async def get_cycle_payments(
    db: AsyncSession,
    bill_ids: list[UUID],
    start_date: date,
    end_date: date,
) -> dict[tuple[UUID, date], BillCyclePayment]:
    if not bill_ids:
        return {}
    result = await db.execute(
        select(BillCyclePayment).where(
            BillCyclePayment.bill_id.in_(bill_ids),
            BillCyclePayment.due_date >= start_date,
            BillCyclePayment.due_date <= end_date,
        )
    )
    return {(row.bill_id, row.due_date): row for row in result.scalars().all()}


async def get_cycle_payments_for_month(
    db: AsyncSession,
    bill_ids: list[UUID],
    cycle_year: int,
    cycle_month: int,
) -> dict[tuple[UUID, date], BillCyclePayment]:
    if not bill_ids:
        return {}
    result = await db.execute(
        select(BillCyclePayment).where(
            BillCyclePayment.bill_id.in_(bill_ids),
            BillCyclePayment.cycle_year == cycle_year,
            BillCyclePayment.cycle_month == cycle_month,
        )
    )
    return {(row.bill_id, row.due_date): row for row in result.scalars().all()}


async def auto_generate_missing_cycle_rows(
    db: AsyncSession,
    bills: list[Bill],
    user: User,
    cycle_year: int,
    cycle_month: int,
) -> int:
    """Insert pending cycle rows for recurring bills missing from a calendar month."""
    recurring = [b for b in bills if is_recurring_bill(b)]
    if not recurring:
        return 0

    bill_ids = [b.id for b in recurring]
    existing = await get_cycle_payments_for_month(db, bill_ids, cycle_year, cycle_month)
    existing_keys = set(existing.keys())

    rows: list[dict[str, Any]] = []
    for bill in recurring:
        for due_date in occurrence_dates_for_month(bill, cycle_year, cycle_month):
            if (bill.id, due_date) in existing_keys:
                continue
            rows.append(
                {
                    "bill_id": bill.id,
                    "user_id": bill.user_id,
                    "household_id": bill.household_id,
                    "budget_id": bill.budget_id,
                    "due_date": due_date,
                    "cycle_year": cycle_year,
                    "cycle_month": cycle_month,
                    "amount_due": Decimal(str(bill.amount or 0)),
                    "amount_paid": Decimal("0"),
                    "is_paid": False,
                    "paid_date": None,
                    "source": "auto_generated",
                }
            )
            existing_keys.add((bill.id, due_date))

    if not rows:
        return 0

    stmt = insert(BillCyclePayment).values(rows)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_bill_cycle_payments_bill_due")
    await db.execute(stmt)
    await db.flush()
    return len(rows)


async def auto_generate_missing_cycle_rows_for_window(
    db: AsyncSession,
    bills: list[Bill],
    user: User,
    window_start: date,
    window_end: date,
) -> int:
    total = 0
    for year, month in months_in_range(window_start, window_end):
        total += await auto_generate_missing_cycle_rows(db, bills, user, year, month)
    return total


async def ensure_pending_cycle_row(
    db: AsyncSession,
    bill: Bill,
    user: User,
    due_date: date,
) -> BillCyclePayment:
    existing = await get_cycle_payments(db, [bill.id], due_date, due_date)
    row = existing.get((bill.id, due_date))
    if row is not None:
        return row

    await auto_generate_missing_cycle_rows(
        db, [bill], user, due_date.year, due_date.month
    )
    existing = await get_cycle_payments(db, [bill.id], due_date, due_date)
    row = existing.get((bill.id, due_date))
    if row is not None:
        return row

    row = BillCyclePayment(
        bill_id=bill.id,
        user_id=bill.user_id,
        household_id=bill.household_id,
        budget_id=bill.budget_id,
        due_date=due_date,
        cycle_year=due_date.year,
        cycle_month=due_date.month,
        amount_due=Decimal(str(bill.amount or 0)),
        amount_paid=Decimal("0"),
        is_paid=False,
        source="auto_generated",
    )
    db.add(row)
    await db.flush()
    return row


async def ensure_pending_cycle_rows(
    db: AsyncSession,
    bills: list[Bill],
    due_dates_by_bill: dict[UUID, date],
    user: User,
) -> dict[tuple[UUID, date], BillCyclePayment]:
    if not due_dates_by_bill:
        return {}

    months_needed: set[tuple[int, int]] = set()
    for due_date in due_dates_by_bill.values():
        months_needed.add((due_date.year, due_date.month))
    for year, month in months_needed:
        await auto_generate_missing_cycle_rows(db, bills, user, year, month)

    start_date = min(due_dates_by_bill.values())
    end_date = max(due_dates_by_bill.values())
    payments = await get_cycle_payments(db, list(due_dates_by_bill.keys()), start_date, end_date)
    return {
        (bill_id, due_date): payments[(bill_id, due_date)]
        for bill_id, due_date in due_dates_by_bill.items()
        if (bill_id, due_date) in payments
    }


async def mark_bill_cycle_paid(
    db: AsyncSession,
    bill: Bill,
    user: User,
    due_date: date,
    amount_paid: Decimal | None,
    paid_date: datetime | None,
    source: str | None,
) -> BillCyclePayment:
    paid_at = paid_date or datetime.now(timezone.utc)
    amount_due = Decimal(str(bill.amount or 0))
    paid_amount = amount_paid if amount_paid is not None else amount_due

    result = await db.execute(
        select(BillCyclePayment).where(
            BillCyclePayment.bill_id == bill.id,
            BillCyclePayment.due_date == due_date,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = BillCyclePayment(
            bill_id=bill.id,
            user_id=user.id,
            household_id=bill.household_id,
            budget_id=bill.budget_id,
            due_date=due_date,
            cycle_year=due_date.year,
            cycle_month=due_date.month,
            amount_due=amount_due,
            source=source or "bills_page",
        )
        db.add(row)

    row.user_id = user.id
    row.household_id = bill.household_id
    row.budget_id = bill.budget_id
    row.amount_due = amount_due
    row.amount_paid = paid_amount
    row.is_paid = True
    row.paid_date = paid_at
    row.source = source or row.source or "bills_page"

    bill.is_paid = True
    bill.paid_date = paid_at
    bill.paid_amount = paid_amount
    await db.flush()
    return row


async def mark_bill_cycle_unpaid(
    db: AsyncSession,
    bill: Bill,
    due_date: date,
    user_id: UUID | None = None,
) -> None:
    await db.execute(
        delete(BillCyclePayment).where(
            BillCyclePayment.bill_id == bill.id,
            BillCyclePayment.due_date == due_date,
        )
    )
    legacy_filter = [
        Payment.bill_id == bill.id,
        Payment.auto_logged.is_(True),
        Payment.paid_date == due_date,
    ]
    if user_id:
        legacy_filter.append(Payment.user_id == user_id)
    await db.execute(delete(Payment).where(*legacy_filter))

    bill.is_paid = False
    bill.paid_date = None
    bill.paid_amount = None
    await db.flush()
