from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.user import User
from app.schemas.bill import BillCreate, BillPayRequest, BillResponse, BillUpdate
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/bills", tags=["Bills"])


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
    )
    db.add(bill)
    await db.flush()
    await db.refresh(bill)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="created",
                entity_type="bill",
                entity_name=bill.name,
                details=f"${bill.amount}",
                db=db,
            )
        except Exception:
            pass

    return bill


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
    query = query.order_by(Bill.due_day)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    # Verify access: own bill or same household
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


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
    for field, value in update_data.items():
        setattr(bill, field, value)

    await db.flush()
    await db.refresh(bill)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="updated",
                entity_type="bill",
                entity_name=bill.name,
                details=None,
                db=db,
            )
        except Exception:
            pass

    return bill


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
                entity_name=bill_name,
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
                entity_name=bill.name,
                details=f"${bill.paid_amount}",
                db=db,
            )
        except Exception:
            pass

    return bill


@router.patch("/{bill_id}/unpay", response_model=BillResponse)
async def unpay_bill(
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
                entity_name=bill.name,
                details=None,
                db=db,
            )
        except Exception:
            pass

    return bill
