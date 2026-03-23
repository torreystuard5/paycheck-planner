import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
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
    """Fetch active income sources, bills, and debts for a user (household-aware).

    For household users, bills are annotated with a `user_share_amount` attribute
    that reflects the user's portion (split bills divided by member count, single
    bills assigned to others excluded).
    """
    income_result = await db.execute(
        select(IncomeSource)
        .where(IncomeSource.user_id == user.id, IncomeSource.is_active.is_(True))
        .order_by(IncomeSource.created_at)
    )
    income_sources = list(income_result.scalars().all())

    if user.household_id:
        from sqlalchemy import or_
        bills_result = await db.execute(
            select(Bill)
            .where(
                or_(
                    Bill.user_id == user.id,
                    Bill.household_id == user.household_id,
                ),
                Bill.is_active.is_(True),
            )
        )
        debts_result = await db.execute(
            select(Debt)
            .where(
                or_(
                    Debt.user_id == user.id,
                    Debt.household_id == user.household_id,
                ),
                Debt.is_active.is_(True),
            )
        )
    else:
        bills_result = await db.execute(
            select(Bill)
            .where(Bill.user_id == user.id, Bill.is_active.is_(True))
        )
        debts_result = await db.execute(
            select(Debt)
            .where(Debt.user_id == user.id, Debt.is_active.is_(True))
        )

    all_bills = list(bills_result.scalars().all())
    debts = list(debts_result.scalars().all())

    # Compute user share for each bill
    member_count = 1
    if user.household_id:
        count_result = await db.execute(
            select(func.count()).select_from(User).where(
                User.household_id == user.household_id
            )
        )
        member_count = max(count_result.scalar() or 1, 1)

    bills = []
    for bill in all_bills:
        is_household = bill.household_id is not None
        amount = Decimal(str(bill.amount or 0))

        if bill.payment_mode == "split" and is_household and member_count > 0:
            share = (amount / member_count).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            bill.user_share_amount = share
            bill.split_member_count = member_count
            bills.append(bill)
        elif bill.payment_mode == "single" and is_household:
            if bill.assigned_member_id:
                is_responsible = bill.assigned_member_id == user.id
            else:
                is_responsible = bill.user_id == user.id
            if is_responsible:
                bill.user_share_amount = amount
                bill.split_member_count = 1
                bills.append(bill)
            # Skip bills assigned to other members
        else:
            bill.user_share_amount = amount
            bill.split_member_count = 1
            bills.append(bill)

    # Compute user share for each debt (split-aware)
    filtered_debts = []
    for debt in debts:
        amount = Decimal(str(debt.minimum_payment or 0))

        if debt.is_split:
            # Determine split count from split_members JSON or household member count
            split_count = 1
            raw_members = debt.split_members
            if raw_members:
                try:
                    parsed = json.loads(raw_members) if isinstance(raw_members, str) else raw_members
                    if isinstance(parsed, list) and len(parsed) > 0:
                        split_count = len(parsed)
                except (json.JSONDecodeError, TypeError):
                    pass
            # Fall back to household member count if no explicit split_members
            if split_count <= 1 and debt.household_id and member_count > 1:
                split_count = member_count

            if split_count > 1:
                share = (amount / split_count).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                debt.user_share_amount = share
                debt.split_member_count = split_count
            else:
                debt.user_share_amount = amount
                debt.split_member_count = 1
        else:
            debt.user_share_amount = amount
            debt.split_member_count = 1

        filtered_debts.append(debt)

    return income_sources, bills, filtered_debts


@router.get("", response_model=PaycheckPlanResponse)
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
