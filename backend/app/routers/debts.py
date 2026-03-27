import json
from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.debt import Debt
from app.models.user import User
from app.schemas.debt import DebtCreate, DebtResponse, DebtUpdate
from app.schemas.debt_calculator import (
    CreditEfficiencyResponse,
    DebtPayoffRequest,
    ExtraPaymentRequest,
    ExtraPaymentSimulation,
    InterestProjection,
    PaydownRecommendation,
    PaydownRecommendRequest,
    StrategyComparison,
)
from app.services.credit_efficiency import (
    calculate_utilization,
    project_interest_over_time,
    recommend_paydown_priority,
)
from app.services.debt_calculator import compare_strategies, simulate_extra_payments
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/debts", tags=["Debts"])

DEBT_SORT_FIELDS = {"name", "balance", "created_at", "due_date", "apr", "interest_rate"}


def _compute_debt_next_due_date(due_day: int | None) -> date | None:
    """Return the next upcoming due date for a monthly due_day."""
    if not due_day:
        return None
    today = date.today()
    _, max_day = monthrange(today.year, today.month)
    clamped = min(due_day, max_day)
    candidate = today.replace(day=clamped)
    if candidate >= today:
        return candidate
    # Roll to next month
    if today.month == 12:
        y, m = today.year + 1, 1
    else:
        y, m = today.year, today.month + 1
    _, max_day = monthrange(y, m)
    return date(y, m, min(due_day, max_day))


def _debt_to_response(debt: Debt) -> DebtResponse:
    resp = DebtResponse.model_validate(debt)
    resp.next_due_date = _compute_debt_next_due_date(debt.due_day)
    return resp


# ── Helper ─────────────────────────────────────────────────────────


async def _active_debts_as_dicts(db: AsyncSession, user: User) -> list[dict]:
    """Fetch all active debts for a user and return as plain dicts."""
    result = await db.execute(
        select(Debt).where(Debt.user_id == user.id, Debt.is_active.is_(True))
    )
    debts = result.scalars().all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "type": d.type,
            "balance": Decimal(str(d.balance)),
            "credit_limit": Decimal(str(d.credit_limit)) if d.credit_limit is not None else None,
            "apr": Decimal(str(d.apr)),
            "minimum_payment": Decimal(str(d.minimum_payment)),
        }
        for d in debts
    ]


# ── Analytical endpoints (defined BEFORE /{debt_id} to avoid route conflict) ──


@router.post("/compare-strategies", response_model=StrategyComparison)
async def compare_debt_strategies(
    body: DebtPayoffRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    if not debt_dicts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active debts found",
        )
    result = compare_strategies(debt_dicts, extra_payment=body.extra_payment)
    return result


@router.post("/simulate-extra", response_model=list[ExtraPaymentSimulation])
async def simulate_extra(
    body: ExtraPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    if not debt_dicts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active debts found",
        )
    return simulate_extra_payments(debt_dicts, extra_amounts=body.extra_amounts)


@router.get("/credit-efficiency", response_model=CreditEfficiencyResponse)
async def get_credit_efficiency(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    return calculate_utilization(debt_dicts)


@router.post("/credit-efficiency/recommend", response_model=list[PaydownRecommendation])
async def recommend_paydown(
    body: PaydownRecommendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    return recommend_paydown_priority(debt_dicts, available_amount=body.available_amount)


@router.get("/interest-projection", response_model=list[InterestProjection])
async def get_interest_projection(
    months: int = Query(default=12, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    return project_interest_over_time(debt_dicts, months=months)


# ── Standard CRUD (keep /{debt_id} routes AFTER analytical routes) ─


@router.post("", response_model=DebtResponse, status_code=status.HTTP_201_CREATED)
async def create_debt(
    data: DebtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    debt = Debt(
        user_id=current_user.id,
        household_id=current_user.household_id,
        name=data.name,
        type=data.type,
        balance=data.balance,
        credit_limit=data.credit_limit,
        apr=data.apr,
        minimum_payment=data.minimum_payment,
        due_day=data.due_day,
        auto_pay=data.auto_pay,
        reminder_days=data.reminder_days,
        is_split=data.is_split if data.is_split is not None else False,
        split_members=json.dumps(data.split_members) if data.split_members is not None else None,
    )
    db.add(debt)
    await db.flush()
    await db.refresh(debt)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="created",
                entity_type="debt",
                entity_name=debt.name,
                details=f"${debt.balance}",
                db=db,
            )
        except Exception:
            pass

    return _debt_to_response(debt)


@router.get("", response_model=list[DebtResponse])
async def list_debts(
    active_only: bool = True,
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        query = select(Debt).where(
            or_(
                Debt.user_id == current_user.id,
                Debt.household_id == current_user.household_id,
            )
        )
    else:
        query = select(Debt).where(Debt.user_id == current_user.id)
    if active_only:
        query = query.where(Debt.is_active.is_(True))

    # Apply sorting — fetch all then sort by computed next_due_date for due_date
    if sort_by not in DEBT_SORT_FIELDS:
        sort_by = "created_at"

    if sort_by == "due_date":
        # Sort in Python by computed next_due_date so it's calendar-correct
        result = await db.execute(query.order_by(Debt.created_at.desc()))
        debts = result.scalars().all()
        responses = [_debt_to_response(d) for d in debts]
        far_future = date(9999, 12, 31)
        responses.sort(
            key=lambda r: r.next_due_date or far_future,
            reverse=(sort_order == "desc"),
        )
        return responses

    col_map = {"interest_rate": "apr"}
    sort_col = getattr(Debt, col_map.get(sort_by, sort_by), Debt.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())
    result = await db.execute(query)
    return [_debt_to_response(d) for d in result.scalars().all()]


@router.get("/{debt_id}", response_model=DebtResponse)
async def get_debt(
    debt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    if debt.user_id != current_user.id and (
        not current_user.household_id or debt.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    return _debt_to_response(debt)


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
    if "split_members" in update_data:
        update_data["split_members"] = json.dumps(update_data["split_members"]) if update_data["split_members"] is not None else None
    for field, value in update_data.items():
        setattr(debt, field, value)

    await db.flush()
    await db.refresh(debt)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="updated",
                entity_type="debt",
                entity_name=debt.name,
                details=None,
                db=db,
            )
        except Exception:
            pass

    return _debt_to_response(debt)


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

    debt_name = debt.name
    debt.is_active = False
    await db.flush()

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="deleted",
                entity_type="debt",
                entity_name=debt_name,
                details=None,
                db=db,
            )
        except Exception:
            pass
