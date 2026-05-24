from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.household import Household
from app.models.shopping_list_item import ShoppingListItem
from app.models.user import User
from app.schemas.shopping_list import (
    ShoppingListItemCreate,
    ShoppingListItemOut,
    ShoppingListItemUpdate,
    ShoppingListResponse,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/households/shopping-list", tags=["Shopping List"])


async def _get_household(db: AsyncSession, current_user: User) -> Household:
    if not current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not in a household",
        )
    result = await db.execute(
        select(Household).where(Household.id == current_user.household_id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found",
        )
    return household


@router.get("", response_model=ShoppingListResponse)
async def list_shopping_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household(db, current_user)
    result = await db.execute(
        select(ShoppingListItem)
        .where(ShoppingListItem.household_id == household.id)
        .order_by(
            ShoppingListItem.is_completed.asc(),
            ShoppingListItem.created_at.desc(),
        )
    )
    rows = list(result.scalars().all())
    return ShoppingListResponse(
        items=[ShoppingListItemOut.model_validate(r) for r in rows]
    )


@router.post("", response_model=ShoppingListItemOut, status_code=status.HTTP_201_CREATED)
async def create_shopping_item(
    data: ShoppingListItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household(db, current_user)
    item = ShoppingListItem(
        household_id=household.id,
        item_name=data.item_name,
        quantity=data.quantity,
        category=data.category,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return ShoppingListItemOut.model_validate(item)


@router.patch("/{item_id}", response_model=ShoppingListItemOut)
async def update_shopping_item(
    item_id: UUID,
    data: ShoppingListItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household(db, current_user)
    result = await db.execute(
        select(ShoppingListItem).where(
            ShoppingListItem.id == item_id,
            ShoppingListItem.household_id == household.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping list item not found",
        )
    patch = data.model_dump(exclude_unset=True)
    for field, value in patch.items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return ShoppingListItemOut.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopping_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household(db, current_user)
    result = await db.execute(
        select(ShoppingListItem).where(
            ShoppingListItem.id == item_id,
            ShoppingListItem.household_id == household.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping list item not found",
        )
    await db.delete(item)
    await db.flush()
