"""Budget resolution helpers for write-path enforcement."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.user import User


async def resolve_budget_id(
    user: User,
    db: AsyncSession,
    client_budget_id: UUID | None = None,
) -> UUID | None:
    """Resolve which budget_id to assign to a new entity.

    - If client provides a budget_id, validate ownership and return it.
    - Otherwise, use user.current_budget_id.
    - If that's null, fall back to the user's default budget.
    - Returns None only if the user has no budgets at all.
    """
    if client_budget_id is not None:
        result = await db.execute(
            select(Budget.id).where(
                Budget.id == client_budget_id, Budget.user_id == user.id
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Budget not found or not owned by you",
            )
        return client_budget_id

    if user.current_budget_id:
        return user.current_budget_id

    # Fall back to default budget
    result = await db.execute(
        select(Budget.id).where(
            Budget.user_id == user.id, Budget.is_default.is_(True)
        )
    )
    default_id = result.scalar_one_or_none()
    return default_id


async def validate_budget_ownership(
    user: User,
    db: AsyncSession,
    budget_id: UUID,
) -> None:
    """Validate that a budget_id belongs to the user. Raises 403 if not."""
    result = await db.execute(
        select(Budget.id).where(
            Budget.id == budget_id, Budget.user_id == user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Budget not found or not owned by you",
        )
