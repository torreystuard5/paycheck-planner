from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.budget import Budget
from app.models.debt import Debt
from app.models.income import IncomeSource
from app.models.paycheck_entry import PaycheckEntry
from app.models.paycheck_schedule import PaycheckSchedule
from app.models.savings_goal import SavingsGoal
from app.models.tax_deduction import TaxDeduction
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetResponse, BudgetUpdate
from app.utils.security import get_current_user

router = APIRouter(prefix="/budgets", tags=["Budgets"])


# ── Helpers ──────────────────────────────────────────────────────


async def _get_budget_or_404(
    budget_id: UUID, user_id: UUID, db: AsyncSession
) -> Budget:
    result = await db.execute(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    return budget


async def _count_budget_entities(budget_id: UUID, db: AsyncSession) -> dict[str, int]:
    """Count non-archived entities referencing this budget."""
    counts: dict[str, int] = {}
    for label, model, active_col in [
        ("bills", Bill, Bill.is_active),
        ("debts", Debt, Debt.is_active),
        ("income_sources", IncomeSource, IncomeSource.is_active),
        ("savings_goals", SavingsGoal, SavingsGoal.is_active),
    ]:
        result = await db.execute(
            select(func.count()).select_from(model).where(
                model.budget_id == budget_id, active_col.is_(True)
            )
        )
        c = result.scalar() or 0
        if c > 0:
            counts[label] = c

    for label, model in [
        ("payments", Payment),
        ("paycheck_schedules", PaycheckSchedule),
        ("paycheck_entries", PaycheckEntry),
        ("tax_deductions", TaxDeduction),
    ]:
        result = await db.execute(
            select(func.count()).select_from(model).where(model.budget_id == budget_id)
        )
        c = result.scalar() or 0
        if c > 0:
            counts[label] = c

    return counts


# ── Current budget (before /{id} to avoid route conflict) ────────


@router.get("/current", response_model=BudgetResponse)
async def get_current_budget(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's active budget, falling back to their default budget."""
    budget = None
    if current_user.current_budget_id:
        result = await db.execute(
            select(Budget).where(
                Budget.id == current_user.current_budget_id,
                Budget.user_id == current_user.id,
            )
        )
        budget = result.scalar_one_or_none()

    if not budget:
        result = await db.execute(
            select(Budget).where(
                Budget.user_id == current_user.id, Budget.is_default.is_(True)
            )
        )
        budget = result.scalar_one_or_none()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No budget found"
        )
    return budget


# ── CRUD ─────────────────────────────────────────────────────────


@router.get("", response_model=list[BudgetResponse])
async def list_budgets(
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Budget).where(Budget.user_id == current_user.id)
    if not include_archived:
        query = query.where(Budget.is_archived.is_(False))
    query = query.order_by(Budget.is_default.desc(), Budget.created_at.asc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{budget_id}", response_model=BudgetResponse)
async def get_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_budget_or_404(budget_id, current_user.id, db)


@router.post("", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(
    data: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if user has any budgets — if not, auto-mark as default
    count_result = await db.execute(
        select(func.count()).select_from(Budget).where(Budget.user_id == current_user.id)
    )
    is_first = (count_result.scalar() or 0) == 0

    budget = Budget(
        user_id=current_user.id,
        household_id=data.household_id,
        name=data.name,
        description=data.description,
        color=data.color,
        is_archived=data.is_archived,
        is_default=is_first,
    )
    db.add(budget)
    await db.flush()
    await db.refresh(budget)
    return budget


@router.patch("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: UUID,
    data: BudgetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = await _get_budget_or_404(budget_id, current_user.id, db)

    update_data = data.model_dump(exclude_unset=True)

    # Default budget cannot be archived
    if budget.is_default and update_data.get("is_archived") is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default budget cannot be archived",
        )

    for field, value in update_data.items():
        setattr(budget, field, value)

    await db.flush()
    await db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = await _get_budget_or_404(budget_id, current_user.id, db)

    if budget.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default budget cannot be deleted",
        )

    entity_counts = await _count_budget_entities(budget_id, db)
    if entity_counts:
        total = sum(entity_counts.values())
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Budget has {total} entity(ies) referencing it",
                "entities": entity_counts,
            },
        )

    await db.delete(budget)
    await db.flush()


# ── Set default ──────────────────────────────────────────────────


@router.post("/{budget_id}/set-default", response_model=BudgetResponse)
async def set_default_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = await _get_budget_or_404(budget_id, current_user.id, db)

    if budget.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived budget cannot be set as default",
        )

    if budget.is_default:
        return budget

    # Unset previous default in same transaction
    result = await db.execute(
        select(Budget).where(
            Budget.user_id == current_user.id, Budget.is_default.is_(True)
        )
    )
    old_default = result.scalar_one_or_none()
    if old_default:
        old_default.is_default = False

    budget.is_default = True
    await db.flush()
    await db.refresh(budget)
    return budget


# ── Set active ───────────────────────────────────────────────────


@router.post("/{budget_id}/set-active", response_model=BudgetResponse)
async def set_active_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = await _get_budget_or_404(budget_id, current_user.id, db)

    if budget.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived budget cannot be set as active",
        )

    current_user.current_budget_id = budget.id
    await db.flush()
    await db.refresh(budget)
    return budget
