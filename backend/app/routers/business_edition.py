"""Business Edition entry: access state, trial activation, edition switching."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business_team import BusinessTeamAuditLog, BusinessTeamMember
from app.models.user import User
from app.schemas.user import UserResponse
from app.services.business_access import (
    business_access_payload_async,
    start_business_trial,
    user_can_start_business_trial,
    user_has_business_access,
)
from app.services.business_context import BusinessContext, get_business_ctx
from app.services.tier_access import can_switch_app_mode, has_personal_home_access, normalize_plan_tier
from app.utils.security import get_current_user

router = APIRouter(prefix="/business/edition", tags=["Business Edition"])


class ActivateBusinessBody(BaseModel):
    accept_trial: bool = True


class TeamMemberInvite(BaseModel):
    email: EmailStr
    role: str = "employee"
    permissions: dict | None = None


class TeamMemberUpdate(BaseModel):
    role: str | None = None
    permissions: dict | None = None
    status: str | None = None


DEFAULT_PERMISSIONS = {
    "owner": {
        "view_dashboard": True,
        "manage_sales": True,
        "manage_deductions": True,
        "manage_staff_pay": True,
        "view_tax_prep": True,
        "manage_team": True,
        "manage_subscription": True,
    },
    "manager": {
        "view_dashboard": True,
        "manage_sales": True,
        "manage_deductions": True,
        "manage_staff_pay": False,
        "view_tax_prep": False,
        "manage_team": False,
        "manage_subscription": False,
    },
    "employee": {
        "view_dashboard": True,
        "manage_sales": True,
        "manage_deductions": False,
        "manage_staff_pay": False,
        "view_tax_prep": False,
        "manage_team": False,
        "manage_subscription": False,
    },
}


@router.get("/access")
async def get_business_access(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.business_context import accept_pending_team_invites

    await accept_pending_team_invites(db, current_user)
    return await business_access_payload_async(db, current_user)


@router.post("/activate", response_model=UserResponse)
async def activate_business_edition(
    body: ActivateBusinessBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Intentionally start Business mode (and 7-day trial when eligible)."""
    tier = normalize_plan_tier(current_user.subscription_tier)
    if user_has_business_access(current_user):
        current_user.app_mode = "business"
    elif user_can_start_business_trial(current_user) and body.accept_trial:
        start_business_trial(current_user)
        current_user.app_mode = "business"
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "business_upgrade_required",
                "message": "Subscribe to Business or start your one-time free trial.",
            },
        )
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.post("/enter-personal", response_model=UserResponse)
async def enter_personal_edition(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tier = normalize_plan_tier(current_user.subscription_tier)
    if not has_personal_home_access(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your plan does not include Personal mode",
        )
    if tier == "business" and not can_switch_app_mode(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business-only plans cannot switch to Personal mode",
        )
    current_user.app_mode = "personal"
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.get("/team")
async def list_team(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_team")
    result = await db.execute(
        select(BusinessTeamMember).where(
            BusinessTeamMember.owner_user_id == ctx.owner_id,
            BusinessTeamMember.status != "removed",
        )
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "member_user_id": str(r.member_user_id) if r.member_user_id else None,
            "invited_email": r.invited_email,
            "role": r.role,
            "permissions": r.permissions or {},
            "status": r.status,
        }
        for r in rows
    ]


@router.post("/team/invite", status_code=status.HTTP_201_CREATED)
async def invite_team_member(
    body: TeamMemberInvite,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require_owner()
    role = (body.role or "employee").lower()
    if role not in ("owner", "manager", "employee"):
        raise HTTPException(status_code=400, detail="Invalid role")
    perms = body.permissions or DEFAULT_PERMISSIONS.get(role, {})
    member = BusinessTeamMember(
        owner_user_id=ctx.owner_id,
        member_user_id=None,
        invited_email=body.email.lower(),
        role=role,
        permissions=perms,
        status="pending",
    )
    db.add(member)
    db.add(
        BusinessTeamAuditLog(
            owner_user_id=ctx.owner_id,
            actor_user_id=ctx.actor.id,
            target_user_id=None,
            action="team_invite",
            details={"email": body.email, "role": role},
        )
    )
    await db.flush()
    return {"id": str(member.id), "status": "pending"}


@router.patch("/team/{member_id}")
async def update_team_member(
    member_id: UUID,
    body: TeamMemberUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require_owner()
    result = await db.execute(
        select(BusinessTeamMember).where(
            BusinessTeamMember.id == member_id,
            BusinessTeamMember.owner_user_id == ctx.owner_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Team member not found")
    if body.role:
        row.role = body.role
    if body.permissions is not None:
        row.permissions = body.permissions
    if body.status:
        row.status = body.status
    db.add(
        BusinessTeamAuditLog(
            owner_user_id=ctx.owner_id,
            actor_user_id=ctx.actor.id,
            target_user_id=row.member_user_id,
            action="team_update",
            details=body.model_dump(exclude_none=True),
        )
    )
    await db.flush()
    return {"ok": True}


@router.get("/team/permissions-matrix")
async def team_permissions_matrix():
    """Reference permissions by role for UI."""
    return {
        "roles": list(DEFAULT_PERMISSIONS.keys()),
        "permissions": sorted(
            {k for perms in DEFAULT_PERMISSIONS.values() for k in perms}
        ),
        "matrix": DEFAULT_PERMISSIONS,
    }


@router.get("/team/audit-log")
async def team_audit_log(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_team")
    result = await db.execute(
        select(BusinessTeamAuditLog)
        .where(BusinessTeamAuditLog.owner_user_id == ctx.owner_id)
        .order_by(BusinessTeamAuditLog.created_at.desc())
        .limit(min(limit, 100))
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "action": r.action,
            "details": r.details or {},
            "actor_user_id": str(r.actor_user_id) if r.actor_user_id else None,
            "target_user_id": str(r.target_user_id) if r.target_user_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/team/accept")
async def accept_team_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.business_context import accept_pending_team_invites

    count = await accept_pending_team_invites(db, current_user)
    return {"accepted": count}
