import calendar
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.paycheck_schedule import PaycheckSchedule
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/payments", tags=["Payments"])


# ── Pay period derivation helpers ────────────────────────────────


def _next_weekday(start: date, weekday: int) -> date:
    days_ahead = weekday - start.weekday()
    if days_ahead < 0:
        days_ahead += 7
    return start + timedelta(days=days_ahead)


def _clamp_day(year: int, month: int, day: int) -> date:
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def _get_paycheck_dates_around(schedule: PaycheckSchedule, target: date) -> list[date]:
    """Generate paycheck dates in a window around `target` (90 days before to 90 days after)."""
    window_start = target - timedelta(days=90)
    window_end = target + timedelta(days=90)
    dates: list[date] = []

    if schedule.frequency == "weekly":
        dow = schedule.day_of_week if schedule.day_of_week is not None else 4
        d = _next_weekday(window_start, dow)
        while d <= window_end:
            dates.append(d)
            d += timedelta(days=7)

    elif schedule.frequency == "biweekly":
        dow = schedule.day_of_week if schedule.day_of_week is not None else 4
        anchor = schedule.anchor_date if schedule.anchor_date else target
        d = _next_weekday(anchor, dow)
        if d > window_start:
            while d - timedelta(days=14) >= window_start:
                d -= timedelta(days=14)
        else:
            weeks_diff = (window_start - d).days // 14
            d += timedelta(days=14 * weeks_diff)
            if d < window_start:
                d += timedelta(days=14)
        while d <= window_end:
            dates.append(d)
            d += timedelta(days=14)

    elif schedule.frequency == "semi_monthly":
        d1 = schedule.day1 if schedule.day1 is not None else 1
        d2 = schedule.day2 if schedule.day2 is not None else 15
        if d1 > d2:
            d1, d2 = d2, d1
        year, month = window_start.year, window_start.month
        while True:
            c1 = _clamp_day(year, month, d1)
            c2 = _clamp_day(year, month, d2)
            if c1 > window_end:
                break
            if c1 >= window_start:
                dates.append(c1)
            if c2 >= window_start and c2 <= window_end:
                dates.append(c2)
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1

    elif schedule.frequency == "monthly":
        d1 = schedule.day1 if schedule.day1 is not None else 1
        year, month = window_start.year, window_start.month
        while True:
            c = _clamp_day(year, month, d1)
            if c > window_end:
                break
            if c >= window_start:
                dates.append(c)
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1

    dates.sort()
    return dates


def _derive_pay_period(paid_date: date, schedules: list[PaycheckSchedule]) -> date | None:
    """Find the most recent paycheck date on or before paid_date across all schedules."""
    best: date | None = None
    for sched in schedules:
        try:
            dates = _get_paycheck_dates_around(sched, paid_date)
            for d in dates:
                if d <= paid_date and (best is None or d > best):
                    best = d
        except Exception:
            continue
    return best


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entity_name = "payment"
    # Validate that the bill or debt belongs to the current user or household
    if data.bill_id:
        result = await db.execute(select(Bill).where(Bill.id == data.bill_id))
        bill = result.scalar_one_or_none()
        if not bill:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bill not found or does not belong to you",
            )
        if bill.user_id != current_user.id and (
            not current_user.household_id or bill.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bill not found or does not belong to you",
            )
        entity_name = bill.name

    if data.debt_id:
        result = await db.execute(select(Debt).where(Debt.id == data.debt_id))
        debt_obj = result.scalar_one_or_none()
        if not debt_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debt not found or does not belong to you",
            )
        if debt_obj.user_id != current_user.id and (
            not current_user.household_id or debt_obj.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debt not found or does not belong to you",
            )
        entity_name = debt_obj.name

    payment = Payment(
        user_id=current_user.id,
        bill_id=data.bill_id,
        debt_id=data.debt_id,
        amount=data.amount,
        paid_date=data.paid_date,
        pay_period_date=data.pay_period_date,
        is_extra=data.is_extra,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="payment",
                entity_name=entity_name,
                details=f"${data.amount}",
                db=db,
            )
        except Exception:
            pass

    return payment


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    pay_period_date: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        from app.services.household_service import get_household_members
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        query = select(Payment).where(Payment.user_id.in_(member_ids))
    else:
        query = select(Payment).where(Payment.user_id == current_user.id)

    if pay_period_date:
        query = query.where(Payment.pay_period_date == pay_period_date)
    if start_date:
        query = query.where(Payment.paid_date >= start_date)
    if end_date:
        query = query.where(Payment.paid_date <= end_date)

    query = query.order_by(Payment.paid_date.desc())
    result = await db.execute(query)
    payments = result.scalars().all()

    # Derive pay period for payments missing pay_period_date
    needs_derivation = any(p.pay_period_date is None and p.paid_date is not None for p in payments)
    schedules: list[PaycheckSchedule] = []
    if needs_derivation:
        try:
            sched_result = await db.execute(
                select(PaycheckSchedule).where(PaycheckSchedule.user_id == current_user.id)
            )
            schedules = list(sched_result.scalars().all())
        except Exception:
            schedules = []

    response = []
    for p in payments:
        data = PaymentResponse.model_validate(p)
        if data.pay_period_date is None and data.paid_date is not None and schedules:
            try:
                data.derived_pay_period_date = _derive_pay_period(data.paid_date, schedules)
            except Exception:
                data.derived_pay_period_date = None
        response.append(data)

    return response


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.user_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.user_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    await db.delete(payment)
    await db.flush()
