import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.referral import ReferralReward
from app.models.user import User
from app.schemas.referral import ReferralInfoResponse, ReferralRewardResponse
from app.services.referral_service import get_promo_end_date
from app.utils.security import get_current_user

router = APIRouter(prefix="/referrals", tags=["Referrals"])

FALLBACK_FRONTEND_URL = "https://paydrift.netlify.app"


async def _ensure_referral_code(user: User, db: AsyncSession) -> str:
    """Return the user's referral code, generating one if missing."""
    if user.referral_code:
        return user.referral_code

    for _ in range(10):
        code = secrets.token_urlsafe(6)[:8].upper()
        existing = await db.execute(
            select(User.id).where(User.referral_code == code)
        )
        if not existing.scalar_one_or_none():
            break
    else:
        code = secrets.token_urlsafe(8)[:8].upper()

    user.referral_code = code
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user.referral_code


@router.get("/me", response_model=ReferralInfoResponse)
async def get_referral_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ensure the user has a referral code (backfill for pre-existing users)
    referral_code = await _ensure_referral_code(current_user, db)

    # Count referred users
    referred_count_result = await db.execute(
        select(func.count()).select_from(User).where(
            User.referred_by_user_id == current_user.id
        )
    )
    total_referred_count = referred_count_result.scalar() or 0

    # Count applied rewards
    applied_result = await db.execute(
        select(func.count()).select_from(ReferralReward).where(
            ReferralReward.referrer_id == current_user.id,
            ReferralReward.reward_status == "applied",
        )
    )
    total_rewards_earned = applied_result.scalar() or 0

    # Count pending rewards
    pending_result = await db.execute(
        select(func.count()).select_from(ReferralReward).where(
            ReferralReward.referrer_id == current_user.id,
            ReferralReward.reward_status == "pending",
        )
    )
    pending_rewards = pending_result.scalar() or 0

    frontend_url = settings.FRONTEND_URL.split(",")[0].strip() or FALLBACK_FRONTEND_URL
    referral_link = f"{frontend_url}/register?ref={referral_code}"

    return ReferralInfoResponse(
        referral_code=referral_code,
        referral_link=referral_link,
        total_referred_count=total_referred_count,
        total_rewards_earned=total_rewards_earned,
        pending_rewards=pending_rewards,
        promo_end_date=get_promo_end_date(),
    )


@router.get("", response_model=list[ReferralRewardResponse])
async def list_referral_rewards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReferralReward)
        .where(
            (ReferralReward.referrer_id == current_user.id)
            | (ReferralReward.referred_user_id == current_user.id)
        )
        .order_by(ReferralReward.created_at.desc())
        .limit(100)
    )
    rewards = result.scalars().all()

    # Collect user IDs to fetch emails
    user_ids = set()
    for r in rewards:
        user_ids.add(r.referrer_id)
        user_ids.add(r.referred_user_id)

    users_result = await db.execute(
        select(User.id, User.email).where(User.id.in_(user_ids))
    )
    email_map = {row.id: row.email for row in users_result.all()}

    return [
        ReferralRewardResponse(
            id=r.id,
            referrer_id=r.referrer_id,
            referred_user_id=r.referred_user_id,
            referrer_email=email_map.get(r.referrer_id),
            referred_email=email_map.get(r.referred_user_id),
            reward_type=r.reward_type,
            reward_status=r.reward_status,
            created_at=r.created_at,
            applied_at=r.applied_at,
        )
        for r in rewards
    ]
