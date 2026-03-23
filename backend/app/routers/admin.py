from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.household import Household
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.admin import (
    AdminStatsResponse,
    AdminToggleRequest,
    AdminUserDetailResponse,
    AdminUserEmailUpdate,
    AdminUserListResponse,
    AdminUserNotesUpdate,
    AdminUserStatusUpdate,
    AdminUserSummary,
    SignupDay,
)
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


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    total = (await db.execute(select(func.count(User.id)))).scalar() or 0

    offset = (page - 1) * per_page
    rows = (
        await db.execute(
            select(User)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    return AdminUserListResponse(
        users=[AdminUserSummary.model_validate(u) for u in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
async def get_admin_user_detail(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/admin", response_model=AdminUserDetailResponse)
async def toggle_admin(
    user_id: UUID,
    body: AdminToggleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Lockout protection: cannot remove the only admin
    if not body.is_admin and user.id == current_user.id:
        admin_count = (
            await db.execute(
                select(func.count(User.id)).where(User.is_admin.is_(True))
            )
        ).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the only admin",
            )

    user.is_admin = body.is_admin
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/status", response_model=AdminUserDetailResponse)
async def update_user_status(
    user_id: UUID,
    body: AdminUserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.account_status = body.account_status
    user.account_status_reason = body.reason
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/notes", response_model=AdminUserDetailResponse)
async def update_user_notes(
    user_id: UUID,
    body: AdminUserNotesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.admin_notes = body.admin_notes
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/email", response_model=AdminUserDetailResponse)
async def update_user_email(
    user_id: UUID,
    body: AdminUserEmailUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check email uniqueness
    existing = await db.execute(
        select(User).where(User.email == body.email, User.id != user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use",
        )

    user.email = body.email
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


