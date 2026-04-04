from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.savings_goal import SavingsContribution, SavingsGoal
from app.models.user import User
from app.schemas.savings import (
    ContributionCreate,
    ContributionResponse,
    SavingsGoalCreate,
    SavingsGoalResponse,
    SavingsGoalUpdate,
)
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/savings", tags=["Savings"])

SAVINGS_SORT_FIELDS = {"name", "current_amount", "target_amount", "created_at"}


# ── Goals ──────────────────────────────────────────────────────────


@router.post("/goals", response_model=SavingsGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    data: SavingsGoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = SavingsGoal(
        user_id=current_user.id,
        name=data.name,
        target_amount=data.target_amount,
        target_date=data.target_date,
    )
    db.add(goal)
    await db.flush()
    await db.refresh(goal)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="created",
                entity_type="savings_goal",
                entity_name=goal.name,
                details=f"Target: ${goal.target_amount}",
                db=db,
            )
        except Exception:
            pass

    return goal


@router.get("/goals", response_model=list[SavingsGoalResponse])
async def list_goals(
    active_only: bool = True,
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        # Get all household member IDs to show shared goals
        from app.services.household_service import get_household_members
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        query = select(SavingsGoal).where(SavingsGoal.user_id.in_(member_ids))
    else:
        query = select(SavingsGoal).where(SavingsGoal.user_id == current_user.id)
    if active_only:
        query = query.where(SavingsGoal.is_active.is_(True))

    # Apply sorting
    if sort_by not in SAVINGS_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(SavingsGoal, sort_by, SavingsGoal.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/goals/{goal_id}", response_model=SavingsGoalResponse)
async def get_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
    return goal


@router.put("/goals/{goal_id}", response_model=SavingsGoalResponse)
async def update_goal(
    goal_id: UUID,
    data: SavingsGoalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(goal, field, value)

    await db.flush()
    await db.refresh(goal)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="updated",
                entity_type="savings_goal",
                entity_name=goal.name,
                details=None,
                db=db,
            )
        except Exception:
            pass

    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")

    goal_name = goal.name
    goal.is_active = False
    await db.flush()

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="deleted",
                entity_type="savings_goal",
                entity_name=goal_name,
                details=None,
                db=db,
            )
        except Exception:
            pass


# ── Contributions ──────────────────────────────────────────────────


@router.post("/contributions", response_model=ContributionResponse, status_code=status.HTTP_201_CREATED)
async def create_contribution(
    data: ContributionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify the goal belongs to the current user or a household member
    result = await db.execute(
        select(SavingsGoal).where(SavingsGoal.id == data.goal_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
    # Access check: own goal or same household
    if goal.user_id != current_user.id:
        if not current_user.household_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
        from app.services.household_service import get_household_members
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        if goal.user_id not in member_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")

    contribution = SavingsContribution(
        goal_id=data.goal_id,
        amount=data.amount,
        pay_period_date=data.pay_period_date,
    )
    db.add(contribution)

    # Update the goal's current_amount
    goal.current_amount = (goal.current_amount or 0) + data.amount

    await db.flush()
    await db.refresh(contribution)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="created",
                entity_type="savings_contribution",
                entity_name=goal.name,
                details=f"${data.amount}",
                db=db,
            )
        except Exception:
            pass

    return contribution


@router.get("/contributions/{goal_id}", response_model=list[ContributionResponse])
async def list_contributions(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify the goal belongs to the current user or household member
    result = await db.execute(
        select(SavingsGoal).where(SavingsGoal.id == goal_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
    if goal.user_id != current_user.id:
        if not current_user.household_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
        from app.services.household_service import get_household_members
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        if goal.user_id not in member_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")

    result = await db.execute(
        select(SavingsContribution)
        .where(SavingsContribution.goal_id == goal_id)
        .order_by(SavingsContribution.pay_period_date.desc())
    )
    return result.scalars().all()
