from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.recurring_subscription import RecurringSubscription
from app.models.user import User
from app.schemas.recurring_subscription import (
    RecurringSubscriptionCreate,
    RecurringSubscriptionResponse,
    RecurringSubscriptionUpdate,
)
from app.services.household_service import resolve_valid_household_id
from app.utils.security import get_current_user

router = APIRouter(prefix="/recurring-subscriptions", tags=["Recurring subscriptions"])


def _visible_query(current_user: User):
    if current_user.household_id:
        return select(RecurringSubscription).where(
            or_(
                RecurringSubscription.user_id == current_user.id,
                RecurringSubscription.household_id == current_user.household_id,
            )
        )
    return select(RecurringSubscription).where(RecurringSubscription.user_id == current_user.id)


@router.get("", response_model=list[RecurringSubscriptionResponse])
async def list_recurring(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _visible_query(current_user)
    if active_only:
        q = q.where(RecurringSubscription.is_active.is_(True))
    q = q.order_by(RecurringSubscription.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=RecurringSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    body: RecurringSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = await resolve_valid_household_id(db, current_user)
    row = RecurringSubscription(
        user_id=current_user.id,
        household_id=hid,
        name=body.name,
        amount=body.amount,
        frequency=body.frequency,
        next_billing_date=body.next_billing_date,
        category=body.category,
        notes=body.notes,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.put("/{sub_id}", response_model=RecurringSubscriptionResponse)
async def update_recurring(
    sub_id: UUID,
    body: RecurringSubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_visible_query(current_user).where(RecurringSubscription.id == sub_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    sub_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_visible_query(current_user).where(RecurringSubscription.id == sub_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await db.delete(row)
    await db.flush()
