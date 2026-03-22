from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.household import Household
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.admin import AdminStatsResponse, SignupDay
from app.utils.security import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    now = func.now()
    thirty_days_ago = now - timedelta(days=30)
    seven_days_ago = date.today() - timedelta(days=7)

    # Total users
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # Active users in last 30 days (using updated_at as proxy for activity)
    active_users = (
        await db.execute(
            select(func.count(User.id)).where(User.updated_at >= thirty_days_ago)
        )
    ).scalar() or 0

    # Pro subscribers (is_supporter = true)
    pro_subscribers = (
        await db.execute(
            select(func.count(User.id)).where(User.is_supporter.is_(True))
        )
    ).scalar() or 0

    # Free users
    free_users = total_users - pro_subscribers

    # Total households
    total_households = (
        await db.execute(select(func.count(Household.id)))
    ).scalar() or 0

    # Total support tickets
    total_tickets = (
        await db.execute(select(func.count(SupportTicket.id)))
    ).scalar() or 0

    # Signups last 7 days
    signup_rows = (
        await db.execute(
            select(
                cast(User.created_at, Date).label("signup_date"),
                func.count(User.id).label("cnt"),
            )
            .where(cast(User.created_at, Date) >= seven_days_ago)
            .group_by(cast(User.created_at, Date))
            .order_by(cast(User.created_at, Date))
        )
    ).all()

    # Build a full 7-day list (fill in zeros for days with no signups)
    signup_map = {row.signup_date: row.cnt for row in signup_rows}
    signups_last_7_days = []
    for i in range(7):
        d = seven_days_ago + timedelta(days=i)
        signups_last_7_days.append(SignupDay(date=d, count=signup_map.get(d, 0)))

    return AdminStatsResponse(
        total_users=total_users,
        total_active_users_30d=active_users,
        total_pro_subscribers=pro_subscribers,
        total_free_users=free_users,
        total_households=total_households,
        total_support_tickets=total_tickets,
        signups_last_7_days=signups_last_7_days,
    )
