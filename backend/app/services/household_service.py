import random
import string
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.household import Household
from app.models.user import User


async def generate_invite_code() -> str:
    """Generate random 8-character uppercase alphanumeric code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


async def create_household(name: str, user: User, db: AsyncSession) -> Household:
    """Create household, set user's household_id, log activity."""
    code = await generate_invite_code()
    household = Household(
        name=name,
        created_by=user.id,
        invite_code=code,
    )
    db.add(household)
    await db.flush()

    user.household_id = household.id
    await db.flush()
    await db.refresh(household)

    await log_activity(
        household_id=household.id,
        user_id=user.id,
        action="created",
        entity_type="household",
        entity_name=name,
        details=None,
        db=db,
    )

    return household


async def join_household(invite_code: str, user: User, db: AsyncSession) -> Household:
    """Join household by invite code."""
    result = await db.execute(
        select(Household).where(Household.invite_code == invite_code)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise ValueError("Household not found")

    if user.household_id is not None:
        raise ValueError("User already in a household")

    user.household_id = household.id
    await db.flush()

    await log_activity(
        household_id=household.id,
        user_id=user.id,
        action="joined",
        entity_type="member",
        entity_name=f"{user.first_name} {user.last_name}",
        details=None,
        db=db,
    )

    await db.refresh(household)
    return household


async def leave_household(user: User, db: AsyncSession) -> None:
    """Leave household, delete if empty."""
    household_id = user.household_id
    if not household_id:
        raise ValueError("User is not in a household")

    await log_activity(
        household_id=household_id,
        user_id=user.id,
        action="left",
        entity_type="member",
        entity_name=f"{user.first_name} {user.last_name}",
        details=None,
        db=db,
    )

    user.household_id = None
    await db.flush()

    # Check if household is now empty
    result = await db.execute(
        select(User).where(User.household_id == household_id)
    )
    remaining = result.scalars().all()
    if not remaining:
        hh_result = await db.execute(
            select(Household).where(Household.id == household_id)
        )
        hh = hh_result.scalar_one_or_none()
        if hh:
            await db.delete(hh)
            await db.flush()


async def get_household_members(household_id: UUID, db: AsyncSession) -> list:
    """Return all users in household."""
    result = await db.execute(
        select(User).where(User.household_id == household_id)
    )
    return list(result.scalars().all())


async def log_activity(
    household_id,
    user_id,
    action: str,
    entity_type: str,
    entity_name: str,
    details,
    db: AsyncSession,
) -> None:
    """Insert activity log entry — always try/except so it never blocks."""
    try:
        entry = ActivityLog(
            household_id=household_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_name=entity_name,
            details=details,
        )
        db.add(entry)
        await db.flush()
    except Exception:
        pass


async def get_activity_feed(
    household_id: UUID, limit: int, db: AsyncSession
) -> list:
    """Return latest activities ordered by created_at desc."""
    result = await db.execute(
        select(ActivityLog, User.first_name)
        .join(User, ActivityLog.user_id == User.id)
        .where(ActivityLog.household_id == household_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": row[0].id,
            "user_first_name": row[1],
            "action": row[0].action,
            "entity_type": row[0].entity_type,
            "entity_name": row[0].entity_name,
            "details": row[0].details,
            "created_at": row[0].created_at,
        }
        for row in rows
    ]
