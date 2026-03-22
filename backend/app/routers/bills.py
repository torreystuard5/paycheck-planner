from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.bill_member_payment import BillMemberPayment
from app.models.user import User
from app.schemas.bill import (
    BillBreakdownResponse,
    BillCreate,
    BillPayRequest,
    BillResponse,
    BillUpdate,
    MemberPaymentRequest,
    MemberShareResponse,
)
from app.services.household_billing import get_bill_breakdown
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/bills", tags=["Bills"])

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _compute_next_due_date(bill: Bill) -> date | None:
    """Compute the next due date for a bill based on its frequency."""
    today = date.today()
    freq = bill.frequency or "monthly"

    if freq == "one_time":
        if bill.start_date:
            return bill.start_date if bill.start_date >= today else None
        return None

    if freq in ("weekly", "biweekly"):
        dow = bill.day_of_week
        if dow is None:
            return None
        # Find next occurrence of this day-of-week
        days_ahead = dow - today.weekday()
        if days_ahead < 0:
            days_ahead += 7
        next_date = today + timedelta(days=days_ahead)

        if freq == "biweekly" and bill.start_date:
            # Ensure we're on the correct biweekly cadence
            anchor = bill.start_date
            delta_days = (next_date - anchor).days
            weeks_diff = delta_days // 7
            if weeks_diff % 2 != 0:
                next_date += timedelta(days=7)
        return next_date

    if freq == "monthly":
        due_day = bill.due_day or 1
        try:
            candidate = today.replace(day=min(due_day, 28))
        except ValueError:
            candidate = today.replace(day=28)
        if candidate < today:
            month = candidate.month + 1
            year = candidate.year
            if month > 12:
                month = 1
                year += 1
            try:
                candidate = candidate.replace(year=year, month=month, day=min(due_day, 28))
            except ValueError:
                candidate = candidate.replace(year=year, month=month, day=28)
        return candidate

    if freq == "quarterly":
        due_day = bill.due_day or 1
        current_quarter_month = ((today.month - 1) // 3) * 3 + 1
        for offset in [0, 3, 6, 9]:
            m = current_quarter_month + offset
            y = today.year
            if m > 12:
                m -= 12
                y += 1
            try:
                candidate = date(y, m, min(due_day, 28))
            except ValueError:
                candidate = date(y, m, 28)
            if candidate >= today:
                return candidate
        return None

    if freq in ("annual", "yearly"):
        due_day = bill.due_day or 1
        if bill.start_date:
            m = bill.start_date.month
        else:
            m = today.month
        try:
            candidate = date(today.year, m, min(due_day, 28))
        except ValueError:
            candidate = date(today.year, m, 28)
        if candidate < today:
            try:
                candidate = date(today.year + 1, m, min(due_day, 28))
            except ValueError:
                candidate = date(today.year + 1, m, 28)
        return candidate

    return None


def _bill_to_response(bill: Bill) -> BillResponse:
    """Convert a Bill ORM object to BillResponse with is_household_bill flag."""
    assigned_name = None
    if bill.assigned_member_id and bill.assigned_member:
        m = bill.assigned_member
        assigned_name = f"{m.first_name or ''} {m.last_name or ''}".strip() or m.email
    return BillResponse(
        id=bill.id,
        user_id=bill.user_id,
        household_id=bill.household_id,
        name=bill.name,
        amount=bill.amount,
        due_day=bill.due_day,
        frequency=bill.frequency,
        category=bill.category,
        auto_pay=bill.auto_pay,
        reminder_days=bill.reminder_days,
        is_paid=bill.is_paid,
        paid_date=bill.paid_date,
        paid_amount=bill.paid_amount,
        is_active=bill.is_active,
        payment_mode=bill.payment_mode,
        assigned_member_id=bill.assigned_member_id,
        assigned_member_name=assigned_name,
        day_of_week=bill.day_of_week,
        start_date=bill.start_date,
        next_due_date=_compute_next_due_date(bill),
        created_at=bill.created_at,
        updated_at=bill.updated_at,
        is_household_bill=bill.household_id is not None,
    )


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
async def create_bill(
    data: BillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bill = Bill(
        user_id=current_user.id,
        household_id=current_user.household_id,
        name=data.name,
        amount=data.amount,
        due_day=data.due_day,
        frequency=data.frequency,
        category=data.category,
        auto_pay=data.auto_pay,
        reminder_days=data.reminder_days,
        payment_mode=data.payment_mode,
        assigned_member_id=data.assigned_member_id,
        day_of_week=data.day_of_week,
        start_date=data.start_date,
    )
    db.add(bill)
    await db.flush()
    await db.refresh(bill)
    # Eagerly load assigned_member for response
    if bill.assigned_member_id:
        result = await db.execute(
            select(Bill).where(Bill.id == bill.id).options(selectinload(Bill.assigned_member))
        )
        bill = result.scalar_one()

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="created",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=f"${bill.amount}" if bill.amount else None,
                db=db,
            )
        except Exception:
            pass

    return _bill_to_response(bill)


@router.get("", response_model=list[BillResponse])
async def list_bills(
    active_only: bool = True,
    status: str | None = Query(default=None, pattern="^(paid|unpaid)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        query = select(Bill).where(
            or_(
                Bill.user_id == current_user.id,
                Bill.household_id == current_user.household_id,
            )
        )
    else:
        query = select(Bill).where(Bill.user_id == current_user.id)
    if active_only:
        query = query.where(Bill.is_active.is_(True))
    if status == "paid":
        query = query.where(Bill.is_paid.is_(True))
    elif status == "unpaid":
        query = query.where(Bill.is_paid.is_(False))
    query = query.options(selectinload(Bill.assigned_member)).order_by(Bill.due_day)
    result = await db.execute(query)
    bills = result.scalars().all()
    return [_bill_to_response(b) for b in bills]


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    # Verify access: own bill or same household
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return _bill_to_response(bill)


@router.get("/{bill_id}/breakdown", response_model=BillBreakdownResponse)
async def get_bill_breakdown_endpoint(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    # Verify access
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if not bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )

    breakdown = await get_bill_breakdown(bill, db)

    return BillBreakdownResponse(
        bill=_bill_to_response(bill),
        total_paid=breakdown["total_paid"],
        total_remaining=breakdown["total_remaining"],
        members=[MemberShareResponse(**m) for m in breakdown["members"]],
    )


@router.post("/{bill_id}/member-payment", response_model=BillBreakdownResponse)
async def create_member_payment(
    bill_id: UUID,
    data: MemberPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    # Verify access
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if not bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )

    # Determine paying member — default to current user
    member_id = data.member_id if data.member_id else current_user.id

    # Validate member is in the same household
    member_result = await db.execute(
        select(User).where(User.id == member_id)
    )
    member = member_result.scalar_one_or_none()
    if not member or member.household_id != bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member is not in the same household as the bill",
        )

    payment = BillMemberPayment(
        bill_id=bill.id,
        member_id=member_id,
        amount_paid=data.amount_paid,
        paid_at=data.paid_at if data.paid_at else datetime.now(timezone.utc),
    )
    db.add(payment)
    await db.flush()

    # Log activity
    try:
        await log_activity(
            household_id=bill.household_id,
            user_id=current_user.id,
            action="paid",
            entity_type="bill",
            entity_name=bill.name or "Untitled",
            details=f"${data.amount_paid} by {member.first_name}",
            db=db,
        )
    except Exception:
        pass

    breakdown = await get_bill_breakdown(bill, db)

    return BillBreakdownResponse(
        bill=_bill_to_response(bill),
        total_paid=breakdown["total_paid"],
        total_remaining=breakdown["total_remaining"],
        members=[MemberShareResponse(**m) for m in breakdown["members"]],
    )


@router.put("/{bill_id}", response_model=BillResponse)
async def update_bill(
    bill_id: UUID,
    data: BillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate assigned_member_id belongs to the same household
    if "assigned_member_id" in update_data and update_data["assigned_member_id"] is not None:
        member_result = await db.execute(
            select(User).where(User.id == update_data["assigned_member_id"])
        )
        member = member_result.scalar_one_or_none()
        if not member or (
            current_user.household_id and member.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned member must belong to the same household",
            )

    for field, value in update_data.items():
        setattr(bill, field, value)

    await db.flush()
    # Re-fetch with eager loading for assigned_member
    result = await db.execute(
        select(Bill).where(Bill.id == bill.id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one()

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="updated",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass

    return _bill_to_response(bill)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill_name = bill.name
    bill.is_active = False
    await db.flush()

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="deleted",
                entity_type="bill",
                entity_name=bill_name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass


@router.patch("/{bill_id}/pay", response_model=BillResponse)
async def pay_bill(
    bill_id: UUID,
    data: BillPayRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
            .options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.is_paid = True
    bill.paid_date = (data.paid_date if data and data.paid_date else datetime.now(timezone.utc))
    bill.paid_amount = (data.paid_amount if data and data.paid_amount else bill.amount)

    await db.flush()
    await db.refresh(bill)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=f"${bill.paid_amount}",
                db=db,
            )
        except Exception:
            pass

    return _bill_to_response(bill)


@router.patch("/{bill_id}/unpay", response_model=BillResponse)
async def unpay_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
            .options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.is_paid = False
    bill.paid_date = None
    bill.paid_amount = None

    await db.flush()
    await db.refresh(bill)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="unpaid",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass

    return _bill_to_response(bill)
