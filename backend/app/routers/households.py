import calendar
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.household import Household
from app.models.household_chore import HouseholdChore
from app.models.user import User
from app.schemas.household import (
    ActivityFeed,
    ActivityItem,
    ChildPermissionsUpdate,
    HouseholdChoreCreate,
    HouseholdChoreListResponse,
    HouseholdChoreOut,
    HouseholdChoreUpdate,
    HouseholdCreate,
    HouseholdJoin,
    HouseholdMember,
    HouseholdResponse,
    MemberRoleUpdate,
    SplitMethodUpdate,
)
from app.services.household_service import (
    create_household,
    get_activity_feed,
    get_household_members,
    join_household,
    leave_household,
)
from app.schemas.household_overview import HouseholdFinancialOverviewResponse
from app.services.household_overview import build_household_financial_overview
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user, require_feature

router = APIRouter(prefix="/households", tags=["Households"])


def _advance_due(d: date | None, recurring: str | None) -> date | None:
    if not recurring:
        return None
    base = d or date.today()
    if recurring == "daily":
        return base + timedelta(days=1)
    if recurring == "weekly":
        return base + timedelta(days=7)
    if recurring == "monthly":
        y, m = base.year, base.month + 1
        if m > 12:
            y, m = y + 1, 1
        last = calendar.monthrange(y, m)[1]
        day = min(base.day, last)
        return date(y, m, day)
    return None


def _is_adult(user: User) -> bool:
    return (user.household_member_role or "adult") == "adult"


async def _get_household_row(db: AsyncSession, current_user: User) -> Household:
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


def _household_response(household: Household, members: list[User]) -> HouseholdResponse:
    return HouseholdResponse(
        id=household.id,
        name=household.name,
        split_method=household.split_method,
        invite_code=household.invite_code,
        created_by=household.created_by,
        created_at=household.created_at,
        members=[HouseholdMember.model_validate(m) for m in members],
    )


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
    return _household_response(household, members)


@router.post("/join", response_model=HouseholdResponse)
async def join_household_endpoint(
    data: HouseholdJoin,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        household = await join_household(data.invite_code, current_user, db)
    except ValueError as e:
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in str(e).lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=str(e))
    members = await get_household_members(household.id, db)
    return _household_response(household, members)


@router.get("/me", response_model=HouseholdResponse)
async def get_my_household(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household_row(db, current_user)
    members = await get_household_members(household.id, db)
    return _household_response(household, members)


@router.get(
    "/financial-overview",
    response_model=HouseholdFinancialOverviewResponse,
    dependencies=[Depends(require_feature("household_overview"))],
)
async def household_financial_overview(
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bid = await resolve_budget_id(current_user, db, budget_id)
    if not bid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active budget is required.",
        )
    await validate_budget_ownership(current_user, db, bid)
    try:
        data = await build_household_financial_overview(db, current_user, bid)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return HouseholdFinancialOverviewResponse(**data)


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
    household = await _get_household_row(db, current_user)
    if household.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household creator can change the split method",
        )

    household.split_method = data.split_method
    await db.flush()
    await db.refresh(household)

    members = await get_household_members(household.id, db)
    return _household_response(household, members)


@router.patch("/members/{member_id}/role", response_model=HouseholdResponse)
async def update_member_role(
    member_id: UUID,
    body: MemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_adult(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adults can manage member roles",
        )
    household = await _get_household_row(db, current_user)
    if member_id == household.created_by and body.member_role == "child":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The household creator must remain an adult",
        )

    mres = await db.execute(
        select(User).where(User.id == member_id, User.household_id == household.id)
    )
    target = mres.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if (target.household_member_role or "adult") == "adult" and body.member_role == "child":
        adult_cnt = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.household_id == household.id,
                    User.household_member_role == "adult",
                )
            )
        ).scalar() or 0
        if adult_cnt < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Household must keep at least one adult member",
            )

    target.household_member_role = body.member_role
    if body.member_role == "adult":
        target.household_child_permissions = None
    await db.flush()

    members = await get_household_members(household.id, db)
    return _household_response(household, members)


