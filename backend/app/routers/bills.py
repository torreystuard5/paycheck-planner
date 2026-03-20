from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.user import User
from app.schemas.bill import BillCreate, BillResponse, BillUpdate
from app.utils.security import get_current_user

router = APIRouter(prefix="/bills", tags=["Bills"])


@router.post("/", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
async def create_bill(
    data: BillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bill = Bill(
        user_id=current_user.id,
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
    return bill


@router.get("/", response_model=list[BillResponse])
async def list_bills(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Bill).where(Bill.user_id == current_user.id)
    if active_only:
        query = query.where(Bill.is_active.is_(True))
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
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
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

    bill.is_active = False
    await db.flush()
