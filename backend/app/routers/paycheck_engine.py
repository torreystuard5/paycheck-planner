from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.income import IncomeSource
from app.models.user import User
from app.schemas.paycheck import PaycheckPlan, PaycheckPlanResponse
from app.services.paycheck_engine import build_paycheck_plan, generate_pay_dates, get_pay_period_window
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-plan", tags=["Paycheck Plan"])


async def _fetch_user_data(db: AsyncSession, user: User):
    """Fetch active income sources, bills, and debts for a user."""
    income_result = await db.execute(
        select(IncomeSource)
        .where(IncomeSource.user_id == user.id, IncomeSource.is_active.is_(True))
        .order_by(IncomeSource.created_at)
    )
    income_sources = list(income_result.scalars().all())

    bills_result = await db.execute(
        select(Bill)
        .where(Bill.user_id == user.id, Bill.is_active.is_(True))
    )
    bills = list(bills_result.scalars().all())

    debts_result = await db.execute(
        select(Debt)
        .where(Debt.user_id == user.id, Debt.is_active.is_(True))
    )
    debts = list(debts_result.scalars().all())

    return income_sources, bills, debts


@router.get("/", response_model=PaycheckPlanResponse)
async def get_paycheck_plan(
    periods: int = Query(default=4, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income_sources, bills, debts = await _fetch_user_data(db, current_user)

    plan = build_paycheck_plan(
        user=current_user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=periods,
    )
    return plan


@router.get("/{paycheck_date}", response_model=PaycheckPlan)
async def get_single_paycheck(
    paycheck_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income_sources, bills, debts = await _fetch_user_data(db, current_user)

    # Generate enough periods to find the requested date
    plan = build_paycheck_plan(
        user=current_user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=12,
    )

    for paycheck in plan["paychecks"]:
        if paycheck["paycheck_date"] == paycheck_date:
            return paycheck

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No paycheck period found for date {paycheck_date}",
    )