@router.patch("/members/{member_id}/permissions", response_model=HouseholdResponse)
async def update_child_permissions(
    member_id: UUID,
    body: ChildPermissionsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_adult(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adults can edit child permissions",
        )
    household = await _get_household_row(db, current_user)
    mres = await db.execute(
        select(User).where(User.id == member_id, User.household_id == household.id)
    )
    target = mres.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if (target.household_member_role or "adult") != "child":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permissions can only be set for child members",
        )

    perms = dict(target.household_child_permissions or {})
    for key in ("can_view_bills", "can_view_amounts", "can_view_invite_code"):
        v = getattr(body, key, None)
        if v is not None:
            perms[key] = v
    target.household_child_permissions = perms or {}
    await db.flush()

    members = await get_household_members(household.id, db)
    return _household_response(household, members)


@router.get("/chores", response_model=HouseholdChoreListResponse)
async def list_household_chores(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household_row(db, current_user)
    q = select(HouseholdChore).where(HouseholdChore.household_id == household.id)
    if status_filter in ("pending", "completed"):
        q = q.where(HouseholdChore.status == status_filter)
    if not _is_adult(current_user):
        q = q.where(HouseholdChore.assigned_to == current_user.id)
    result = await db.execute(
        q.order_by(nulls_last(HouseholdChore.due_date.asc()), HouseholdChore.created_at.desc())
    )
    rows = list(result.scalars().all())
    return HouseholdChoreListResponse(
        items=[HouseholdChoreOut.model_validate(r) for r in rows]
    )


@router.post("/chores", response_model=HouseholdChoreOut, status_code=status.HTTP_201_CREATED)
async def create_household_chore(
    data: HouseholdChoreCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_adult(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adults can manage chores",
        )
    household = await _get_household_row(db, current_user)
    if data.assigned_to:
        ures = await db.execute(
            select(User.id).where(
                User.id == data.assigned_to,
                User.household_id == household.id,
            )
        )
        if ures.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must be a household member",
            )

    chore = HouseholdChore(
        household_id=household.id,
        title=data.title,
        description=data.description,
        assigned_to=data.assigned_to,
        due_date=data.due_date,
        recurring=data.recurring,
        created_by=current_user.id,
        status="pending",
    )
    db.add(chore)
    await db.flush()
    await db.refresh(chore)
    return HouseholdChoreOut.model_validate(chore)


@router.patch("/chores/{chore_id}", response_model=HouseholdChoreOut)
async def update_household_chore(
    chore_id: UUID,
    data: HouseholdChoreUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _get_household_row(db, current_user)
    res = await db.execute(
        select(HouseholdChore).where(
            HouseholdChore.id == chore_id,
            HouseholdChore.household_id == household.id,
        )
    )
    chore = res.scalar_one_or_none()
    if not chore:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chore not found")

    patch = data.model_dump(exclude_unset=True)
    is_adult = _is_adult(current_user)
    child_self_complete = (
        not is_adult
        and chore.assigned_to == current_user.id
        and set(patch.keys()) <= {"status"}
        and patch.get("status") == "completed"
    )
    if not is_adult and not child_self_complete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adults can edit chores",
        )

    if patch.get("assigned_to") and is_adult:
        ures = await db.execute(
            select(User.id).where(
                User.id == patch["assigned_to"],
                User.household_id == household.id,
            )
        )
        if ures.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must be a household member",
            )

    prev_status = chore.status
    prev_recurring = chore.recurring
    prev_due = chore.due_date

    for field, value in patch.items():
        setattr(chore, field, value)

    if patch.get("status") == "completed" and prev_status != "completed":
        chore.completed_at = datetime.now(timezone.utc)
        if prev_recurring:
            next_due = _advance_due(prev_due, prev_recurring)
            db.add(
                HouseholdChore(
                    household_id=household.id,
                    title=chore.title,
                    description=chore.description,
                    assigned_to=chore.assigned_to,
                    due_date=next_due,
                    recurring=prev_recurring,
                    created_by=current_user.id,
                    status="pending",
                )
            )

    await db.flush()
    await db.refresh(chore)
    return HouseholdChoreOut.model_validate(chore)


@router.delete("/chores/{chore_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_household_chore(
    chore_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_adult(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adults can delete chores",
        )
    household = await _get_household_row(db, current_user)
    res = await db.execute(
        select(HouseholdChore).where(
            HouseholdChore.id == chore_id,
            HouseholdChore.household_id == household.id,
        )
    )
    chore = res.scalar_one_or_none()
    if not chore:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chore not found")
    await db.delete(chore)
    await db.flush()


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
