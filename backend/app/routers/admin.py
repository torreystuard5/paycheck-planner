import json
import logging
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.announcement import Announcement
from app.models.app_update import AppUpdate
from app.models.broadcast import Broadcast
from app.models.coming_soon import ComingSoon
from app.models.household import Household
from app.models.support_ticket import SupportTicket
from app.models.system_setting import SystemSetting
from app.models.user import User

logger = logging.getLogger(__name__)
from app.schemas.admin import (
    AdminHouseholdListResponse,
    AdminHouseholdSummary,
    AdminStatsResponse,
    AdminToggleRequest,
    AdminUserDetailResponse,
    AdminUserEmailUpdate,
    AdminUserListResponse,
    AdminUserNotesUpdate,
    AdminUserStatusUpdate,
    AdminUserSummary,
    AdminUserUpdate,
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementUpdate,
    AuditLogListResponse,
    AuditLogOut,
    SignupDay,
    SystemSettingOut,
    SystemSettingUpdate,
)
from app.schemas.updates import (
    AppUpdateCreate,
    AppUpdateOut,
    AppUpdateUpdate,
    ComingSoonCreate,
    ComingSoonOut,
    ComingSoonUpdate,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])

USER_SORT_FIELDS = {"email", "created_at", "last_login", "is_admin"}


# ── Helpers ────────────────────────────────────────────────────────


def log_admin_action(
    db: AsyncSession,
    admin_id: UUID,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: str | None = None,
    ip_address: str | None = None,
):
    log = AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=details,
        ip_address=ip_address,
    )
    db.add(log)


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ── Stats ──────────────────────────────────────────────────────────


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

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    active_users = (
        await db.execute(
            select(func.count(User.id)).where(
                func.coalesce(User.last_login_at, User.updated_at) >= thirty_days_ago
            )
        )
    ).scalar() or 0

    pro_subscribers = (
        await db.execute(
            select(func.count(User.id)).where(User.is_supporter.is_(True))
        )
    ).scalar() or 0

    free_users = total_users - pro_subscribers

    total_households = (
        await db.execute(select(func.count(Household.id)))
    ).scalar() or 0

    total_tickets = (
        await db.execute(select(func.count(SupportTicket.id)))
    ).scalar() or 0

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


# ── Command Center access log ─────────────────────────────────────


@router.post("/log-access")
async def log_command_center_access(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="accessed_command_center",
        ip_address=_get_client_ip(request),
    )
    return {"detail": "ok"}


