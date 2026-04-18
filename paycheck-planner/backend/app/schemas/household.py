from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class HouseholdCreate(BaseModel):
    name: Optional[str] = None


class HouseholdJoin(BaseModel):
    invite_code: Optional[str] = None


class HouseholdMember(BaseModel):
    id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    pay_frequency: Optional[str] = None
    net_pay_amount: Optional[float] = None
    household_member_role: str = "adult"
    household_child_permissions: dict[str, Any] | None = None

    class Config:
        from_attributes = True


class HouseholdResponse(BaseModel):
    id: UUID
    name: Optional[str] = None
    split_method: Optional[str] = None
    invite_code: str
    created_by: UUID
    created_at: datetime
    members: list[HouseholdMember] = []

    class Config:
        from_attributes = True


class ActivityItem(BaseModel):
    id: UUID
    user_first_name: Optional[str] = None
    action: str
    entity_type: str
    entity_name: str
    details: Optional[str] = None
    created_at: datetime


class ActivityFeed(BaseModel):
    activities: list[ActivityItem]


class SplitMethodUpdate(BaseModel):
    split_method: Optional[str] = None


class HouseholdChoreCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    assigned_to: UUID | None = None
    due_date: date | None = None
    recurring: str | None = Field(None, pattern="^(daily|weekly|monthly)$")


class HouseholdChoreUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    assigned_to: UUID | None = None
    due_date: date | None = None
    recurring: str | None = Field(None, pattern="^(daily|weekly|monthly)$")
    status: str | None = Field(None, pattern="^(pending|completed)$")


class HouseholdChoreOut(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    assigned_to: UUID | None = None
    due_date: date | None = None
    status: str
    recurring: str | None = None
    created_by: UUID | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseholdChoreListResponse(BaseModel):
    items: list[HouseholdChoreOut]


class MemberRoleUpdate(BaseModel):
    member_role: str = Field(..., pattern="^(adult|child)$")


class ChildPermissionsUpdate(BaseModel):
    can_view_bills: bool | None = None
    can_view_amounts: bool | None = None
    can_view_invite_code: bool | None = None


class ShoppingItemCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=500)


class ShoppingItemUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=500)
    is_purchased: bool | None = None


class ShoppingItemOut(BaseModel):
    id: UUID
    label: str
    is_purchased: bool
    purchased_at: datetime | None = None
    purchased_by_user_id: UUID | None = None
    created_by_user_id: UUID | None = None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ShoppingListResponse(BaseModel):
    items: list[ShoppingItemOut]
