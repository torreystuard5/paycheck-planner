"""Validate document link targets belong to the current user."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def validate_personal_link_target(
    db: AsyncSession,
    user: User,
    entity_type: str,
    entity_id: UUID,
) -> None:
    if entity_type == "tax_deduction":
        from app.models.tax_deduction import TaxDeduction

        row = (
            await db.execute(
                select(TaxDeduction).where(
                    TaxDeduction.id == entity_id,
                    TaxDeduction.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Tax deduction not found")
        return

    if entity_type == "bill":
        from app.models.bill import Bill

        row = (
            await db.execute(
                select(Bill).where(Bill.id == entity_id, Bill.user_id == user.id)
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Bill not found")
        return

    if entity_type == "debt":
        from app.models.debt import Debt

        row = (
            await db.execute(
                select(Debt).where(Debt.id == entity_id, Debt.user_id == user.id)
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Debt not found")
        return

    if entity_type == "paycheck_entry":
        from app.models.paycheck_entry import PaycheckEntry

        row = (
            await db.execute(
                select(PaycheckEntry).where(
                    PaycheckEntry.id == entity_id,
                    PaycheckEntry.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Paycheck entry not found")
        return

    raise HTTPException(status_code=400, detail="Invalid entity type")


async def validate_business_link_target(
    db: AsyncSession,
    owner_id: UUID,
    entity_type: str,
    entity_id: UUID,
) -> None:
    if entity_type == "business_deduction":
        from app.models.business import BusinessDeduction

        row = (
            await db.execute(
                select(BusinessDeduction).where(
                    BusinessDeduction.id == entity_id,
                    BusinessDeduction.user_id == owner_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Deduction not found")
        return

    raise HTTPException(status_code=400, detail="Invalid entity type")
