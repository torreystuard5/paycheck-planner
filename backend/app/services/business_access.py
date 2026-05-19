"""Business Edition access: subscription, trial, early access, admin grants."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.tier_access import (
    can_switch_app_mode,
    has_business_dashboard_access,
    has_personal_home_access,
    normalize_plan_tier,
)

BusinessAccessState = Literal[
    "none",
    "early_access",
    "trial_active",
    "trial_expired",
    "subscribed",
    "bundle",
    "admin_granted",
]

TRIAL_DAYS = 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def business_access_state(user: User, *, now: datetime | None = None) -> BusinessAccessState:
    """Compute business access state for UI and guards."""
    now = now or _utcnow()
    tier = normalize_plan_tier(user.subscription_tier)

    if tier == "bundle":
        return "bundle"
    if tier == "business":
        return "subscribed"

    grant_until = _aware(getattr(user, "business_access_granted_until", None))
    if grant_until and grant_until > now:
        return "admin_granted"

    if tier == "early_access":
        return "early_access"

    trial_end = _aware(getattr(user, "business_trial_ends_at", None))
    trial_start = _aware(getattr(user, "business_trial_started_at", None))
    if trial_start and trial_end:
        if trial_end > now:
            return "trial_active"
        return "trial_expired"

    return "none"


def user_has_business_access(user: User, *, now: datetime | None = None) -> bool:
    state = business_access_state(user, now=now)
    return state in (
        "early_access",
        "trial_active",
        "subscribed",
        "bundle",
        "admin_granted",
    )


def user_can_write_business(user: User, *, now: datetime | None = None) -> bool:
    state = business_access_state(user, now=now)
    if state == "trial_expired":
        return False
    return user_has_business_access(user, now=now)


def user_can_start_business_trial(user: User, *, now: datetime | None = None) -> bool:
    tier = normalize_plan_tier(user.subscription_tier)
    if tier in ("business", "bundle"):
        return False
    if user_has_business_access(user, now=now) and business_access_state(user, now=now) != "none":
        if business_access_state(user, now=now) != "trial_expired":
            return False
    if getattr(user, "business_trial_consumed", False):
        return False
    return True


def start_business_trial(user: User, *, now: datetime | None = None) -> None:
    now = now or _utcnow()
    user.business_trial_consumed = True
    user.business_trial_started_at = now
    user.business_trial_ends_at = now + timedelta(days=TRIAL_DAYS)


async def business_access_payload_async(
    db: AsyncSession, user: User, *, now: datetime | None = None
) -> dict[str, Any]:
    base = business_access_payload(user, now=now)
    role, perms = await get_team_role_and_permissions(db, user)
    base["team_role"] = role
    base["team_permissions"] = perms
    base["business_owner_id"] = str(await resolve_business_owner_user_id(db, user))
    return base


def business_access_payload(user: User, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or _utcnow()
    state = business_access_state(user, now=now)
    tier = normalize_plan_tier(user.subscription_tier)
    return {
        "access_state": state,
        "has_business_access": user_has_business_access(user, now=now),
        "can_write_business": user_can_write_business(user, now=now),
        "can_start_trial": user_can_start_business_trial(user, now=now),
        "can_switch_editions": can_switch_app_mode(tier) or tier == "early_access",
        "has_personal_access": has_personal_home_access(tier),
        "has_paid_business": has_business_dashboard_access(tier),
        "trial_ends_at": (
            user.business_trial_ends_at.isoformat()
            if getattr(user, "business_trial_ends_at", None)
            else None
        ),
        "business_trial_consumed": bool(getattr(user, "business_trial_consumed", False)),
        "app_mode": user.app_mode or "personal",
        "subscription_tier": tier,
    }


async def resolve_business_owner_user_id(db: AsyncSession, user: User) -> UUID:
    """Owner user id for business data (team members see owner's books)."""
    from app.models.business_team import BusinessTeamMember

    result = await db.execute(
        select(BusinessTeamMember.owner_user_id).where(
            BusinessTeamMember.member_user_id == user.id,
            BusinessTeamMember.status == "active",
        )
    )
    owner_id = result.scalar_one_or_none()
    return owner_id or user.id


async def get_team_role_and_permissions(
    db: AsyncSession, user: User
) -> tuple[str | None, dict[str, bool] | None]:
    from app.services.business_context import load_business_context

    ctx = await load_business_context(db, user)
    if ctx.role == "owner" and ctx.owner_id == user.id:
        return "owner", ctx.permissions
    if ctx.owner_id != user.id:
        return ctx.role, ctx.permissions
    return None, None
