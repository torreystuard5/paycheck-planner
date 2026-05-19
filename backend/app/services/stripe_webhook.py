"""Apply Stripe webhook events to User rows."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
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

    tier = (meta.get("tier") or "pro").lower()
    period = meta.get("billing_period")
    cust_id = session.get("customer")
    sub_id = session.get("subscription")

    if cust_id:
        user.stripe_customer_id = str(cust_id)
    if sub_id:
        user.stripe_subscription_id = str(sub_id)
    if period:
        user.billing_period = str(period)
    user.subscription_tier = tier if tier in ("pro", "business", "bundle") else "pro"

    if sub_id:
        try:
            import stripe
            from app.config import settings

            if settings.STRIPE_SECRET_KEY:
                stripe.api_key = settings.STRIPE_SECRET_KEY
                sub = stripe.Subscription.retrieve(str(sub_id))
                user.subscription_status = _status_from_stripe(getattr(sub, "status", None))
                user.trial_ends_at = _dt_from_ts(getattr(sub, "trial_end", None))
                user.subscription_ends_at = _dt_from_ts(getattr(sub, "current_period_end", None))
                user.subscription_started_at = _dt_from_ts(
                    getattr(sub, "current_period_start", None)
                )
        except Exception:
            logger.exception("Stripe subscription retrieve failed after checkout")
            user.subscription_status = "trialing" if tier == "business" else "active"
    else:
        user.subscription_status = "active"

    await _save_user(db, user)


async def handle_subscription_updated(db: AsyncSession, sub: dict) -> None:
    cust = sub.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
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
    user.subscription_status = "active"
    await _save_user(db, user)


async def handle_invoice_payment_failed(db: AsyncSession, invoice: dict) -> None:
    cust = invoice.get("customer")
    if not cust:
        return
    result = await db.execute(select(User).where(User.stripe_customer_id == str(cust)))
    user = result.scalar_one_or_none()
    if not user:
        return
    user.subscription_status = "past_due"
    user.subscription_tier = "early_access"
    await _save_user(db, user)
