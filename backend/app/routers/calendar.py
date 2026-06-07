"""Calendar endpoint — returns bills + debts + paychecks for a given month."""

import calendar
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.paycheck_entry import PaycheckEntry
from app.models.user import User
from app.services.bill_cycles import occurrence_dates_for_bill
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
    first_day = date(year, month, 1)
    last_day_num = calendar.monthrange(year, month)[1]
    last_day = date(year, month, last_day_num)
    return occurrence_dates_for_bill(bill, first_day, last_day)


@router.get("", response_model=list[CalendarEvent])
async def get_calendar_events(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    view: str = Query(default="household", pattern="^(household|personal)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events: list[CalendarEvent] = []
    is_personal = view == "personal"
    has_household = current_user.household_id is not None

    # ── Household member count (for split calculations) ────────
    member_count = 1
    if has_household:
        mc_result = await db.execute(
            select(func.count()).select_from(User).where(
                User.household_id == current_user.household_id
            )
        )
        member_count = max(mc_result.scalar() or 1, 1)

    # ── Bills ──────────────────────────────────────────────────
    if has_household:
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
        full_amount = float(bill.amount or 0)
        is_household_bill = bill.household_id is not None

        # Personal view filtering & share calculation
        if is_personal and has_household and is_household_bill:
            if bill.payment_mode == "split":
                amount = float(
                    (Decimal(str(bill.amount or 0)) / member_count).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                )
            elif bill.payment_mode == "single":
                # Only show if assigned to this user
                if bill.assigned_member_id:
                    if bill.assigned_member_id != current_user.id:
                        continue
                elif bill.user_id != current_user.id:
                    continue
                amount = full_amount
            else:
                amount = full_amount
        else:
            amount = full_amount

        freq = bill.frequency or "monthly"
        if freq in ("weekly", "biweekly"):
            for d in _bill_weekly_dates_in_month(bill, year, month):
                events.append(CalendarEvent(
                    id=f"bill_{bill.id}",
                    type="bill",
                    date=d,
                    title=bill.name or "Untitled Bill",
                    amount=amount,
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
                    amount=amount,
                    category=bill.category,
                    is_paid=bill.is_paid,
                ))

    # ── Debts ──────────────────────────────────────────────────
    if has_household:
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
        full_amount = float(debt.minimum_payment or 0)

        # Personal view: compute user's share for split debts
        if is_personal and has_household and debt.is_split:
            split_count = 1
            raw_members = debt.split_members
            if raw_members:
                try:
                    parsed = json.loads(raw_members) if isinstance(raw_members, str) else raw_members
                    if isinstance(parsed, list) and len(parsed) > 0:
                        split_count = len(parsed)
                except (json.JSONDecodeError, TypeError):
                    pass
            if split_count <= 1 and debt.household_id and member_count > 1:
                split_count = member_count
            if split_count > 1:
                amount = float(
                    (Decimal(str(debt.minimum_payment or 0)) / split_count).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                )
            else:
                amount = full_amount
        else:
            amount = full_amount

        due_day = debt.due_day
        if due_day:
            last_day = calendar.monthrange(year, month)[1]
            d = date(year, month, min(due_day, last_day))
            events.append(CalendarEvent(
                id=f"debt_{debt.id}",
                type="debt",
                date=d,
                title=debt.name or "Untitled Debt",
                amount=amount,
                category=None,
                is_paid=debt.id in paid_debt_ids,
            ))

    # ── Paychecks ──────────────────────────────────────────────
    # In household view, include all household members' paychecks.
    # In personal view, only the current user's.

    if has_household and not is_personal:
        # Household view: get all members' paychecks with names
        member_result = await db.execute(
            select(User.id, User.first_name).where(
                User.household_id == current_user.household_id
            )
        )
        members = {row[0]: row[1] for row in member_result.all()}
        member_ids = list(members.keys())

        # Logged paycheck entries for all members
        paycheck_result = await db.execute(
            select(PaycheckEntry).where(
                PaycheckEntry.user_id.in_(member_ids),
                extract("month", PaycheckEntry.pay_date) == month,
                extract("year", PaycheckEntry.pay_date) == year,
            )
        )
        paychecks = paycheck_result.scalars().all()

        for pc in paychecks:
            source_name = pc.source_name or ""
            pd = pc.pay_date
            if hasattr(pd, "date"):
                pd = pd.date()
            uid = pc.user_id
            owner_name = members.get(uid, "")
            label_parts = []
            if source_name:
                label_parts.append(source_name)
            if owner_name:
                label_parts.append(owner_name)
            title = "Paycheck"
            if label_parts:
                title += " - " + " · ".join(label_parts)
            events.append(CalendarEvent(
                id=f"paycheck_{pc.id}",
                type="paycheck",
                date=pd,
                title=title,
                amount=float(pc.net_amount or 0),
                category=None,
                is_paid=None,
            ))
    else:
        # Personal view or no household: current user only
        paycheck_result = await db.execute(
            select(PaycheckEntry).where(
                PaycheckEntry.user_id == current_user.id,
                extract("month", PaycheckEntry.pay_date) == month,
                extract("year", PaycheckEntry.pay_date) == year,
            )
        )
        paychecks = paycheck_result.scalars().all()

        for pc in paychecks:
            source_name = pc.source_name or ""
            pd = pc.pay_date
            if hasattr(pd, "date"):
                pd = pd.date()
            events.append(CalendarEvent(
                id=f"paycheck_{pc.id}",
                type="paycheck",
                date=pd,
                title=f"Paycheck{' - ' + source_name if source_name else ''}",
                amount=float(pc.net_amount or 0),
                category=None,
                is_paid=None,
            ))

    # Sort by date
    events.sort(key=lambda e: e.date)
    return events
