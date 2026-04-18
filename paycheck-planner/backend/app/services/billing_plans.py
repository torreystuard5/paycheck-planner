"""Load pricing_config rows and compute effective prices with user discounts."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pricing_config import PricingConfig
from app.models.user_discount import UserDiscount


async def max_active_user_discount_pct(db: AsyncSession, user_id) -> float:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserDiscount.discount_pct).where(
            UserDiscount.user_id == user_id,
            or_(UserDiscount.expires_at.is_(None), UserDiscount.expires_at > now),
        )
    )
    vals = [float(x) for x in result.scalars().all()]
    return max(vals) if vals else 0.0


def _apply_discounts(base_cents: int, period_pct: float, user_pct: float) -> int:
    b = Decimal(base_cents)
    after_period = b * (Decimal(1) - Decimal(str(period_pct)) / Decimal(100))
    after_user = after_period * (Decimal(1) - Decimal(str(user_pct)) / Decimal(100))
    return max(int(after_user.quantize(Decimal("1"))), 0)


async def build_plans_payload(db: AsyncSession, user_id) -> dict:
    result = await db.execute(
        select(PricingConfig).where(PricingConfig.is_active.is_(True)).order_by(
            PricingConfig.tier, PricingConfig.billing_period
        )
    )
    rows = list(result.scalars().all())
    user_disc = await max_active_user_discount_pct(db, user_id)

    out: dict[str, dict] = {"pro": {}, "business": {}, "bundle": {}}
    for r in rows:
        tier = (r.tier or "").lower()
        if tier not in out:
            continue
        period = r.billing_period
        period_pct = float(r.discount_pct or 0)
        price = _apply_discounts(int(r.base_price_cents or 0), period_pct, user_disc)
        out[tier][period] = {
            "price_cents": price,
            "discount_pct": period_pct,
            "user_discount_pct": user_disc,
            "stripe_price_id": r.stripe_price_id,
        }
    return out
