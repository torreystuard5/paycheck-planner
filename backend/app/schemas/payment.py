from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class PaymentCreate(BaseModel):
    bill_id: UUID | None = None
    debt_id: UUID | None = None
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    paid_date: date
    pay_period_date: date
    is_extra: bool = False

    @model_validator(mode="after")
    def exactly_one_target(self):
        if self.bill_id and self.debt_id:
            raise ValueError("Provide either bill_id or debt_id, not both")
        if not self.bill_id and not self.debt_id:
            raise ValueError("Either bill_id or debt_id is required")
        return self


class PaymentResponse(BaseModel):
    id: UUID
    user_id: UUID
    bill_id: UUID | None
    debt_id: UUID | None
    amount: Decimal
    paid_date: date
    pay_period_date: date
    is_extra: bool
    created_at: datetime

    model_config = {"from_attributes": True}
