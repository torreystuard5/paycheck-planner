from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ChecklistToggle(BaseModel):
    item_type: str  # "bill" or "debt"
    item_id: UUID
    pay_period_start: date
    is_checked: bool


class ChecklistItemOut(BaseModel):
    id: int
    item_type: str
    item_id: UUID
    pay_period_start: date
    is_checked: bool
    checked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
