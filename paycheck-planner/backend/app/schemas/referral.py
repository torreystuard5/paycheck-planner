from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ReferralInfoResponse(BaseModel):
    referral_code: str
    referral_link: str
    total_referred_count: int
    total_rewards_earned: int
    pending_rewards: int
    promo_end_date: str | None

    model_config = {"from_attributes": True}


class ReferralRewardResponse(BaseModel):
    id: int
    referrer_id: UUID
    referred_user_id: UUID
    referrer_email: str | None = None
    referred_email: str | None = None
    reward_type: str
    reward_status: str
    created_at: datetime
    applied_at: datetime | None = None

    model_config = {"from_attributes": True}


class BillingActivateRequest(BaseModel):
    plan: str = "monthly"


class BillingActivateResponse(BaseModel):
    message: str
    subscription_tier: str
    next_billing_date: datetime | None = None
    free_month_credits: int

    model_config = {"from_attributes": True}
