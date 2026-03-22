from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class SignupDay(BaseModel):
    date: date
    count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_active_users_30d: int
    total_pro_subscribers: int
    total_free_users: int
    total_households: int
    total_support_tickets: int
    signups_last_7_days: list[SignupDay]


class AdminUserSummary(BaseModel):
    id: UUID
    email: str
    first_name: str
    last_name: str
    created_at: datetime
    is_admin: bool
    is_active: bool
    is_supporter: bool
    subscription_tier: str
    referral_code: str | None

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    users: list[AdminUserSummary]
    total: int
    page: int
    per_page: int


class AdminToggleRequest(BaseModel):
    is_admin: bool


class AdminUserDetailResponse(BaseModel):
    id: UUID
    email: str
    first_name: str
    last_name: str
    currency: str
    date_format: str
    pay_frequency: str | None
    next_pay_date: date | None
    net_pay_amount: Decimal | None
    household_id: UUID | None
    is_active: bool
    is_admin: bool
    is_supporter: bool
    subscription_tier: str
    supporter_months_banked: int
    referral_code: str | None
    referred_by_user_id: UUID | None
    free_month_credits: int
    next_billing_date: datetime | None
    tos_accepted_at: datetime | None = None
    tos_version: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
