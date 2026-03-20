from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.debt import Debt
from app.models.user import User
from app.schemas.debt import DebtCreate, DebtResponse, DebtUpdate
from app.utils.security import get_current_user

router = APIRouter(prefix="/debts", tags=["Debts"])


@router.post("/", response_model=DebtResponse, status_code=status.HTTP_201_CREATED)
async def create_debt(
    data: DebtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt = Debt(
        user_id=current_user.id,
        name=data.name,
        type=data.type,
        balance=data.balance,
        credit_limit=data.credit_limit,
        apr=data.apr,
        minimum_payment=data.minimum_payment,
        due_day=data.due_day,
        auto_pay=data.auto_pay,
        reminder_days=data.reminder_days,
    )
    db.add(debt)
    await db.flush()
    await db.refresh(debt)
    return debt


@router.get("/", response_model=list[DebtResponse])
async def list_debts(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Debt).where(Debt.user_id == current_user.id)
    if active_only:
        query = query.where(Debt.is_active.is_(True))
    query = query.order_by(Debt.due_day)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{debt_id}", response_model=DebtResponse)
async def get_debt(
    debt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    return debt


@router.put("/{debt_id}", response_model=DebtResponse)
async def update_debt(
    debt_id: UUID,
    data: DebtUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(debt, field, value)

    await db.flush()
    await db.refresh(debt)
    return debt


@router.delete("/{debt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_debt(
    debt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")

    debt.is_active = False
    await db.flush()
