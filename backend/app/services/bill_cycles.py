from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.bill_cycle_payment import BillCyclePayment
from app.models.transaction import Payment
from app.models.user import User


def _actual_due_date(due_day: int, year: int, month: int) -> date:
    return date(year, month, min(due_day, calendar.monthrange(year, month)[1]))


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


def occurrence_dates_for_bill(
    bill: Bill,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Return every occurrence due date for a bill inside a date window."""

    freq = bill.frequency or "monthly"
    if window_end < window_start:
        return []

    postpone_until = _as_date(getattr(bill, "postpone_until", None))
    if postpone_until:
        return [postpone_until] if window_start <= postpone_until <= window_end else []

    if freq == "one_time":
        start = _as_date(bill.start_date)
        return [start] if start and window_start <= start <= window_end else []

    if freq in ("weekly", "biweekly"):
        if bill.day_of_week is None:
            return []
        step_days = 7 if freq == "weekly" else 14
        days_ahead = (bill.day_of_week - window_start.weekday()) % 7
        candidate = window_start + timedelta(days=days_ahead)
        start_date = _as_date(bill.start_date)
        if freq == "biweekly" and start_date:
            while candidate < start_date:
                candidate += timedelta(days=step_days)
            delta_days = (candidate - start_date).days
            if (delta_days // 7) % 2 != 0:
                candidate += timedelta(days=7)

        occurrences: list[date] = []
        while candidate <= window_end:
            occurrences.append(candidate)
            candidate += timedelta(days=step_days)
        return occurrences

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


def next_due_date_for_bill(bill: Bill, today: date | None = None) -> date | None:
    today = today or date.today()
    dates = occurrence_dates_for_bill(bill, today, _add_months(today, 18))
    return dates[0] if dates else None


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

    # The recurring definition no longer owns cycle state.  Keep the legacy
    # fields aligned only as a compatibility hint for older callers.
    bill.is_paid = False
    bill.paid_date = None
    bill.paid_amount = None
    await db.flush()
