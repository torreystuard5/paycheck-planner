from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.household import (
    ActivityFeed,
    ActivityItem,
    HouseholdCreate,
    HouseholdJoin,
    HouseholdMember,
    HouseholdResponse,
    SplitMethodUpdate,
)
from app.services.household_service import (
    create_household,
    get_activity_feed,
    get_household_members,
    join_household,
    leave_household,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/households", tags=["Households"])


@router.post("", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
async def create_household_endpoint(
    data: HouseholdCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already in a household. Leave first.",
        )
    household = await create_household(data.name, current_user, db)
    members = await get_household_members(household.id, db)
    return HouseholdResponse(
        id=household.id,
        name=household.name,
        split_method=household.split_method,
        invite_code=household.invite_code,
        created_by=household.created_by,
        created_at=household.created_at,
        members=[HouseholdMember.model_validate(m) for m in members],
    )


@router.post("/join", response_model=HouseholdResponse)
async def join_household_endpoint(
    data: HouseholdJoin,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        household = await join_household(data.invite_code, current_user, db)
    except ValueError as e:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(e))
    members = await get_household_members(household.id, db)
    return HouseholdResponse(
        id=household.id,
        name=household.name,
        split_method=household.split_method,
        invite_code=household.invite_code,
        created_by=household.created_by,
        created_at=household.created_at,
        members=[HouseholdMember.model_validate(m) for m in members],
    )


@router.get("/me", response_model=HouseholdResponse)
async def get_my_household(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not in a household",
        )
    from sqlalchemy import select
    from app.models.household import Household

    result = await db.execute(
        select(Household).where(Household.id == current_user.household_id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found",
        )
    members = await get_household_members(household.id, db)
    return HouseholdResponse(
        id=household.id,
        name=household.name,
        split_method=household.split_method,
        invite_code=household.invite_code,
        created_by=household.created_by,
        created_at=household.created_at,
        members=[HouseholdMember.model_validate(m) for m in members],
    )


@router.post("/leave", status_code=status.HTTP_200_OK)
async def leave_household_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await leave_household(current_user, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {"detail": "Left household"}


@router.put("/split-method", response_model=HouseholdResponse)
async def update_split_method(
    data: SplitMethodUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not in a household",
        )
    from sqlalchemy import select
    from app.models.household import Household

    result = await db.execute(
        select(Household).where(Household.id == current_user.household_id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found",
        )
    if household.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household creator can change the split method",
        )

    household.split_method = data.split_method
    await db.flush()
    await db.refresh(household)

    members = await get_household_members(household.id, db)
    return HouseholdResponse(
        id=household.id,
        name=household.name,
        split_method=household.split_method,
        invite_code=household.invite_code,
        created_by=household.created_by,
        created_at=household.created_at,
        members=[HouseholdMember.model_validate(m) for m in members],
    )


@router.get("/activity", response_model=ActivityFeed)
async def get_activity(
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not in a household",
        )
    items = await get_activity_feed(current_user.household_id, limit, db)
    return ActivityFeed(activities=[ActivityItem(**i) for i in items])
