from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class MemberIncomeLine(BaseModel):
    member_id: UUID
    member_name: str
    monthly_income: Decimal
    sources: list[dict]


class BillLine(BaseModel):
    id: UUID
    name: str
    item_type: str = "bill"
    amount: Decimal
    user_share: Decimal
    due_date: date | None
    is_paid: bool
    assigned_member_id: UUID | None
    assigned_member_name: str | None
    is_household_bill: bool = False


class PersonBillsGroup(BaseModel):
    member_id: UUID
    member_name: str
    bills: list[BillLine]
    total: Decimal
    paid_total: Decimal


class HouseholdFinancialOverviewResponse(BaseModel):
    budget_id: UUID | None
    household_id: UUID
    combined_income: Decimal
    combined_bills_total: Decimal
    combined_remaining: Decimal
    member_income: list[MemberIncomeLine]
    my_bills: list[BillLine]
    by_person: list[PersonBillsGroup]
    combined_bills_list: list[BillLine]
    per_person_remaining: list[dict]
