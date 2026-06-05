import json
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.user import User
from app.schemas.debt import DebtCreate, DebtResponse, DebtUpdate
from app.schemas.debt_calculator import (
    CreditEfficiencyResponse,
    DebtPayoffRequest,
    ExtraPaymentRequest,
    ExtraPaymentSimulation,
    ExtraPercentPaymentRequest,
    ExtraPercentPaymentSimulation,
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
from app.services.debt_calculator import (
    compare_strategies,
    simulate_extra_payment_percents,
    simulate_extra_payments,
)
from app.services.debt_payment_service import (
    create_period_debt_payment,
    dedupe_period_debt_payments,
    fetch_period_debt_payments,
    remove_period_debt_payments,
)
from app.utils.due_dates import next_monthly_due_date
from app.services.household_service import log_activity, resolve_valid_household_id
from app.utils.budget import apply_household_budget_filter, resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/debts", tags=["Debts"])

DEBT_SORT_FIELDS = {"name", "balance", "created_at", "due_date", "apr", "interest_rate"}


async def _debt_to_response(
    debt: Debt, db: AsyncSession, user_id: UUID
) -> DebtResponse:
    resp = DebtResponse.model_validate(debt)
    resp.next_due_date = next_monthly_due_date(debt.due_day)

    today = date.today()
    # Check if ANY household member has paid this debt for the current period.
    # Use scalars().first() instead of scalar_one_or_none() because
    # household members may each have a DebtPayment row for the same
    # (debt_id, period_month, period_year), causing MultipleResultsFound.
    result = await db.execute(
        select(DebtPayment)
        .where(
            DebtPayment.debt_id == debt.id,
            DebtPayment.period_month == today.month,
            DebtPayment.period_year == today.year,
        )
        .limit(1)
    )
    period_payment = result.scalars().first()
    resp.is_paid_this_period = period_payment is not None

    last_result = await db.execute(
        select(DebtPayment)
        .where(DebtPayment.debt_id == debt.id)
        .order_by(DebtPayment.payment_date.desc())
        .limit(1)
    )
    last_payment = last_result.scalars().first()
    resp.last_payment_date = last_payment.payment_date if last_payment else None

    # Compute total paid and percent paid for progress bar
    total_paid_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(DebtPayment.amount), 0))
        .where(DebtPayment.debt_id == debt.id)
    )
    total_paid = Decimal(str(total_paid_result.scalar() or 0))
    resp.total_paid = total_paid
    current_bal = Decimal(str(debt.balance or 0))
    original = total_paid + current_bal
    if current_bal <= 0 and total_paid > 0:
        resp.percent_paid = 100
    elif original > 0:
        resp.percent_paid = int(round(total_paid * 100 / original))
    else:
        resp.percent_paid = 0

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
            "balance": Decimal(str(d.balance or 0)),
            "credit_limit": Decimal(str(d.credit_limit)) if d.credit_limit is not None else None,
            "apr": Decimal(str(d.apr or 0)),
            "minimum_payment": Decimal(str(d.minimum_payment or 0)),
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


