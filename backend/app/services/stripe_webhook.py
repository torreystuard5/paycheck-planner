"""Apply Stripe webhook events to User rows."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.pricing_config import PricingConfig
from app.services.tier_access import sync_app_mode_to_subscription

logger = logging.getLogger(__name__)


def _status_from_stripe(stripe_status: str | None) -> str:
    s = (stripe_status or "").lower()
    if s == "trialing":
        return "trialing"
    if s == "active":
        return "active"
    if s in ("past_due", "unpaid"):
        return "past_due"
    if s in ("canceled", "cancelled", "incomplete_expired"):
        return "canceled"
    return "none"


def _dt_from_ts(ts: int | None):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


async def _restore_paid_plan(db: AsyncSession, user: User, sub: dict) -> None:
    """Recover entitlements only from a known Stripe price on the current subscription."""
    prices = [item.get("price", {}).get("id") for item in sub.get("items", {}).get("data", [])]
    prices = [price for price in prices if price]
    if not prices:
        raise ValueError("Subscription has no price IDs; cannot restore paid plan")
    result = await db.execute(select(PricingConfig).where(PricingConfig.stripe_price_id.in_(prices), PricingConfig.is_active.is_(True)))
    plans = list(result.scalars().all())
    tiers = {plan.tier for plan in plans if plan.tier in ("pro", "business", "bundle")}
    if len(tiers) != 1:
        raise ValueError("Subscription price does not identify a unique paid plan")
    user.subscription_tier = tiers.pop()
    user.billing_period = plans[0].billing_period


async def _save_user(db: AsyncSession, user: User) -> None:
    if sync_app_mode_to_subscription(user):
        db.add(user)
    await db.flush()


async def handle_checkout_completed(db: AsyncSession, session: dict) -> None:
    meta = session.get("metadata") or {}
    uid_raw = meta.get("user_id")
    if not uid_raw:
        logger.warning("checkout.session.completed missing user_id metadata")
        return
    try:
        uid = UUID(str(uid_raw))
    except ValueError:
        return
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        return

    if session.get("mode") != "subscription" or session.get("status") != "complete":
        return
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        return
    cust_id, sub_id = session.get("customer"), session.get("subscription")
    if not cust_id or not sub_id:
        return
    import asyncio
    import stripe
    from app.config import settings

    if not settings.STRIPE_SECRET_KEY:
        raise ValueError("Stripe is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    sub = await asyncio.to_thread(stripe.Subscription.retrieve, str(sub_id))
    if str(sub.get("customer")) != str(cust_id) or str(sub.get("id")) != str(sub_id):
        raise ValueError("Checkout subscription identity mismatch")
    if sub.get("status") not in ("active", "trialing"):
        return
    await _restore_paid_plan(db, user, sub)
    user.stripe_customer_id = str(cust_id)
    user.stripe_subscription_id = str(sub_id)
    user.subscription_status = _status_from_stripe(sub.get("status"))
    user.trial_ends_at = _dt_from_ts(sub.get("trial_end"))
    user.subscription_ends_at = _dt_from_ts(sub.get("current_period_end"))
    user.subscription_started_at = _dt_from_ts(sub.get("current_period_start"))

    await _save_user(db, user)


async def handle_subscription_updated(db: AsyncSession, sub: dict) -> None:
    cust = sub.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
        return

    if user.stripe_subscription_id and str(sub.get("id")) != user.stripe_subscription_id:
        return
    st = _status_from_stripe(sub.get("status"))
    user.stripe_subscription_id = (
        str(sub.get("id")) if sub.get("id") else user.stripe_subscription_id
    )
    user.trial_ends_at = _dt_from_ts(sub.get("trial_end"))
    user.subscription_ends_at = _dt_from_ts(sub.get("current_period_end"))
    user.subscription_started_at = (
        _dt_from_ts(sub.get("current_period_start")) or user.subscription_started_at
    )

    if st == "canceled":
        user.subscription_tier = "early_access"
        user.subscription_status = "none"
        user.stripe_subscription_id = None
        user.billing_period = None
    elif st == "past_due":
        user.subscription_tier = "early_access"
        user.subscription_status = "past_due"
    else:
        if st in ("active", "trialing"):
            await _restore_paid_plan(db, user, sub)
        else:
            user.subscription_tier = "early_access"
        user.subscription_status = st

    await _save_user(db, user)


async def handle_subscription_deleted(db: AsyncSession, sub: dict) -> None:
    cust = sub.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
        return
    if user.stripe_subscription_id != str(sub.get("id")):
        return
    user.stripe_subscription_id = None
    user.subscription_status = "none"
    user.subscription_tier = "early_access"
    user.billing_period = None
    await _save_user(db, user)


async def handle_invoice_paid(db: AsyncSession, invoice: dict) -> None:
    cust = invoice.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
        return
    subscription_id = invoice.get("subscription") or (
        invoice.get("parent", {}).get("subscription_details", {}).get("subscription")
    )
    if not subscription_id or str(subscription_id) != user.stripe_subscription_id:
        return
    import asyncio
    import stripe
    from app.config import settings

    stripe.api_key = settings.STRIPE_SECRET_KEY
    sub = await asyncio.to_thread(stripe.Subscription.retrieve, str(subscription_id))
    if sub.get("status") not in ("active", "trialing"):
        return
    await _restore_paid_plan(db, user, sub)
    user.subscription_status = _status_from_stripe(sub.get("status"))
    await _save_user(db, user)


async def handle_invoice_payment_failed(db: AsyncSession, invoice: dict) -> None:
    cust = invoice.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
        return
    subscription_id = invoice.get("subscription") or (
        invoice.get("parent", {}).get("subscription_details", {}).get("subscription")
    )
    if not subscription_id or str(subscription_id) != user.stripe_subscription_id:
        return
    user.subscription_status = "past_due"
    user.subscription_tier = "early_access"
    await _save_user(db, user)
