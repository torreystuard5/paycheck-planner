from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class PromoCodeApply(BaseModel):
    code: str


class PromoCodeCreate(BaseModel):
    code: str
    tier: str = "lifetime"
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None


class PromoCodeResponse(BaseModel):
    id: UUID
    code: str
    tier: str
    max_uses: Optional[int]
    current_uses: int
    is_active: bool
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SupporterStatus(BaseModel):
    is_supporter: bool
    total_donated: float
    months_banked: int
    subscription_tier: str
    promo_applied: bool
