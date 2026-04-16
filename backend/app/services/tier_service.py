from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_feature_override import GlobalFeatureOverride
from app.models.user_feature_override import UserFeatureOverride


async def get_effective_tier(user_id, db: AsyncSession) -> dict:
    """SINGLE SOURCE OF TRUTH for user tier/features.

    Resolution order:
    1. Check global_feature_overrides — collect features where is_free_for_all=True
    2. Check user_feature_overrides — if active + non-expired:
       a. override_tier → effective tier
       b. granted_features → add to list
    3. User's actual subscription (for now everyone is "free")
    4. Merge: effective_tier + union of all granted features
    """
    effective_tier = "free"
    granted_features = set()
    is_overridden = False
    override_reason = None
    override_expires = None

    # 1. Global free features
    result = await db.execute(
        select(GlobalFeatureOverride).where(GlobalFeatureOverride.is_free_for_all == True)  # noqa: E712
    )
    for gfo in result.scalars().all():
        granted_features.add(gfo.feature_key)

    # 2. User-specific override
    result = await db.execute(
        select(UserFeatureOverride).where(
            UserFeatureOverride.user_id == user_id,
            UserFeatureOverride.is_active == True,  # noqa: E712
        )
    )
    override = result.scalar_one_or_none()

    if override:
        # Check expiration
        expired = False
        if override.expires_at:
            exp = override.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                expired = True

        if not expired:
            is_overridden = True
            override_reason = override.reason
            override_expires = override.expires_at.isoformat() if override.expires_at else None

            if override.override_tier:
                effective_tier = override.override_tier

            if override.granted_features:
                for f in override.granted_features:
                    granted_features.add(f)

    return {
        "effective_tier": effective_tier,
        "granted_features": sorted(granted_features),
        "is_overridden": is_overridden,
        "override_reason": override_reason,
        "override_expires": override_expires,
    }
