from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BudgetBase(BaseModel):
    name: str = Field(max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=20)
    is_archived: bool = False


class BudgetCreate(BudgetBase):
    household_id: Optional[UUID] = None


class BudgetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=20)
    is_archived: Optional[bool] = None


class BudgetResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    is_default: bool = False
    is_archived: bool = False
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
