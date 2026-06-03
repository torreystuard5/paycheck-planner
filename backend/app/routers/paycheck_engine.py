from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.pay_period import PayPeriodItemOverrideOut, PayPeriodPullForwardCreate
from app.schemas.paycheck import PaycheckPlan, PaycheckPlanResponse, PaycheckUpcomingResponse
from app.services.pay_period_planner import (
    build_full_paycheck_plan_response,
    build_upcoming_paycheck_response,
    pull_forward,
    revert_pull_forward_by_id,
)
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

# Paycheck plan reads/writes use pay_period_planner + pay_period_item_overrides (migration 045).
# POST/DELETE /overrides here are aliases of /pay-periods/pull-forward and revert endpoints.
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


@router.get("/upcoming", response_model=PaycheckUpcomingResponse)
async def get_upcoming_paychecks(
    upcoming: int = Query(default=3, ge=1, le=6),
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    data = await build_upcoming_paycheck_response(db, current_user, bid, upcoming_count=upcoming)
    return PaycheckUpcomingResponse(
        budget_id=bid,
        pay_frequency=data.get("pay_frequency"),
        currency=data.get("currency"),
        current=PaycheckPlan(**data["current"]) if data.get("current") else None,
        upcoming=[PaycheckPlan(**p) for p in data.get("upcoming") or []],
    )


@router.post("/overrides", response_model=PayPeriodItemOverrideOut)
async def create_paycheck_override(
    body: PayPeriodPullForwardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, body.budget_id)
    if body.target_pay_period_start is not None:
        from app.services.pay_period_planner import build_pay_calendar_context

        ctx = await build_pay_calendar_context(db, current_user, bid)
        if body.target_pay_period_start != ctx["current_start"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_pay_period_start must match the current pay period.",
            )
    row = await pull_forward(
        db,
        current_user,
        bid,
        body.item_type,
        body.item_id,
        body.occurrence_due_date,
    )
    return PayPeriodItemOverrideOut.from_orm_row(row)


@router.delete("/overrides/{override_id}", response_model=PayPeriodItemOverrideOut)
async def delete_paycheck_override(
    override_id: UUID,
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    row = await revert_pull_forward_by_id(db, current_user, bid, override_id)
    return PayPeriodItemOverrideOut.from_orm_row(row)


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
