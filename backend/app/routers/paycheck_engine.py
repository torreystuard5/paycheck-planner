from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.paycheck import PaycheckPlan, PaycheckPlanResponse
from app.services.pay_period_planner import build_full_paycheck_plan_response
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-plan", tags=["Paycheck Plan"])


async def _require_budget_id(
    db: AsyncSession,
    user: User,
    budget_id: UUID | None,
) -> UUID:
    resolved = await resolve_budget_id(user, db, budget_id)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active budget is required. Select or create a budget first.",
        )
    await validate_budget_ownership(user, db, resolved)
    return resolved


@router.get("", response_model=PaycheckPlanResponse)
async def get_paycheck_plan(
    periods: int = Query(default=4, ge=1, le=12),
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    plan = await build_full_paycheck_plan_response(
        db, current_user, bid, periods=periods
    )
    return PaycheckPlanResponse(**plan)


@router.get("/{paycheck_date}", response_model=PaycheckPlan)
async def get_single_paycheck(
    paycheck_date: date,
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    plan = await build_full_paycheck_plan_response(db, current_user, bid, periods=12)

    for paycheck in plan.get("paychecks") or []:
        if paycheck["paycheck_date"] == paycheck_date:
            return PaycheckPlan(**paycheck)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No paycheck period found for date {paycheck_date}",
    )
