from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
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
    return {
        **tier_info,
        "subscription_status": "none",
        "plan_name": None,
    }
