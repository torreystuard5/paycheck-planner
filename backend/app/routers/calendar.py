"""Calendar endpoint — returns bills + debts + paychecks for a given month."""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.paycheck_entry import PaycheckEntry
from app.models.user import User
from app.utils.security import get_current_user

router = APIRouter(prefix="/calendar", tags=["Calendar"])


class CalendarEvent(BaseModel):
    id: str
    type: str  # "bill" | "debt" | "paycheck"
    date: date
    title: str
    amount: float
    category: str | None = None
    is_paid: bool | None = None


def _bill_due_date_in_month(bill: Bill, year: int, month: int) -> date | None:
    """Compute the due date for a bill within a specific month, if applicable."""
    freq = bill.frequency or "monthly"

    if freq == "one_time":
        if bill.start_date and bill.start_date.year == year and bill.start_date.month == month:
            return bill.start_date
        return None

    if freq == "monthly":
        due_day = bill.due_day or 1
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(due_day, last_day))

    if freq in ("weekly", "biweekly"):
        dow = bill.day_of_week
        if dow is None:
            return None  # can't compute without day_of_week
        # Return all matching dates in the month (handled below)
        return None  # signal to use the multi-date path

    # quarterly, semi_annual, annual — use start_date as anchor
    if bill.start_date:
        anchor = bill.start_date
        period_months = {"quarterly": 3, "semi_annual": 6, "annual": 12}.get(freq)
        if period_months:
            # Check if this month is on the cadence
            month_diff = (year - anchor.year) * 12 + (month - anchor.month)
            if month_diff >= 0 and month_diff % period_months == 0:
                last_day = calendar.monthrange(year, month)[1]
                return date(year, month, min(anchor.day, last_day))
    return None


def _bill_weekly_dates_in_month(bill: Bill, year: int, month: int) -> list[date]:
    """Return all weekly/biweekly occurrence dates for a bill in a given month."""
    freq = bill.frequency or "monthly"
    dow = bill.day_of_week
    if dow is None:
        return []

    first_day = date(year, month, 1)
    last_day_num = calendar.monthrange(year, month)[1]
    last_day = date(year, month, last_day_num)

    # Find first occurrence of this day-of-week in the month
    days_ahead = dow - first_day.weekday()
    if days_ahead < 0:
        days_ahead += 7
    current = first_day + timedelta(days=days_ahead)

    dates = []
    while current <= last_day:
        if freq == "biweekly" and bill.start_date:
            delta_days = (current - bill.start_date).days
            weeks_diff = delta_days // 7
            if weeks_diff % 2 != 0:
                current += timedelta(days=7)
                continue
        dates.append(current)
        current += timedelta(days=7)
    return dates


@router.get("", response_model=list[CalendarEvent])
async def get_calendar_events(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events: list[CalendarEvent] = []

    # ── Bills ──────────────────────────────────────────────────
    bill_result = await db.execute(
        select(Bill).where(
            Bill.user_id == current_user.id,
            Bill.is_active.is_(True),
        )
    )
    bills = bill_result.scalars().all()

    for bill in bills:
        freq = bill.frequency or "monthly"

        if freq in ("weekly", "biweekly"):
            for d in _bill_weekly_dates_in_month(bill, year, month):
                events.append(CalendarEvent(
                    id=f"bill_{bill.id}",
                    type="bill",
                    date=d,
                    title=bill.name or "Untitled Bill",
                    amount=float(bill.amount or 0),
                    category=bill.category,
                    is_paid=bill.is_paid,
                ))
        else:
            d = _bill_due_date_in_month(bill, year, month)
            if d:
                events.append(CalendarEvent(
                    id=f"bill_{bill.id}",
                    type="bill",
                    date=d,
                    title=bill.name or "Untitled Bill",
                    amount=float(bill.amount or 0),
                    category=bill.category,
                    is_paid=bill.is_paid,
                ))

    # ── Debts ──────────────────────────────────────────────────
    debt_result = await db.execute(
        select(Debt).where(
            Debt.user_id == current_user.id,
            Debt.is_active.is_(True),
        )
    )
    debts = debt_result.scalars().all()

    for debt in debts:
        due_day = debt.due_day
        if due_day:
            last_day = calendar.monthrange(year, month)[1]
            d = date(year, month, min(due_day, last_day))
            events.append(CalendarEvent(
                id=f"debt_{debt.id}",
                type="debt",
                date=d,
                title=debt.name or "Untitled Debt",
                amount=float(debt.minimum_payment or 0),
                category=None,
                is_paid=None,
            ))

    # ── Paychecks ──────────────────────────────────────────────
    paycheck_result = await db.execute(
        select(PaycheckEntry).where(
            PaycheckEntry.user_id == current_user.id,
            extract("month", PaycheckEntry.pay_date) == month,
            extract("year", PaycheckEntry.pay_date) == year,
        )
    )
    paychecks = paycheck_result.scalars().all()

    for pc in paychecks:
        source_name = ""
        if pc.income_source_id:
            from app.models.income import IncomeSource
            src = await db.get(IncomeSource, pc.income_source_id)
            source_name = src.name if src else ""
        events.append(CalendarEvent(
            id=f"paycheck_{pc.id}",
            type="paycheck",
            date=pc.pay_date,
            title=f"Paycheck{' - ' + source_name if source_name else ''}",
            amount=float(pc.net_amount or 0),
            category=None,
            is_paid=None,
        ))

    # Sort by date
    events.sort(key=lambda e: e.date)
    return events
