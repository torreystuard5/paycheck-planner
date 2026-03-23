from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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
    last_login_at: datetime | None = None
    failed_login_count: int = 0
    account_status: str = "active"
    account_status_reason: str | None = None
    admin_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserStatusUpdate(BaseModel):
    account_status: str = Field(..., pattern="^(active|suspended|closed)$")
    reason: str | None = None


class AdminUserNotesUpdate(BaseModel):
    admin_notes: str | None = None


class AdminUserEmailUpdate(BaseModel):
    email: EmailStr


class SupportRequestResponse(BaseModel):
    id: int
    email: str
    message: str | None = None
    cant_access_email: bool = False
    status: str = "open"
    admin_notes: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}


class SupportRequestListResponse(BaseModel):
    requests: list[SupportRequestResponse]
    total: int
    page: int
    per_page: int


class SupportRequestUpdate(BaseModel):
    status: str | None = Field(None, pattern="^(open|in_progress|resolved)$")
    admin_notes: str | None = None
