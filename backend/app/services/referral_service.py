import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referral import ReferralReward
from app.models.user import User


def is_promo_active() -> bool:
    """Return True if the current date falls within the referral promo window."""
    start_str = os.environ.get("REFERRAL_PROMO_START")
    end_str = os.environ.get("REFERRAL_PROMO_END")
    if not start_str or not end_str:
        return False
    try:
        promo_start = date.fromisoformat(start_str)
        promo_end = date.fromisoformat(end_str)
    except ValueError:
        return False
    return promo_start <= date.today() <= promo_end


def get_promo_end_date() -> str | None:
    """Return the promo end date string from env, or None."""
    return os.environ.get("REFERRAL_PROMO_END") or None


async def apply_referral_reward(referred_user: User, db: AsyncSession) -> None:
    """Apply referral reward when a referred user activates a paid plan.

    - Gives the referred user 1 free month (extends next_billing_date).
    - Marks the pending ReferralReward as applied.
    - Gives the referrer +1 free_month_credits.
    - Idempotent: skips if reward already applied.
    """
    if not referred_user.referred_by_user_id:
        return

    if not is_promo_active():
        return

    # Find the pending reward for this pair
    result = await db.execute(
        select(ReferralReward).where(
            ReferralReward.referred_user_id == referred_user.id,
            ReferralReward.referrer_id == referred_user.referred_by_user_id,
            ReferralReward.reward_status == "pending",
        )
    )
    reward = result.scalar_one_or_none()
    if not reward:
        return

    now = datetime.now(timezone.utc)

    # Give referred user 1 free month
    if referred_user.next_billing_date:
        referred_user.next_billing_date = referred_user.next_billing_date + timedelta(days=30)
    else:
        referred_user.next_billing_date = now + timedelta(days=30)

    # Mark reward as applied
    reward.reward_status = "applied"
    reward.applied_at = now

    # Give referrer +1 free_month_credits
    referrer_result = await db.execute(
        select(User).where(User.id == referred_user.referred_by_user_id)
    )
    referrer = referrer_result.scalar_one_or_none()
    if referrer:
        referrer.free_month_credits = (referrer.free_month_credits or 0) + 1

    await db.flush()
