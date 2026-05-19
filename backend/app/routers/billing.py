import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.pricing_config import PricingConfig
from app.models.user import User
from app.schemas.billing_stripe import (
    CheckoutRequest,
    CheckoutResponse,
    PlansResponse,
    PortalResponse,
    PricingPeriodOut,
    SubscriptionInfoResponse,
)
from app.schemas.referral import BillingActivateRequest, BillingActivateResponse
from app.services.billing_plans import build_plans_payload
from app.services.referral_service import apply_referral_reward
from app.services import stripe_webhook as stripe_wh
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])


def _stripe_configured() -> bool:
    key = getattr(settings, "STRIPE_SECRET_KEY", None)
    return bool(key and len(str(key)) > 10)


def _frontend_base() -> str:
    raw = (settings.FRONTEND_URL or "http://localhost:5173").split(",")[0].strip()
    return raw.rstrip("/")


@router.get("/plans", response_model=PlansResponse)
async def get_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = await build_plans_payload(db, current_user.id)

    def pack(tier: str) -> dict[str, PricingPeriodOut]:
        d = raw.get(tier, {})
        out = {}
        for period, v in d.items():
            out[period] = PricingPeriodOut(
                price_cents=v["price_cents"],
                discount_pct=float(v["discount_pct"]),
                user_discount_pct=float(v["user_discount_pct"]),
                stripe_price_id=v.get("stripe_price_id"),
            )
        return out

    return PlansResponse(
        pro=pack("pro"),
        business=pack("business"),
        bundle=pack("bundle"),
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _stripe_configured():
        return CheckoutResponse(
            url=None,
            message="Stripe not configured",
            stripe_configured=False,
        )
    result = await db.execute(
        select(PricingConfig).where(
            PricingConfig.tier == body.tier,
            PricingConfig.billing_period == body.billing_period,
            PricingConfig.is_active.is_(True),
        )
    )
    row = result.scalar_one_or_none()
    if not row or not row.stripe_price_id:
        return CheckoutResponse(
            url=None,
            message="Stripe price not configured for this plan. Add a Price ID in Command Center.",
            stripe_configured=True,
        )
    try:
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        trial_days = 7 if body.tier == "business" else None
        sub_data = {}
        if trial_days:
            sub_data["trial_period_days"] = trial_days

        kwargs = dict(
            mode="subscription",
            customer_email=current_user.email,
            client_reference_id=str(current_user.id),
            line_items=[{"price": row.stripe_price_id, "quantity": 1}],
            success_url=f"{_frontend_base()}/upgrade?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{_frontend_base()}/upgrade?canceled=1",
            metadata={
                "user_id": str(current_user.id),
                "tier": body.tier,
                "billing_period": body.billing_period,
            },
        )
        if sub_data:
            kwargs["subscription_data"] = sub_data
        session = stripe.checkout.Session.create(**kwargs)
        return CheckoutResponse(url=session.url, message=None, stripe_configured=True)
    except Exception as e:
        logger.exception("Stripe checkout failed")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not getattr(settings, "STRIPE_WEBHOOK_SECRET", None):
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing stripe-signature")
    try:
        import stripe

        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.warning("Webhook signature failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid signature") from e

    etype = event["type"]
    data = event["data"]["object"]

    try:
        if etype == "checkout.session.completed":
            await stripe_wh.handle_checkout_completed(db, data)
        elif etype == "customer.subscription.updated":
            await stripe_wh.handle_subscription_updated(db, data)
        elif etype == "customer.subscription.deleted":
            await stripe_wh.handle_subscription_deleted(db, data)
        elif etype == "invoice.paid":
            await stripe_wh.handle_invoice_paid(db, data)
        elif etype == "invoice.payment_failed":
            await stripe_wh.handle_invoice_payment_failed(db, data)
    except Exception:
        logger.exception("Webhook handler failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed") from None

    return {"received": True}


@router.get("/subscription", response_model=SubscriptionInfoResponse)
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.refresh(current_user)
    return SubscriptionInfoResponse(
        subscription_tier=current_user.subscription_tier or "early_access",
        subscription_status=getattr(current_user, "subscription_status", None) or "none",
        billing_period=getattr(current_user, "billing_period", None),
        trial_ends_at=getattr(current_user, "trial_ends_at", None),
        subscription_started_at=getattr(current_user, "subscription_started_at", None),
        subscription_ends_at=getattr(current_user, "subscription_ends_at", None),
        next_billing_date=current_user.next_billing_date,
        stripe_customer_id=getattr(current_user, "stripe_customer_id", None),
        has_stripe_subscription=bool(getattr(current_user, "stripe_subscription_id", None)),
    )


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe not configured")
    sid = getattr(current_user, "stripe_subscription_id", None)
    if not sid:
        raise HTTPException(status_code=400, detail="No active Stripe subscription")
    try:
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        stripe.Subscription.modify(sid, cancel_at_period_end=True)
        await db.flush()
        return {
            "message": "Subscription will cancel at the end of the current billing period."
        }
    except Exception as e:
        logger.exception("cancel subscription")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/portal", response_model=PortalResponse)
async def billing_portal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _stripe_configured():
        return PortalResponse(url=None, message="Stripe not configured")
    cid = getattr(current_user, "stripe_customer_id", None)
    if not cid:
        return PortalResponse(url=None, message="No Stripe customer on file yet.")
    try:
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        session = stripe.billing_portal.Session.create(
            customer=cid,
            return_url=f"{_frontend_base()}/settings",
        )
        return PortalResponse(url=session.url, message=None)
    except Exception as e:
        logger.exception("portal session")
        return PortalResponse(url=None, message=str(e))


@router.post("/activate-plan", response_model=BillingActivateResponse)
async def activate_plan(
    body: BillingActivateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.subscription_tier = body.plan

    now = datetime.now(timezone.utc)
    if not current_user.next_billing_date:
        current_user.next_billing_date = now + timedelta(days=30)

    await apply_referral_reward(current_user, db)

    await db.flush()
    await db.refresh(current_user)

    return BillingActivateResponse(
        message="Plan activated successfully",
        subscription_tier=current_user.subscription_tier,
        next_billing_date=current_user.next_billing_date,
        free_month_credits=current_user.free_month_credits,
    )
