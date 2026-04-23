from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.income import IncomeSource
from app.models.user import User
from app.schemas.income import IncomeCreate, IncomeResponse, IncomeUpdate
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/income", tags=["Income Sources"])

INCOME_SORT_FIELDS = {"source", "amount", "pay_date", "created_at"}


@router.post("", response_model=IncomeResponse, status_code=status.HTTP_201_CREATED)
async def create_income(
    data: IncomeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget_id = await resolve_budget_id(current_user, db, data.budget_id)
    income = IncomeSource(
        user_id=current_user.id,
        name=data.name,
        amount=data.amount,
        frequency=data.frequency,
        next_pay_date=data.next_pay_date,
        budget_id=budget_id,
    )
    db.add(income)
    await db.flush()
    await db.refresh(income)
    return income


@router.get("", response_model=list[IncomeResponse])
async def list_income(
    active_only: bool = True,
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    budget_id: Optional[UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(IncomeSource).where(IncomeSource.user_id == current_user.id)
    if budget_id is not None:
        query = query.where(IncomeSource.budget_id == budget_id)
    if active_only:
        query = query.where(IncomeSource.is_active.is_(True))

    # Apply sorting
    if sort_by not in INCOME_SORT_FIELDS:
        sort_by = "created_at"
    col_map = {"source": "name", "pay_date": "next_pay_date"}
    sort_col = getattr(IncomeSource, col_map.get(sort_by, sort_by), IncomeSource.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{income_id}", response_model=IncomeResponse)
async def get_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")
    return income


@router.put("/{income_id}", response_model=IncomeResponse)
async def update_income(
    income_id: UUID,
    data: IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")

    update_data = data.model_dump(exclude_unset=True)
    if "budget_id" in update_data and update_data["budget_id"] is not None:
        await validate_budget_ownership(current_user, db, update_data["budget_id"])
    for field, value in update_data.items():
        setattr(income, field, value)

    await db.flush()
    await db.refresh(income)
    return income


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")

    income.is_active = False
    await db.flush()
