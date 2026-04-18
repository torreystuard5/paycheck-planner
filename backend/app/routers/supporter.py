import json
import os

from fastapi import APIRouter, Depends, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.supporter import (
    PromoCodeApply,
    PromoCodeCreate,
    PromoCodeResponse,
    SupporterStatus,
)
from app.services.supporter_service import (
    apply_promo_code,
    create_promo_code,
    get_supporter_status,
    list_promo_codes,
    process_kofi_donation,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/supporter", tags=["supporter"])

ADMIN_EMAIL = os.getenv("SUPPORT_EMAIL", "spsoftwaresolutionsllc@gmail.com")


@router.post("/kofi-webhook")
async def kofi_webhook(
    data: str = Form(default="{}"),
    db: AsyncSession = Depends(get_db),
):
    """
    Public Ko-fi webhook endpoint — no auth required.
    Ko-fi sends form data with a 'data' field containing a JSON string.
    Always returns 200 OK. Never crashes on malformed data.
    """
    try:
        payload = json.loads(data)
        result = await process_kofi_donation(payload, db)
        return result
    except Exception:
        return {"status": "ok"}


@router.get("/status", response_model=SupporterStatus)
async def supporter_status(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get supporter status for the current user."""
    return await get_supporter_status(current_user, db)


@router.post("/apply-promo", response_model=SupporterStatus)
async def apply_promo(
    body: PromoCodeApply,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply a promo code to the current user's account."""
    try:
        await apply_promo_code(body.code, current_user, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return await get_supporter_status(current_user, db)


@router.post("/create-promo", response_model=PromoCodeResponse)
async def create_promo(
    body: PromoCodeCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: Create a new promo code."""
    if current_user.email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return await create_promo_code(
        code=body.code,
        tier=body.tier,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
        db=db,
    )


@router.get("/promo-codes", response_model=list[PromoCodeResponse])
async def get_promo_codes(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: List all promo codes."""
    if current_user.email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return await list_promo_codes(db)
