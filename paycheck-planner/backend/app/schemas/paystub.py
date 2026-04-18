from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PaystubUploadResponse(BaseModel):
    id: UUID
    status: str = Field(description="Client should call OCR next; mirrors processing step")


class PaystubOcrResponse(BaseModel):
    id: UUID
    ocr_status: str
    extracted: dict[str, Any]
    manual_entry_allowed: bool = True


class PaystubConfirmRequest(BaseModel):
    upload_id: UUID
    employer_name: str = Field(..., max_length=200)
    pay_period_start: date | None = None
    pay_period_end: date | None = None
    gross_pay: Decimal | None = None
    net_pay: Decimal = Field(..., max_digits=12, decimal_places=2)
    taxes_withheld: Decimal | None = None
    pay_date: date | None = None


class PaystubHistoryItem(BaseModel):
    id: UUID
    file_type: str
    ocr_status: str
    income_id: UUID | None
    created_at: str

    model_config = {"from_attributes": True}
