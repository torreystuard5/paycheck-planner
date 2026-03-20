from decimal import Decimal
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.supporter import Supporter
from app.models.promo_code import PromoCode
from app.models.user import User


async def process_kofi_donation(data: dict, db: AsyncSession) -> dict:
    """
    Parse Ko-fi webhook payload and process donation.

    Ko-fi sends: email, amount, type, transaction_id, message, from_name

    Month calculation:
    - If amount >= 20: months = (amount // 20) * 5 + ((amount % 20) // 5)
    - Else: months = amount // 5
    - Minimum 0 months for donations under $5
    """
    email = data.get("email", "").strip().lower()
    raw_amount = data.get("amount", "0")
    transaction_id = data.get("message_id") or data.get("transaction_id", "")

    try:
        amount = Decimal(str(raw_amount))
    except (ValueError, TypeError):
        amount = Decimal("0")

    amount_int = int(amount)

    if amount_int >= 20:
        months = (amount_int // 20) * 5 + ((amount_int % 20) // 5)
    else:
        months = amount_int // 5

    months = max(months, 0)

    # Find user by email if registered
    user = None
    if email:
        result = await db.execute(select(User).where(func.lower(User.email) == email))
        user = result.scalar_one_or_none()

    # Create Supporter record
    supporter = Supporter(
        user_id=user.id if user else None,
        ko_fi_transaction_id=str(transaction_id) if transaction_id else None,
        donation_amount=amount,
        months_credited=months,
    )
    db.add(supporter)

    # Update user if found
    if user:
        user.supporter_months_banked = (user.supporter_months_banked or 0) + months
        user.is_supporter = True

    await db.commit()

    return {
        "status": "ok",
        "email": email,
        "amount": float(amount),
        "months_credited": months,
        "user_found": user is not None,
    }


async def apply_promo_code(code: str, user: User, db: AsyncSession) -> dict:
    """
    Apply promo code to user account.

    Validations:
    - Code exists
    - is_active = True
    - Not expired (expires_at is null or > now)
    - Under max_uses (max_uses is null or current_uses < max_uses)
    """
    result = await db.execute(
        select(PromoCode).where(func.lower(PromoCode.code) == code.strip().lower())
    )
    promo = result.scalar_one_or_none()

    if not promo:
        raise ValueError("Invalid promo code.")

    if not promo.is_active:
        raise ValueError("This promo code is no longer active.")

    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        raise ValueError("This promo code has expired.")

    if promo.max_uses is not None and promo.current_uses >= promo.max_uses:
        raise ValueError("This promo code has reached its usage limit.")

    # Apply the promo code
    if promo.tier == "lifetime":
        user.subscription_tier = "lifetime"
    else:
        user.subscription_tier = "pro"

    user.promo_code_id = promo.id
    promo.current_uses = (promo.current_uses or 0) + 1

    await db.commit()

    return {
        "status": "ok",
        "tier": promo.tier,
        "message": f"Promo code applied! You now have {promo.tier} access.",
    }


async def create_promo_code(
    code: str,
    tier: str,
    max_uses: int | None,
    expires_at: datetime | None,
    db: AsyncSession,
) -> PromoCode:
    """Admin function to create promo codes."""
    promo = PromoCode(
        code=code.strip().upper(),
        tier=tier,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


async def get_supporter_status(user: User, db: AsyncSession) -> dict:
    """
    Return: is_supporter, total_donated, months_banked, subscription_tier, promo_applied (bool)
    """
    result = await db.execute(
        select(func.coalesce(func.sum(Supporter.donation_amount), 0)).where(
            Supporter.user_id == user.id
        )
    )
    total_donated = float(result.scalar_one())

    return {
        "is_supporter": bool(user.is_supporter),
        "total_donated": total_donated,
        "months_banked": user.supporter_months_banked or 0,
        "subscription_tier": user.subscription_tier or "early_access",
        "promo_applied": user.promo_code_id is not None,
    }


async def list_promo_codes(db: AsyncSession) -> list:
    """Return all promo codes with usage stats."""
    result = await db.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))
    return list(result.scalars().all())
