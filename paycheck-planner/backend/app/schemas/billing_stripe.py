from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    tier: str = Field(..., pattern="^(pro|business|bundle)$")
    billing_period: str = Field(..., pattern="^(monthly|six_month|annual)$")


class CheckoutResponse(BaseModel):
    url: str | None = None
    message: str | None = None
    stripe_configured: bool = False


class SubscriptionInfoResponse(BaseModel):
    subscription_tier: str
    subscription_status: str
    billing_period: str | None = None
    trial_ends_at: datetime | None = None
    subscription_started_at: datetime | None = None
    subscription_ends_at: datetime | None = None
    next_billing_date: datetime | None = None
    stripe_customer_id: str | None = None
    has_stripe_subscription: bool = False


class PricingPeriodOut(BaseModel):
    price_cents: int
    discount_pct: float
    user_discount_pct: float
    stripe_price_id: str | None = None


class PlansResponse(BaseModel):
    pro: dict[str, PricingPeriodOut]
    business: dict[str, PricingPeriodOut]
    bundle: dict[str, PricingPeriodOut]


class PortalResponse(BaseModel):
    url: str | None = None
    message: str | None = None


class AdminPricingPatch(BaseModel):
    base_price_cents: int | None = Field(None, ge=0)
    discount_pct: Decimal | None = Field(None, ge=0, le=100)
    stripe_price_id: str | None = Field(None, max_length=255)
    is_active: bool | None = None


class AdminDiscountCreate(BaseModel):
    user_id: UUID
    discount_pct: Decimal = Field(..., ge=0, le=100)
    reason: str | None = Field(None, max_length=500)
    expires_at: datetime | None = None


class AdminDiscountOut(BaseModel):
    id: UUID
    user_id: UUID
    discount_pct: Decimal
    reason: str | None
    created_by: UUID | None
    created_at: datetime
    expires_at: datetime | None

    model_config = {"from_attributes": True}


class ExtendTrialRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=365)
