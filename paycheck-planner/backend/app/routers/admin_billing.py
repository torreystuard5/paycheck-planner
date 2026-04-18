import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.pricing_config import PricingConfig
from app.models.user import User
from app.models.user_discount import UserDiscount
from app.routers.admin import _get_client_ip, log_admin_action
from app.schemas.billing_stripe import AdminDiscountCreate, AdminDiscountOut, AdminPricingPatch
from app.utils.security import get_current_user

router = APIRouter(prefix="/admin/billing", tags=["Admin Billing"])


def _admin(current_user: User) -> None:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/pricing", response_model=list[dict])
async def list_pricing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin(current_user)
    result = await db.execute(select(PricingConfig).order_by(PricingConfig.tier, PricingConfig.billing_period))
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "tier": r.tier,
            "billing_period": r.billing_period,
            "base_price_cents": r.base_price_cents,
            "discount_pct": float(r.discount_pct or 0),
            "stripe_price_id": r.stripe_price_id,
            "is_active": r.is_active,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.patch("/pricing/{pricing_id}", response_model=dict)
async def patch_pricing(
    pricing_id: UUID,
    body: AdminPricingPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin(current_user)
    result = await db.execute(select(PricingConfig).where(PricingConfig.id == pricing_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Pricing row not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.flush()
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_pricing_config",
        target_type="pricing_config",
        target_id=str(pricing_id),
        details=json.dumps(data),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    return {"ok": True, "id": str(row.id)}


@router.get("/discounts", response_model=list[AdminDiscountOut])
async def list_discounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin(current_user)
    result = await db.execute(select(UserDiscount).order_by(UserDiscount.created_at.desc()))
    return list(result.scalars().all())


@router.post("/discounts", response_model=AdminDiscountOut, status_code=status.HTTP_201_CREATED)
async def create_discount(
    body: AdminDiscountCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin(current_user)
    ures = await db.execute(select(User).where(User.id == body.user_id))
    if not ures.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    row = UserDiscount(
        user_id=body.user_id,
        discount_pct=body.discount_pct,
        reason=body.reason,
        created_by=current_user.id,
        expires_at=body.expires_at,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="created_user_discount",
        target_type="user",
        target_id=str(body.user_id),
        details=json.dumps({"discount_pct": str(body.discount_pct), "reason": body.reason}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
    return row


@router.delete("/discounts/{discount_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount(
    discount_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin(current_user)
    result = await db.execute(select(UserDiscount).where(UserDiscount.id == discount_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Discount not found")
    uid = row.user_id
    await db.delete(row)
    await db.flush()
    log_admin_action(
        db,
        admin_id=current_user.id,
        action="deleted_user_discount",
        target_type="user",
        target_id=str(uid),
        details=json.dumps({"discount_id": str(discount_id)}),
        ip_address=_get_client_ip(request),
    )
    await db.flush()
