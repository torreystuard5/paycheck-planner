from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.pay_period import (
    PayPeriodItemOverrideOut,
    PayPeriodPullForwardCreate,
    PayPeriodRevertPullForwardRequest,
    PayPeriodSummaryResponse,
    PayPeriodViewResponse,
)
from app.schemas.paycheck import PaycheckPlanResponse
from app.services.pay_period_planner import (
    build_full_paycheck_plan_response,
    build_period_view,
    get_period_summary,
    pull_forward,
    revert_pull_forward,
)
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/pay-periods", tags=["Pay Periods"])


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


@router.get("/summary", response_model=PayPeriodSummaryResponse)
async def pay_period_summary(
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    data = await get_period_summary(db, current_user, bid)
    return PayPeriodSummaryResponse(**data)


@router.get("/current", response_model=PayPeriodViewResponse)
async def pay_period_current(
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    data = await build_period_view(db, current_user, bid, "current")
    return PayPeriodViewResponse(**data)


@router.get("/next", response_model=PayPeriodViewResponse)
async def pay_period_next(
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, budget_id)
    data = await build_period_view(db, current_user, bid, "next")
    return PayPeriodViewResponse(**data)


@router.post("/pull-forward", response_model=PayPeriodItemOverrideOut)
async def pay_period_pull_forward(
    body: PayPeriodPullForwardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, body.budget_id)
    row = await pull_forward(
        db,
        current_user,
        bid,
        body.item_type,
        body.item_id,
        body.occurrence_due_date,
    )
    return PayPeriodItemOverrideOut.from_orm_row(row)


@router.post("/revert-pull-forward", response_model=PayPeriodItemOverrideOut)
async def pay_period_revert_pull_forward(
    body: PayPeriodRevertPullForwardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await _require_budget_id(db, current_user, body.budget_id)
    row = await revert_pull_forward(
        db,
        current_user,
        bid,
        body.item_type,
        body.item_id,
        body.occurrence_due_date,
    )
    return PayPeriodItemOverrideOut.from_orm_row(row)
