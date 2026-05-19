from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_feature_override import GlobalFeatureOverride
from app.models.user import User
from app.models.user_feature_override import UserFeatureOverride
from app.services.business_access import user_has_business_access
from app.services.tier_access import (
    BUSINESS_SCOPE_FEATURE_KEYS,
    PRO_SCOPE_FEATURE_KEYS,
    can_switch_app_mode,
    feature_allowed_by_global_tier_flag,
    filter_feature_keys_for_plan,
    has_business_dashboard_access,
    has_personal_home_access,
    has_pro_surface_access,
    normalize_plan_tier,
)


async def user_can_access_feature(
    db: AsyncSession,
    user: User,
    feature_key: str,
) -> bool:
    """True when user may use a Home Pro / Business feature (incl. early_access bypass)."""
    plan = normalize_plan_tier(getattr(user, "subscription_tier", None))
    if plan == "early_access":
        return True
    if feature_key in PRO_SCOPE_FEATURE_KEYS and has_pro_surface_access(plan):
        return True
    if feature_key in BUSINESS_SCOPE_FEATURE_KEYS and user_has_business_access(user):
        return True
    status = await get_effective_tier(user.id, db)
    return feature_key in (status.get("granted_features") or [])


async def get_effective_tier(user_id, db: AsyncSession) -> dict:
    """Tier + feature flags for the authenticated user.

    ``effective_tier`` is always the user's **subscription** tier (never replaced by
    override rows). Per-user overrides only contribute **granted_features** keys
    that are valid for that subscription.
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    plan = normalize_plan_tier(getattr(user, "subscription_tier", None) if user else None)

    granted_features: set[str] = set()

    # 1) Global toggles — respect tier (All Users does not bypass product tier).
    g_result = await db.execute(
        select(GlobalFeatureOverride).where(GlobalFeatureOverride.is_free_for_all == True)  # noqa: E712
    )
    for gfo in g_result.scalars().all():
        if gfo.feature_key in PRO_SCOPE_FEATURE_KEYS and not has_pro_surface_access(plan):
            continue
        if gfo.feature_key in BUSINESS_SCOPE_FEATURE_KEYS and not has_business_dashboard_access(
            plan
        ):
            continue
        if not feature_allowed_by_global_tier_flag(gfo.feature_key, gfo.tier):
            continue
        granted_features.add(gfo.feature_key)

    # 2) Per-user override — active, non-expired, tier-scoped feature keys only.
    is_overridden = False
    override_reason = None
    override_expires = None

    o_result = await db.execute(
        select(UserFeatureOverride).where(
            UserFeatureOverride.user_id == user_id,
            UserFeatureOverride.is_active == True,  # noqa: E712
        )
    )
    override = o_result.scalar_one_or_none()

    if override:
        expired = False
        if override.expires_at:
            exp = override.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                expired = True

        if not expired:
            allowed = set(filter_feature_keys_for_plan(override.granted_features or [], plan))
            if allowed:
                is_overridden = True
                override_reason = override.reason
                override_expires = (
                    override.expires_at.isoformat() if override.expires_at else None
                )
                granted_features |= allowed

    gf_sorted = sorted(granted_features)

    return {
        "effective_tier": plan,
        "subscription_tier": plan,
        "granted_features": gf_sorted,
        "is_overridden": is_overridden,
        "override_reason": override_reason,
        "override_expires": override_expires,
        "has_personal_access": has_personal_home_access(plan),
        "has_business_access": user_has_business_access(user) if user else has_business_dashboard_access(plan),
        "has_pro_features": has_pro_surface_access(plan),
        "can_switch_modes": can_switch_app_mode(plan),
    }
