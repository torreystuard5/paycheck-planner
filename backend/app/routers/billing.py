from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.referral import BillingActivateRequest, BillingActivateResponse
from app.services.referral_service import apply_referral_reward
from app.utils.security import get_current_user

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.post("/activate-plan", response_model=BillingActivateResponse)
async def activate_plan(
    body: BillingActivateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Mark user as on a paid plan
    current_user.subscription_tier = body.plan

    # Set initial billing date if not set
    now = datetime.now(timezone.utc)
    if not current_user.next_billing_date:
        current_user.next_billing_date = now + timedelta(days=30)

    # Apply referral reward if applicable
    await apply_referral_reward(current_user, db)

    await db.flush()
    await db.refresh(current_user)

    return BillingActivateResponse(
        message="Plan activated successfully",
        subscription_tier=current_user.subscription_tier,
        next_billing_date=current_user.next_billing_date,
        free_month_credits=current_user.free_month_credits,
    )
