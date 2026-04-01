from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    pay_frequency: str = Field(..., pattern="^(weekly|biweekly|semi_monthly|monthly)$")
    next_pay_date: date
    net_pay_amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(default="USD", max_length=3)
    ref: str | None = Field(default=None, max_length=10)
    tos_accepted: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    first_name: str
    last_name: str
    currency: str
    date_format: str = "MM/DD/YYYY"
    pay_frequency: str
    next_pay_date: date
    net_pay_amount: Decimal
    household_id: UUID | None
    is_active: bool
    is_admin: bool = False
    is_supporter: bool = False
    subscription_tier: str = "early_access"
    tos_accepted_at: datetime | None = None
    tos_version: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None
    pay_frequency: str | None = Field(None, pattern="^(weekly|biweekly|semi_monthly|monthly)$")
    next_pay_date: date | None = None
    net_pay_amount: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    currency: str | None = Field(None, max_length=3)


class UserDateFormatUpdate(BaseModel):
    date_format: str = Field(..., pattern="^(MM/DD/YYYY|DD/MM/YYYY|YYYY-MM-DD)$")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False
