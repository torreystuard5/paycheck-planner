from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


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
