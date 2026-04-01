"""Calendar endpoint — returns bills + debts + paychecks for a given month."""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import extract, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.income import IncomeSource
from app.models.paycheck_entry import PaycheckEntry
from app.models.user import User
from app.services.paycheck_engine import _advance_to_current, generate_pay_dates
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
    if current_user.household_id:
        bill_query = select(Bill).where(
            or_(
                Bill.user_id == current_user.id,
                Bill.household_id == current_user.household_id,
            ),
            Bill.is_active.is_(True),
        )
    else:
        bill_query = select(Bill).where(
            Bill.user_id == current_user.id,
            Bill.is_active.is_(True),
        )
    bill_result = await db.execute(bill_query)
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
    if current_user.household_id:
        debt_query = select(Debt).where(
            or_(
                Debt.user_id == current_user.id,
                Debt.household_id == current_user.household_id,
            ),
            Debt.is_active.is_(True),
        )
    else:
        debt_query = select(Debt).where(
            Debt.user_id == current_user.id,
            Debt.is_active.is_(True),
        )
    debt_result = await db.execute(debt_query)
    debts = debt_result.scalars().all()

    # Fetch debt payments for this month to determine paid status.
    # For household debts, ANY member's payment counts as paid.
    debt_ids = [d.id for d in debts]
    paid_debt_ids: set = set()
    if debt_ids:
        debt_payment_result = await db.execute(
            select(DebtPayment.debt_id).where(
                DebtPayment.debt_id.in_(debt_ids),
                DebtPayment.period_month == month,
                DebtPayment.period_year == year,
            )
        )
        paid_debt_ids = {row[0] for row in debt_payment_result.all()}

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
                is_paid=debt.id in paid_debt_ids,
            ))

    # ── Paychecks ──────────────────────────────────────────────
    # Include manually-logged paycheck entries
    paycheck_result = await db.execute(
        select(PaycheckEntry).where(
            PaycheckEntry.user_id == current_user.id,
            extract("month", PaycheckEntry.pay_date) == month,
            extract("year", PaycheckEntry.pay_date) == year,
        )
    )
    paychecks = paycheck_result.scalars().all()
    logged_pay_dates: set[date] = set()

    for pc in paychecks:
        source_name = ""
        if pc.income_source_id:
            src = await db.get(IncomeSource, pc.income_source_id)
            source_name = src.name if src else ""
        pd = pc.pay_date
        if hasattr(pd, 'date'):
            pd = pd.date()
        logged_pay_dates.add(pd)
        events.append(CalendarEvent(
            id=f"paycheck_{pc.id}",
            type="paycheck",
            date=pd,
            title=f"Paycheck{' - ' + source_name if source_name else ''}",
            amount=float(pc.net_amount or 0),
            category=None,
            is_paid=None,
        ))

    # Generate scheduled paycheck dates from income sources
    income_result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active.is_(True),
        )
    )
    income_sources = income_result.scalars().all()

    month_start = date(year, month, 1)
    last_day_num = calendar.monthrange(year, month)[1]
    month_end = date(year, month, last_day_num)

    for src in income_sources:
        if not src.next_pay_date or not src.frequency:
            continue
        anchor = src.next_pay_date
        if hasattr(anchor, 'date'):
            anchor = anchor.date()
        # Advance anchor to near the start of the target month
        if anchor < month_start:
            anchor = _advance_to_current(anchor, src.frequency, month_start)
            # Step back one period so we don't miss a date at month_start
            back_dates = generate_pay_dates(anchor, src.frequency, 2)
            if len(back_dates) >= 2:
                step = (back_dates[1] - back_dates[0]).days
                candidate = anchor - timedelta(days=step)
                if candidate >= month_start:
                    anchor = candidate
        # Generate enough dates to cover the month (6 is plenty for any frequency)
        gen_dates = generate_pay_dates(anchor, src.frequency, 6)
        for pd in gen_dates:
            if pd < month_start:
                continue
            if pd > month_end:
                break
            if pd in logged_pay_dates:
                continue  # already have a manual entry for this date
            events.append(CalendarEvent(
                id=f"scheduled_paycheck_{src.id}_{pd.isoformat()}",
                type="paycheck",
                date=pd,
                title=f"Paycheck{' - ' + (src.name or '') if src.name else ''}",
                amount=float(src.amount or 0),
                category=None,
                is_paid=None,
            ))

    # Sort by date
    events.sort(key=lambda e: e.date)
    return events