@router.post("/simulate-extra-percent", response_model=list[ExtraPercentPaymentSimulation])
async def simulate_extra_percent(
    body: ExtraPercentPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Estimate payoff timeline when paying X% more than minimum on each debt."""
    debt_dicts = await _active_debts_as_dicts(db, current_user)
    if not debt_dicts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active debts found",
        )
    return simulate_extra_payment_percents(debt_dicts, extra_percents=body.extra_percents)


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


# ── Mark Paid / Unmark Paid ───────────────────────────────────────


@router.post("/{debt_id}/mark-paid", response_model=DebtResponse)
async def mark_debt_paid(
    debt_id: UUID,
    amount: Optional[Decimal] = Body(None, embed=True),
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

    today = date.today()
    existing_rows = await fetch_period_debt_payments(
        db, debt_id, month=today.month, year=today.year
    )
    existing_rows = await dedupe_period_debt_payments(db, debt, existing_rows)

    if existing_rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Debt already marked paid for this period",
        )

    # Use caller-supplied amount, fall back to minimum_payment
    pay_amount = amount if amount is not None else Decimal(str(debt.minimum_payment or 0))
    if pay_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payment amount must be greater than zero",
        )
    current_balance = Decimal(str(debt.balance or 0))
    if pay_amount > current_balance and current_balance > 0:
        pay_amount = current_balance
    await create_period_debt_payment(
        db,
        current_user,
        debt,
        pay_amount,
        auto_log_source="debts_page",
        today=today,
    )

    await db.flush()
    await db.refresh(debt)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="debt",
                entity_name=debt.name,
                details=f"${pay_amount}",
                db=db,
            )
        except Exception:
            pass

    return await _debt_to_response(debt, db, current_user.id)


@router.delete("/{debt_id}/unmark-paid", response_model=DebtResponse)
async def unmark_debt_paid(
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

    today = date.today()
    all_payments = await fetch_period_debt_payments(
        db, debt_id, month=today.month, year=today.year
    )
    if not all_payments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No payment found for this period",
        )

    await remove_period_debt_payments(
        db,
        current_user,
        debt,
        all_payments,
        remove_auto_logged=True,
        today=today,
    )
    await db.flush()
    await db.refresh(debt)

    return await _debt_to_response(debt, db, current_user.id)


# ── Standard CRUD (keep /{debt_id} routes AFTER analytical routes) ─


@router.post("", response_model=DebtResponse, status_code=status.HTTP_201_CREATED)
async def create_debt(
    data: DebtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_household_id = await resolve_valid_household_id(db, current_user)
    budget_id = await resolve_budget_id(current_user, db, data.budget_id)
    split_json = None
    if data.split_members is not None:
        split_json = json.dumps([str(m) for m in data.split_members])

    try:
        debt = Debt(
            user_id=current_user.id,
            household_id=effective_household_id,
            name=data.name,
            type=data.type,
            balance=data.balance,
            credit_limit=data.credit_limit,
            apr=data.apr,
            minimum_payment=data.minimum_payment,
            due_day=data.due_day,
            auto_pay=data.auto_pay if data.auto_pay is not None else False,
            reminder_days=data.reminder_days if data.reminder_days is not None else 3,
            is_split=data.is_split if data.is_split is not None else False,
            split_members=split_json,
            budget_id=budget_id,
        )
        db.add(debt)
        await db.flush()
        await db.refresh(debt)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not create debt: {exc}",
        )

    if effective_household_id:
        try:
            await log_activity(
                household_id=effective_household_id,
                user_id=current_user.id,
                action="created",
                entity_type="debt",
                entity_name=debt.name,
                details=f"${debt.balance}",
                db=db,
            )
        except Exception:
            pass

    return await _debt_to_response(debt, db, current_user.id)


@router.get("", response_model=list[DebtResponse])
async def list_debts(
    active_only: bool = True,
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    budget_id: Optional[UUID] = Query(default=None),
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
    query = apply_household_budget_filter(query, Debt, current_user, budget_id)
    if active_only:
        query = query.where(Debt.is_active.is_(True))

    # Apply sorting — fetch all then sort by computed next_due_date for due_date
    if sort_by not in DEBT_SORT_FIELDS:
        sort_by = "created_at"

    if sort_by == "due_date":
        # Sort in Python by computed next_due_date so it's calendar-correct
        result = await db.execute(query.order_by(Debt.created_at.desc()))
        debts = result.scalars().all()
        responses = [await _debt_to_response(d, db, current_user.id) for d in debts]
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
    return [await _debt_to_response(d, db, current_user.id) for d in result.scalars().all()]


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
    return await _debt_to_response(debt, db, current_user.id)


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
    if "budget_id" in update_data and update_data["budget_id"] is not None:
        await validate_budget_ownership(current_user, db, update_data["budget_id"])
    if "split_members" in update_data:
        sm = update_data["split_members"]
        update_data["split_members"] = (
            json.dumps([str(m) for m in sm]) if sm is not None else None
        )
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

    return await _debt_to_response(debt, db, current_user.id)


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


@router.patch("/{debt_id}/postpone", response_model=DebtResponse)
async def postpone_debt(
    debt_id: UUID,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        result = await db.execute(
            select(Debt).where(
                Debt.id == debt_id,
                or_(
                    Debt.user_id == current_user.id,
                    Debt.household_id == current_user.household_id,
                ),
            )
        )
    else:
        result = await db.execute(
            select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
        )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")

    raw = body.get("postpone_until")
    if raw is None:
        debt.postpone_until = None
    else:
        debt.postpone_until = date.fromisoformat(str(raw))
    await db.flush()
    await db.refresh(debt)

    return await _debt_to_response(debt, db, current_user.id)
