"""Business request context: owner scoping + team permissions."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business_team import BusinessTeamMember
from app.models.user import User
from app.services.business_access import resolve_business_owner_user_id
from app.utils.security import require_business_mode

OWNER_PERMISSIONS: dict[str, bool] = {
    "view_dashboard": True,
    "manage_sales": True,
    "manage_deductions": True,
    "manage_staff_pay": True,
    "view_tax_prep": True,
    "manage_team": True,
    "manage_subscription": True,
    "manage_funds": True,
    "manage_settings": True,
}

MANAGER_PERMISSIONS: dict[str, bool] = {
    "view_dashboard": True,
    "manage_sales": True,
    "manage_deductions": True,
    "manage_staff_pay": False,
    "view_tax_prep": False,
    "manage_team": False,
    "manage_subscription": False,
    "manage_funds": True,
    "manage_settings": False,
}

EMPLOYEE_PERMISSIONS: dict[str, bool] = {
    "view_dashboard": True,
    "manage_sales": True,
    "manage_deductions": False,
    "manage_staff_pay": False,
    "view_tax_prep": False,
    "manage_team": False,
    "manage_subscription": False,
    "manage_funds": False,
    "manage_settings": False,
}

ROLE_DEFAULTS = {
    "owner": OWNER_PERMISSIONS,
    "manager": MANAGER_PERMISSIONS,
    "employee": EMPLOYEE_PERMISSIONS,
}


@dataclass
class BusinessContext:
    actor: User
    owner_id: UUID
    role: str
    permissions: dict[str, bool]

    def has(self, key: str) -> bool:
        return bool(self.permissions.get(key))

    def require(self, key: str) -> None:
        if not self.has(key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "business_permission_denied",
                    "permission": key,
                    "message": "You do not have permission for this action.",
                },
            )

    def require_owner(self) -> None:
        if self.role != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Business owner access required",
            )


def _merge_permissions(role: str, custom: dict | None) -> dict[str, bool]:
    base = dict(ROLE_DEFAULTS.get(role, EMPLOYEE_PERMISSIONS))
    if custom:
        for k, v in custom.items():
            if isinstance(v, bool):
                base[k] = v
    if role == "owner":
        base.update(OWNER_PERMISSIONS)
    return base


async def load_business_context(db: AsyncSession, actor: User) -> BusinessContext:
    owner_id = await resolve_business_owner_user_id(db, actor)
    if owner_id == actor.id:
        return BusinessContext(
            actor=actor,
            owner_id=owner_id,
            role="owner",
            permissions=dict(OWNER_PERMISSIONS),
        )

    try:
        result = await db.execute(
            select(BusinessTeamMember).where(
                BusinessTeamMember.member_user_id == actor.id,
                BusinessTeamMember.owner_user_id == owner_id,
                BusinessTeamMember.status == "active",
            )
        )
        row = result.scalar_one_or_none()
    except (ProgrammingError, DBAPIError):
        row = None
    if not row:
        return BusinessContext(
            actor=actor,
            owner_id=owner_id,
            role="owner",
            permissions=dict(OWNER_PERMISSIONS),
        )
    role = (row.role or "employee").lower()
    perms = _merge_permissions(role, row.permissions if isinstance(row.permissions, dict) else None)
    return BusinessContext(actor=actor, owner_id=owner_id, role=role, permissions=perms)


async def accept_pending_team_invites(db: AsyncSession, user: User) -> int:
    """Link pending invites matching the user's email."""
    if not user.email:
        return 0
    email = user.email.lower().strip()
    try:
        result = await db.execute(
            select(BusinessTeamMember).where(
                BusinessTeamMember.invited_email == email,
                BusinessTeamMember.status == "pending",
            )
        )
        rows = result.scalars().all()
    except (ProgrammingError, DBAPIError):
        return 0
    for row in rows:
        row.member_user_id = user.id
        row.status = "active"
    if rows:
        await db.flush()
    return len(rows)


async def get_business_ctx(
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_business_mode),
) -> BusinessContext:
    await accept_pending_team_invites(db, actor)
    ctx = await load_business_context(db, actor)
    if not ctx.has("view_dashboard"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to business dashboard",
        )
    return ctx
