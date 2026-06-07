from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AdminPasswordResetRequest(BaseModel):
    """Admin-only: set a user's password directly (no email)."""

    user_id: UUID
    new_password: str = Field(..., min_length=8, max_length=128)


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
    open_support_tickets: int = 0
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
    last_login_at: datetime | None = None
    account_status: str = "active"
    status: str = "Active"
    admin_locked: bool = False
    business_access_state: str | None = None
    has_feature_override: bool = False

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
    app_mode: str | None = "personal"
    business_trial_started_at: datetime | None = None
    business_trial_ends_at: datetime | None = None
    business_trial_consumed: bool = False
    business_access_granted_until: datetime | None = None
    subscription_status: str | None = None

    model_config = {"from_attributes": True}


class AdminBusinessAccessUpdate(BaseModel):
    """Admin grant/extend Business access or trial."""

    extend_trial_days: int | None = Field(None, ge=0, le=365)
    grant_access_until: datetime | None = None
    reset_trial: bool = False
    clear_trial: bool = False


class AdminUserStatusUpdate(BaseModel):
    account_status: str = Field(..., pattern="^(active|suspended|closed)$")
    reason: str | None = None


class AdminUserNotesUpdate(BaseModel):
    admin_notes: str | None = None


class AdminUserEmailUpdate(BaseModel):
    email: EmailStr


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None


class AdminSubscriptionTierUpdate(BaseModel):
    subscription_tier: str = Field(
        ...,
        pattern="^(early_access|pro|business|bundle|lifetime)$",
    )


# --- Household List Schemas ---


class AdminHouseholdSummary(BaseModel):
    id: UUID
    name: str | None
    split_method: str
    invite_code: str
    created_by: UUID
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class AdminHouseholdListResponse(BaseModel):
    households: list[AdminHouseholdSummary]
    total: int
    page: int
    per_page: int


# --- Audit Log Schemas ---


class AuditLogOut(BaseModel):
    id: int
    admin_id: UUID
    admin_email: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    target: str | None = None
    details: str | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    per_page: int


# --- Announcement Schemas ---


class AnnouncementCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    expires_at: datetime | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    message: str | None = None
    type: str | None = None
    is_active: bool | None = None
    expires_at: datetime | None = None


class AnnouncementOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_active: bool
    created_by: UUID
    created_at: datetime
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- System Settings Schemas ---


class SystemSettingOut(BaseModel):
    key: str
    value: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class SystemSettingUpdate(BaseModel):
    value: str