# ── Users ──────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    filter: str | None = Query(None, pattern="^(all|pro|free|active_30d)$"),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    now_ts = func.now()
    thirty_days_ago_ts = now_ts - timedelta(days=30)

    # Build base query with optional filter
    base_where = []
    if filter == "pro":
        base_where.append(User.is_supporter.is_(True))
    elif filter == "free":
        base_where.append(User.is_supporter.is_(False))
    elif filter == "active_30d":
        base_where.append(
            func.coalesce(User.last_login_at, User.updated_at) >= thirty_days_ago_ts
        )
    # filter == "all" or None → no extra where clause

    if search:
        term = f"%{search}%"
        base_where.append(
            (User.email.ilike(term))
            | (User.first_name.ilike(term))
            | (User.last_name.ilike(term))
        )

    count_q = select(func.count(User.id))
    for cond in base_where:
        count_q = count_q.where(cond)
    total = (await db.execute(count_q)).scalar() or 0

    # Apply sorting
    if sort_by not in USER_SORT_FIELDS:
        sort_by = "created_at"
    col_map = {"last_login": "last_login_at"}
    sort_col = getattr(User, col_map.get(sort_by, sort_by), User.created_at)
    order = sort_col.desc() if sort_order == "desc" else sort_col.asc()

    offset = (page - 1) * per_page
    q = select(User)
    for cond in base_where:
        q = q.where(cond)
    rows = (
        await db.execute(
            q.order_by(order)
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    users_out = []
    for u in rows:
        # Compute dynamic status
        if not u.is_active or getattr(u, "account_status", "active") == "closed":
            computed_status = "Closed"
            locked = True
        elif u.last_login_at is None:
            computed_status = "Inactive"
            locked = False
        else:
            # Ensure tz-aware comparison
            login = u.last_login_at
            if login.tzinfo is None:
                login = login.replace(tzinfo=timezone.utc)
            computed_status = "Inactive" if login < seven_days_ago else "Active"
            locked = False

        summary = AdminUserSummary.model_validate(u)
        summary.status = computed_status
        summary.admin_locked = locked
        users_out.append(summary)

    return AdminUserListResponse(
        users=users_out,
        total=total,
        page=page,
        per_page=per_page,
    )


# ── Households ─────────────────────────────────────────────────────


@router.get("/households", response_model=AdminHouseholdListResponse)
async def list_admin_households(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    base_q = select(Household)
    count_q = select(func.count(Household.id))

    if search:
        term = f"%{search}%"
        base_q = base_q.where(Household.name.ilike(term) | Household.invite_code.ilike(term))
        count_q = count_q.where(Household.name.ilike(term) | Household.invite_code.ilike(term))

    total = (await db.execute(count_q)).scalar() or 0
    offset = (page - 1) * per_page

    rows = (
        await db.execute(
            base_q.order_by(Household.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    # Batch-fetch member counts
    hh_ids = [h.id for h in rows]
    member_counts = {}
    if hh_ids:
        mc_rows = (
            await db.execute(
                select(User.household_id, func.count(User.id))
                .where(User.household_id.in_(hh_ids))
                .group_by(User.household_id)
            )
        ).all()
        member_counts = {r[0]: r[1] for r in mc_rows}

    items = []
    for h in rows:
        s = AdminHouseholdSummary.model_validate(h)
        s.member_count = member_counts.get(h.id, 0)
        items.append(s)

    return AdminHouseholdListResponse(
        households=items,
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


@router.put("/users/{user_id}", response_model=AdminUserDetailResponse)
async def update_admin_user(
    user_id: UUID,
    body: AdminUserUpdate,
    request: Request,
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

    if body.is_active is not None:
        old_active = user.is_active
        user.is_active = body.is_active
        action = "enabled_user" if body.is_active else "disabled_user"
        log_admin_action(
            db,
            admin_id=current_user.id,
            action=action,
            target_type="user",
            target_id=str(user_id),
            details=json.dumps({"old_is_active": old_active, "new_is_active": body.is_active}),
            ip_address=_get_client_ip(request),
        )

    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/admin", response_model=AdminUserDetailResponse)
async def toggle_admin(
    user_id: UUID,
    body: AdminToggleRequest,
    request: Request,
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
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="toggled_admin",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"is_admin": body.is_admin}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


@router.patch("/users/{user_id}/status", response_model=AdminUserDetailResponse)
async def update_user_status(
    user_id: UUID,
    body: AdminUserStatusUpdate,
    request: Request,
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
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_user_status",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"account_status": body.account_status, "reason": body.reason}),
        ip_address=_get_client_ip(request),
    )
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
    request: Request,
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

    existing = await db.execute(
        select(User).where(User.email == body.email, User.id != user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use",
        )

    old_email = user.email
    user.email = body.email
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_user_email",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"old_email": old_email, "new_email": body.email}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(user)
    return AdminUserDetailResponse.model_validate(user)


# ── Password Reset (Admin-initiated) ──────────────────────────────


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: UUID,
    request: Request,
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

    # Generate reset token and set must_reset_password
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    user.must_reset_password = True

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="initiated_password_reset",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"email": user.email}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    # Send reset email (import here to avoid circular imports)
    from app.services.email_service import send_password_reset_email

    await send_password_reset_email(
        to_email=user.email,
        user_name=user.first_name,
        reset_token=token,
    )

    return {"message": f"Password reset email sent to {user.email}"}


# ── Audit Log ──────────────────────────────────────────────────────


@router.get("/audit-log", response_model=AuditLogListResponse)
async def get_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    action: str | None = Query(default=None),
    admin_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    query = select(AdminAuditLog)
    count_query = select(func.count(AdminAuditLog.id))

    if action:
        query = query.where(AdminAuditLog.action == action)
        count_query = count_query.where(AdminAuditLog.action == action)
    if admin_id:
        query = query.where(AdminAuditLog.admin_id == admin_id)
        count_query = count_query.where(AdminAuditLog.admin_id == admin_id)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * per_page
    rows = (
        await db.execute(
            query.order_by(AdminAuditLog.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    # Fetch admin emails
    admin_ids = list({r.admin_id for r in rows})
    admin_email_map: dict[UUID, str] = {}
    if admin_ids:
        admin_rows = (
            await db.execute(
                select(User.id, User.email).where(User.id.in_(admin_ids))
            )
        ).all()
        admin_email_map = {r[0]: r[1] for r in admin_rows}

    items = [
        AuditLogOut(
            id=r.id,
            admin_id=r.admin_id,
            admin_email=admin_email_map.get(r.admin_id),
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            details=r.details,
            ip_address=r.ip_address,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


# ── Announcements ─────────────────────────────────────────────────


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc())
    )
    return [AnnouncementOut.model_validate(a) for a in result.scalars().all()]


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: AnnouncementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    announcement = Announcement(
        title=body.title,
        message=body.message,
        type=body.type,
        created_by=current_user.id,
        expires_at=body.expires_at,
    )
    db.add(announcement)
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="created_announcement",
        target_type="announcement",
        details=json.dumps({"title": body.title}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(announcement)
    return AnnouncementOut.model_validate(announcement)


@router.put("/announcements/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(
    announcement_id: int,
    body: AnnouncementUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(announcement, field, value)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_announcement",
        target_type="announcement",
        target_id=str(announcement_id),
        details=json.dumps(update_data, default=str),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(announcement)
    return AnnouncementOut.model_validate(announcement)


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="deleted_announcement",
        target_type="announcement",
        target_id=str(announcement_id),
        details=json.dumps({"title": announcement.title}),
        ip_address=_get_client_ip(request),
    )
    await db.delete(announcement)
    await db.flush()


# ── System Settings ────────────────────────────────────────────────


async def _ensure_default_settings(db: AsyncSession) -> None:
    """Ensure the maintenance_mode setting exists."""
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "maintenance_mode")
    )
    if not result.scalar_one_or_none():
        db.add(SystemSetting(key="maintenance_mode", value="false"))
        await db.flush()


@router.get("/settings", response_model=list[SystemSettingOut])
async def list_system_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    await _ensure_default_settings(db)

    result = await db.execute(select(SystemSetting).order_by(SystemSetting.key))
    return [SystemSettingOut.model_validate(s) for s in result.scalars().all()]


@router.put("/settings/{key}", response_model=SystemSettingOut)
async def update_system_setting(
    key: str,
    body: SystemSettingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setting not found",
        )

    old_value = setting.value
    setting.value = body.value
    setting.updated_by = current_user.id

    action = "toggled_maintenance" if key == "maintenance_mode" else "updated_setting"
    log_admin_action(
        db,
        admin_id=current_user.id,
        action=action,
        target_type="system",
        details=json.dumps({"key": key, "old_value": old_value, "new_value": body.value}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(setting)
    return SystemSettingOut.model_validate(setting)


# ── App Updates ────────────────────────────────────────────────────


@router.get("/app-updates", response_model=list[AppUpdateOut])
async def list_app_updates_admin(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(AppUpdate).order_by(AppUpdate.date.desc())
    )
    return [AppUpdateOut.model_validate(u) for u in result.scalars().all()]


@router.post("/app-updates", response_model=AppUpdateOut, status_code=status.HTTP_201_CREATED)
async def create_app_update(
    body: AppUpdateCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    update = AppUpdate(
        date=body.date,
        description=body.description,
        type=body.type,
        created_by=current_user.id,
    )
    db.add(update)
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="created_app_update",
        target_type="app_update",
        details=json.dumps({"description": body.description, "type": body.type}, default=str),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(update)
    return AppUpdateOut.model_validate(update)


@router.put("/app-updates/{update_id}", response_model=AppUpdateOut)
async def update_app_update(
    update_id: int,
    body: AppUpdateUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(AppUpdate).where(AppUpdate.id == update_id)
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="App update not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(update, field, value)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_app_update",
        target_type="app_update",
        target_id=str(update_id),
        details=json.dumps(update_data, default=str),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(update)
    return AppUpdateOut.model_validate(update)


@router.delete("/app-updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app_update(
    update_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(AppUpdate).where(AppUpdate.id == update_id)
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="App update not found",
        )

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="deleted_app_update",
        target_type="app_update",
        target_id=str(update_id),
        details=json.dumps({"description": update.description}),
        ip_address=_get_client_ip(request),
    )
    await db.delete(update)
    await db.flush()


# ── Coming Soon ────────────────────────────────────────────────────


@router.get("/coming-soon", response_model=list[ComingSoonOut])
async def list_coming_soon_admin(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(ComingSoon).order_by(ComingSoon.created_at.desc())
    )
    return [ComingSoonOut.model_validate(c) for c in result.scalars().all()]


@router.post("/coming-soon", response_model=ComingSoonOut, status_code=status.HTTP_201_CREATED)
async def create_coming_soon(
    body: ComingSoonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    item = ComingSoon(
        feature_name=body.feature_name,
        description=body.description,
        eta=body.eta,
        created_by=current_user.id,
    )
    db.add(item)
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="created_coming_soon",
        target_type="coming_soon",
        details=json.dumps({"feature_name": body.feature_name}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(item)
    return ComingSoonOut.model_validate(item)


@router.put("/coming-soon/{item_id}", response_model=ComingSoonOut)
async def update_coming_soon(
    item_id: int,
    body: ComingSoonUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(ComingSoon).where(ComingSoon.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coming soon item not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_coming_soon",
        target_type="coming_soon",
        target_id=str(item_id),
        details=json.dumps(update_data, default=str),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(item)
    return ComingSoonOut.model_validate(item)


@router.delete("/coming-soon/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coming_soon(
    item_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(ComingSoon).where(ComingSoon.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coming soon item not found",
        )

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="deleted_coming_soon",
        target_type="coming_soon",
        target_id=str(item_id),
        details=json.dumps({"feature_name": item.feature_name}),
        ip_address=_get_client_ip(request),
    )
    await db.delete(item)
    await db.flush()


# ── Broadcast Emails ───────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "https://paydrift-api.onrender.com")


class BroadcastRequest(BaseModel):
    subject: str
    body: str
    audience_filter: str = "all"  # all, free, pro, active_30d


class BroadcastOut(BaseModel):
    id: int
    subject: str
    body: str
    audience_filter: str
    recipient_count: int
    sent_at: datetime | None
    sent_by: UUID | None
    sender_email: str | None = None


class UnsubscribedUserOut(BaseModel):
    id: UUID
    email: str
    first_name: str
    last_name: str
    unsubscribed_at: datetime | None


@router.post("/broadcast")
async def send_broadcast(
    body: BroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    # Rate limit: max 1 broadcast per hour
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = await db.execute(
        select(func.count(Broadcast.id)).where(Broadcast.sent_at >= one_hour_ago)
    )
    if (recent.scalar() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Only one broadcast per hour is allowed. Please wait before sending another.",
        )

    # Build audience query
    query = select(User).where(
        User.email_unsubscribed.is_(False),
        User.is_active.is_(True),
    )
    if body.audience_filter == "free":
        query = query.where(User.is_supporter.is_(False))
    elif body.audience_filter == "pro":
        query = query.where(User.is_supporter.is_(True))
    elif body.audience_filter == "active_30d":
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        query = query.where(
            func.coalesce(User.last_login_at, User.updated_at) >= thirty_days_ago
        )

    recipients = (await db.execute(query)).scalars().all()

    # Count excluded
    excluded_count = (
        await db.execute(
            select(func.count(User.id)).where(User.email_unsubscribed.is_(True))
        )
    ).scalar() or 0

    # Send emails individually
    from app.routers.unsubscribe import generate_unsubscribe_token
    from app.services.email_service import send_broadcast_email

    backend_base = BACKEND_URL.rstrip("/")
    sent_count = 0
    for user in recipients:
        token = generate_unsubscribe_token(str(user.id))
        unsub_url = f"{backend_base}/api/v1/unsubscribe?token={token}"
        try:
            ok = await send_broadcast_email(
                to_email=user.email,
                subject=body.subject,
                body=body.body,
                unsubscribe_url=unsub_url,
            )
            if ok:
                sent_count += 1
        except Exception:
            logger.exception("Failed to send broadcast to %s", user.email)

    # Record broadcast
    broadcast = Broadcast(
        subject=body.subject,
        body=body.body,
        audience_filter=body.audience_filter,
        recipient_count=sent_count,
        sent_by=current_user.id,
    )
    db.add(broadcast)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="sent_broadcast",
        target_type="broadcast",
        details=json.dumps({
            "subject": body.subject,
            "audience": body.audience_filter,
            "count": sent_count,
            "excluded": excluded_count,
        }),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    return {
        "message": f"Sent to {sent_count} users",
        "sent_count": sent_count,
        "excluded_count": excluded_count,
    }


@router.get("/broadcasts", response_model=list[BroadcastOut])
async def list_broadcasts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    rows = (
        await db.execute(
            select(Broadcast).order_by(Broadcast.sent_at.desc()).limit(50)
        )
    ).scalars().all()

    # Fetch sender emails
    sender_ids = list({r.sent_by for r in rows if r.sent_by})
    email_map: dict[UUID, str] = {}
    if sender_ids:
        sender_rows = (
            await db.execute(
                select(User.id, User.email).where(User.id.in_(sender_ids))
            )
        ).all()
        email_map = {r[0]: r[1] for r in sender_rows}

    return [
        BroadcastOut(
            id=b.id,
            subject=b.subject,
            body=b.body,
            audience_filter=b.audience_filter,
            recipient_count=b.recipient_count,
            sent_at=b.sent_at,
            sent_by=b.sent_by,
            sender_email=email_map.get(b.sent_by),
        )
        for b in rows
    ]


@router.get("/broadcast/preview")
async def preview_broadcast(
    audience_filter: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns recipient count + excluded count for confirmation modal."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    query = select(func.count(User.id)).where(
        User.email_unsubscribed.is_(False),
        User.is_active.is_(True),
    )
    if audience_filter == "free":
        query = query.where(User.is_supporter.is_(False))
    elif audience_filter == "pro":
        query = query.where(User.is_supporter.is_(True))
    elif audience_filter == "active_30d":
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        query = query.where(
            func.coalesce(User.last_login_at, User.updated_at) >= thirty_days_ago
        )

    recipient_count = (await db.execute(query)).scalar() or 0
    excluded_count = (
        await db.execute(
            select(func.count(User.id)).where(User.email_unsubscribed.is_(True))
        )
    ).scalar() or 0

    return {"recipient_count": recipient_count, "excluded_count": excluded_count}


@router.get("/unsubscribed", response_model=list[UnsubscribedUserOut])
async def list_unsubscribed_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    rows = (
        await db.execute(
            select(User)
            .where(User.email_unsubscribed.is_(True))
            .order_by(User.unsubscribed_at.desc())
        )
    ).scalars().all()

    return [
        UnsubscribedUserOut(
            id=u.id,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            unsubscribed_at=u.unsubscribed_at,
        )
        for u in rows
    ]


@router.post("/resubscribe/{user_id}")
async def resubscribe_user(
    user_id: UUID,
    request: Request,
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

    user.email_unsubscribed = False
    user.unsubscribed_at = None

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="resubscribed_user",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"email": user.email}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    return {"message": f"{user.email} has been re-subscribed"}


# ── Feature A: Toggle Active/Deactivated ───────────────────────

@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot toggle your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = not user.is_active

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="toggled_active",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"is_active": user.is_active}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    await db.refresh(user)

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "account_status": user.account_status,
    }


# ── Feature B: Per-User Tier Override ───────────────────────────

from app.models.user_feature_override import UserFeatureOverride  # noqa: E402


class OverrideBody(BaseModel):
    override_tier: str | None = None
    granted_features: list[str] | None = None
    reason: str | None = None
    expires_at: str | None = None


VALID_TIERS = {None, "pro", "business", "bundle"}
VALID_FEATURE_KEYS = {
    "savings_challenges", "household_overview", "tax_prep", "receipt_ocr",
    "bill_reminders", "spending_insights", "sales_tracking",
    "business_deductions", "contingency_fund", "upgrade_fund", "net_profit",
}


@router.get("/users/{user_id}/override")
async def get_user_override(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(UserFeatureOverride).where(
            UserFeatureOverride.user_id == user_id,
            UserFeatureOverride.is_active == True,  # noqa: E712
        )
    )
    override = result.scalar_one_or_none()
    if not override:
        return None

    return {
        "id": override.id,
        "user_id": str(override.user_id),
        "override_tier": override.override_tier,
        "granted_features": override.granted_features or [],
        "reason": override.reason,
        "expires_at": override.expires_at.isoformat() if override.expires_at else None,
        "granted_by": str(override.granted_by),
        "is_active": override.is_active,
        "created_at": override.created_at.isoformat() if override.created_at else None,
    }


@router.put("/users/{user_id}/override")
async def upsert_user_override(
    user_id: UUID,
    body: OverrideBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    if body.override_tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {body.override_tier}")

    if body.granted_features:
        invalid = set(body.granted_features) - VALID_FEATURE_KEYS
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid feature keys: {invalid}")

    # Check user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    expires_at = None
    if body.expires_at:
        from datetime import datetime as dt
        try:
            expires_at = dt.fromisoformat(body.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format")

    result = await db.execute(
        select(UserFeatureOverride).where(UserFeatureOverride.user_id == user_id)
    )
    override = result.scalar_one_or_none()

    if override:
        override.override_tier = body.override_tier
        override.granted_features = body.granted_features or []
        override.reason = body.reason
        override.expires_at = expires_at
        override.granted_by = current_user.id
        override.is_active = True
    else:
        override = UserFeatureOverride(
            user_id=user_id,
            override_tier=body.override_tier,
            granted_features=body.granted_features or [],
            reason=body.reason,
            expires_at=expires_at,
            granted_by=current_user.id,
            is_active=True,
        )
        db.add(override)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="upsert_override",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"tier": body.override_tier, "features": body.granted_features}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    return {
        "id": override.id,
        "user_id": str(override.user_id),
        "override_tier": override.override_tier,
        "granted_features": override.granted_features or [],
        "reason": override.reason,
        "expires_at": override.expires_at.isoformat() if override.expires_at else None,
        "granted_by": str(override.granted_by),
        "is_active": override.is_active,
    }


@router.delete("/users/{user_id}/override")
async def delete_user_override(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(UserFeatureOverride).where(UserFeatureOverride.user_id == user_id)
    )
    override = result.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=404, detail="No override found")

    override.is_active = False

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="remove_override",
        target_type="user",
        target_id=str(user_id),
        details=json.dumps({"deactivated": True}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    return {"message": "Override removed"}


# ── Feature C: Global Feature Toggles ──────────────────────────

from app.models.global_feature_override import GlobalFeatureOverride  # noqa: E402


@router.get("/global-features")
async def list_global_features(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(GlobalFeatureOverride).order_by(GlobalFeatureOverride.tier, GlobalFeatureOverride.feature_key)
    )
    features = result.scalars().all()
    return [
        {
            "id": f.id,
            "feature_key": f.feature_key,
            "feature_label": f.feature_label,
            "tier": f.tier,
            "is_free_for_all": f.is_free_for_all,
            "updated_by": f.updated_by,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in features
    ]


class GlobalFeatureUpdate(BaseModel):
    is_free_for_all: bool


@router.put("/global-features/{feature_key}")
async def toggle_global_feature(
    feature_key: str,
    body: GlobalFeatureUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(GlobalFeatureOverride).where(GlobalFeatureOverride.feature_key == feature_key)
    )
    feature = result.scalar_one_or_none()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")

    feature.is_free_for_all = body.is_free_for_all
    feature.updated_by = current_user.id

    # Force updated_at since onupdate only fires on flush if other cols changed
    from datetime import datetime as dt, timezone as tz
    feature.updated_at = dt.now(tz.utc)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="toggle_global_feature",
        target_type="global_feature",
        target_id=feature_key,
        details=json.dumps({"is_free_for_all": body.is_free_for_all}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()

    return {
        "feature_key": feature.feature_key,
        "feature_label": feature.feature_label,
        "tier": feature.tier,
        "is_free_for_all": feature.is_free_for_all,
        "updated_by": feature.updated_by,
        "updated_at": feature.updated_at.isoformat() if feature.updated_at else None,
    }
