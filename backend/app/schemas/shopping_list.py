from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ShoppingListItemCreate(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=200)
    quantity: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class ShoppingListItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    is_completed: Optional[bool] = None


class ShoppingListItemOut(BaseModel):
    id: UUID
    household_id: UUID
    item_name: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    is_completed: bool
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShoppingListResponse(BaseModel):
    items: list[ShoppingListItemOut]
