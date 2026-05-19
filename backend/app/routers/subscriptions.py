from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.business_access import business_access_payload_async
from app.services.tier_service import get_effective_tier
from app.utils.security import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.get("/status")
async def subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns effective tier info for the current user."""
    tier_info = await get_effective_tier(current_user.id, db)
    plan = tier_info.get("subscription_tier") or "early_access"
    plan_names = {
        "early_access": "Home (Early Access)",
        "pro": "Home Pro",
        "business": "Business",
        "bundle": "Bundle",
    }
    return {
        **tier_info,
        **(await business_access_payload_async(db, current_user)),
        "subscription_status": getattr(current_user, "subscription_status", None) or "none",
        "plan_name": plan_names.get(plan, plan),
        "billing_period": getattr(current_user, "billing_period", None),
        "subscription_ends_at": (
            current_user.subscription_ends_at.isoformat()
            if getattr(current_user, "subscription_ends_at", None)
            else None
        ),
    }
