from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paycheck_entry import PaycheckEntry
from app.models.user import User
from app.schemas.paycheck_entry import (
    MonthlyIncomeSummary,
    PaycheckEntryCreate,
    PaycheckEntryResponse,
    PaycheckEntryUpdate,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-entries", tags=["Paycheck Entries"])


@router.post("", response_model=PaycheckEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: PaycheckEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = PaycheckEntry(
        user_id=current_user.id,
        income_source_id=data.income_source_id,
        pay_date=data.pay_date,
        gross_amount=data.gross_amount,
        net_amount=data.net_amount,
        memo=data.memo,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@router.get("", response_model=list[PaycheckEntryResponse])
async def list_entries(
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PaycheckEntry).where(PaycheckEntry.user_id == current_user.id)
    if month and year:
        query = query.where(
            extract("month", PaycheckEntry.pay_date) == month,
            extract("year", PaycheckEntry.pay_date) == year,
        )
    query = query.order_by(PaycheckEntry.pay_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/monthly-summary", response_model=MonthlyIncomeSummary)
async def monthly_summary(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None, ge=2000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    m = month or today.month
    y = year or today.year

    result = await db.execute(
        select(
            func.coalesce(func.sum(PaycheckEntry.net_amount), 0).label("total_net"),
            func.sum(PaycheckEntry.gross_amount).label("total_gross"),
            func.count(PaycheckEntry.id).label("cnt"),
        ).where(
            PaycheckEntry.user_id == current_user.id,
            extract("month", PaycheckEntry.pay_date) == m,
            extract("year", PaycheckEntry.pay_date) == y,
        )
    )
    row = result.one()
    return MonthlyIncomeSummary(
        year=y,
        month=m,
        total_net=row.total_net,
        total_gross=row.total_gross,
        paycheck_count=row.cnt,
    )


@router.get("/{entry_id}", response_model=PaycheckEntryResponse)
async def get_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckEntry).where(
            PaycheckEntry.id == entry_id,
            PaycheckEntry.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paycheck entry not found")
    return entry


@router.put("/{entry_id}", response_model=PaycheckEntryResponse)
async def update_entry(
    entry_id: UUID,
    data: PaycheckEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckEntry).where(
            PaycheckEntry.id == entry_id,
            PaycheckEntry.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paycheck entry not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)

    await db.flush()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckEntry).where(
            PaycheckEntry.id == entry_id,
            PaycheckEntry.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paycheck entry not found")

    await db.delete(entry)
    await db.flush()
