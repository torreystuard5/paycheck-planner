"""Plan tier access rules (subscription_tier on User).

Tiers: early_access (Home Free), pro (Home Pro), business (Business), bundle (Bundle).
Admin / lifetime map to pro for feature gates where applicable.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_feature_override import UserFeatureOverride

# Feature keys that belong to the Home Pro surface (not cross-tier).
PRO_SCOPE_FEATURE_KEYS: frozenset[str] = frozenset(
    {
        "savings_challenges",
        "household_overview",
        "tax_prep",
        "receipt_ocr",
        "bill_reminders",
        "spending_insights",
    }
)

# Feature keys that belong to Business Edition.
BUSINESS_SCOPE_FEATURE_KEYS: frozenset[str] = frozenset(
    {
        "sales_tracking",
        "business_deductions",
        "contingency_fund",
        "upgrade_fund",
        "net_profit",
    }
)

VALID_PLAN_TIERS: frozenset[str] = frozenset(
    {"early_access", "pro", "business", "bundle", "lifetime"}
)


def normalize_plan_tier(raw: str | None) -> str:
    """Return canonical plan tier string used for gating."""
    r = (raw or "early_access").strip().lower()
    if r in ("", "free", "none"):
        return "early_access"
    if r == "lifetime":
        return "pro"
    if r not in VALID_PLAN_TIERS:
        return "early_access"
    return r


def has_personal_home_access(tier: str) -> bool:
    t = normalize_plan_tier(tier)
    return t in ("early_access", "pro", "bundle")


def has_business_dashboard_access(tier: str) -> bool:
    t = normalize_plan_tier(tier)
    return t in ("business", "bundle")


def has_pro_surface_access(tier: str) -> bool:
    """Pro-only product areas (OCR, etc.) — Home Pro and Bundle."""
    t = normalize_plan_tier(tier)
    return t in ("pro", "bundle")


def can_switch_app_mode(tier: str) -> bool:
    return normalize_plan_tier(tier) == "bundle"


def allowed_override_feature_keys_for_tier(tier: str) -> frozenset[str]:
    """Per-user override may only toggle keys in the user's product."""
    t = normalize_plan_tier(tier)
    if t == "bundle":
        return PRO_SCOPE_FEATURE_KEYS | BUSINESS_SCOPE_FEATURE_KEYS
    if t == "pro":
        return PRO_SCOPE_FEATURE_KEYS
    if t == "business":
        return BUSINESS_SCOPE_FEATURE_KEYS
    return frozenset()


def feature_allowed_by_global_tier_flag(feature_key: str, feature_row_tier: str) -> bool:
    """Global row `tier` column indicates which product surface the flag belongs to."""
    ft = (feature_row_tier or "").lower()
    if ft == "pro":
        return feature_key in PRO_SCOPE_FEATURE_KEYS
    if ft == "business":
        return feature_key in BUSINESS_SCOPE_FEATURE_KEYS
    return False


def filter_feature_keys_for_plan(keys: list[str] | None, plan_tier: str) -> list[str]:
    allowed = allowed_override_feature_keys_for_tier(plan_tier)
    if not keys:
        return []
    return sorted({k for k in keys if k in allowed})


def sync_app_mode_to_subscription(user: User) -> bool:
    """Force app_mode invariants from subscription tier. Returns True if mutated."""
    tier = normalize_plan_tier(user.subscription_tier)
    mode = (user.app_mode or "personal").lower()
    changed = False
    if tier == "business":
        if mode != "business":
            user.app_mode = "business"
            changed = True
    elif tier in ("early_access", "pro"):
        if mode != "personal":
            user.app_mode = "personal"
            changed = True
    elif tier == "bundle":
        if mode not in ("personal", "business"):
            user.app_mode = "personal"
            changed = True
    return changed


async def deactivate_user_feature_overrides(
    db: AsyncSession, user_id: UUID
) -> None:
    result = await db.execute(
        select(UserFeatureOverride).where(UserFeatureOverride.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row:
        row.is_active = False
        row.override_tier = None
        row.granted_features = []
