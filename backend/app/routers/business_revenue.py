"""Business customer payments scaffold (Stripe Connect wiring later)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business_payment_request import BusinessPaymentRequest
from app.models.user import User
from app.services.business_context import BusinessContext, get_business_ctx

router = APIRouter(prefix="/business/revenue", tags=["Business Revenue"])


class PaymentRequestCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    description: str | None = Field(None, max_length=500)
    customer_id: UUID | None = None
    due_date: date | None = None


class PaymentRequestResponse(BaseModel):
    id: UUID
    amount: Decimal
    description: str | None
    status: str
    stripe_payment_link_url: str | None
    due_date: date | None

    model_config = {"from_attributes": True}


@router.get("/payment-requests", response_model=list[PaymentRequestResponse])
async def list_payment_requests(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require_owner()
    r = await db.execute(
        select(BusinessPaymentRequest)
        .where(BusinessPaymentRequest.user_id == ctx.owner_id)
        .order_by(BusinessPaymentRequest.created_at.desc())
    )
    return list(r.scalars().all())


@router.post("/payment-requests", response_model=PaymentRequestResponse, status_code=201)
async def create_payment_request(
    body: PaymentRequestCreate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require_owner()
    row = BusinessPaymentRequest(
        user_id=ctx.owner_id,
        customer_id=body.customer_id,
        amount=body.amount,
        description=body.description,
        due_date=body.due_date,
        status="draft",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.post("/payment-requests/{request_id}/send")
async def send_payment_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    """Placeholder: marks sent; Stripe Payment Link integration pending."""
    ctx.require_owner()
    r = await db.execute(
        select(BusinessPaymentRequest).where(
            BusinessPaymentRequest.id == request_id,
            BusinessPaymentRequest.user_id == ctx.owner_id,
        )
    )
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    row.status = "sent"
    row.stripe_payment_link_url = None
    await db.flush()
    return {
        "id": str(row.id),
        "status": row.status,
        "message": "Scaffold only — Stripe payment link generation not yet connected.",
    }
