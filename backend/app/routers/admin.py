import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.announcement import Announcement
from app.models.household import Household
from app.models.support_ticket import SupportTicket
from app.models.system_setting import SystemSetting
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
            select(func.count(User.id)).where(User.updated_at >= thirty_days_ago)
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


# ── Users ──────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    total = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # Apply sorting
    if sort_by not in USER_SORT_FIELDS:
        sort_by = "created_at"
    col_map = {"last_login": "last_login_at"}
    sort_col = getattr(User, col_map.get(sort_by, sort_by), User.created_at)
    order = sort_col.desc() if sort_order == "desc" else sort_col.asc()

    offset = (page - 1) * per_page
    rows = (
        await db.execute(
            select(User)
            .order_by(order)
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
