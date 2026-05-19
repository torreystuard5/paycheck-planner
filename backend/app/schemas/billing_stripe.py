from datetime import datetime
from decimal import Decimal
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
