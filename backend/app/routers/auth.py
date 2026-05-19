import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.utils.email import normalize_email
from app.models.referral import ReferralReward
from app.models.user import User
from app.schemas.user import TokenResponse, UserCreate, UserDateFormatUpdate, UserLogin, UserResponse, UserUpdate
from app.services.tier_access import sync_app_mode_to_subscription
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _generate_referral_code() -> str:
    """Generate an 8-character URL-safe uppercase alphanumeric referral code."""
    return secrets.token_urlsafe(6)[:8].upper()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    if not user_data.tos_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the Terms of Service to create an account.",
        )

    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Look up referrer if ref code provided
    referrer = None
    if user_data.ref:
        ref_result = await db.execute(
            select(User).where(User.referral_code == user_data.ref)
        )
        referrer = ref_result.scalar_one_or_none()
        # Prevent self-referral by email
        if referrer and referrer.email == user_data.email:
            referrer = None

    # Generate a unique referral code
    for _ in range(10):
        code = _generate_referral_code()
        existing = await db.execute(
            select(User).where(User.referral_code == code)
        )
        if not existing.scalar_one_or_none():
            break
    else:
        code = secrets.token_urlsafe(8)[:8]

    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        pay_frequency=user_data.pay_frequency,
        next_pay_date=user_data.next_pay_date,
        net_pay_amount=user_data.net_pay_amount,
        currency=user_data.currency,
        referral_code=code,
        referred_by_user_id=referrer.id if referrer else None,
        tos_accepted_at=datetime.now(timezone.utc),
        tos_version=settings.CURRENT_TOS_VERSION,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # Create ReferralReward row if referred
    if referrer:
        reward = ReferralReward(
            referrer_id=referrer.id,
            referred_user_id=user.id,
            reward_status="pending",
        )
        db.add(reward)
        await db.flush()

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    password_ok = False
    if user:
        try:
            password_ok = verify_password(credentials.password, user.password_hash)
        except Exception:
            logger.exception("Login password verify failed for email=%s", credentials.email)

    if not user or not password_ok:
        # Increment failed login count if user exists but password is wrong
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact support.",
        )

    # Check account status
    if user.account_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended. Contact support.",
        )
    if user.account_status == "closed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account closed. Contact support.",
        )

    if user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "A password reset is required for your account. "
                "Check your email for a reset link or use Forgot Password."
            ),
        )

    # Successful login — update tracking fields
    user.last_login_at = datetime.now(timezone.utc)
    user.failed_login_count = 0
    if sync_app_mode_to_subscription(user):
        db.add(user)
    await db.flush()

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected refresh token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    if user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "A password reset is required for your account. "
                "Check your email for a reset link or use Forgot Password."
            ),
        )

    if sync_app_mode_to_subscription(user):
        db.add(user)
        await db.flush()

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/logout")
async def logout():
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.business_context import accept_pending_team_invites

    await accept_pending_team_invites(db, current_user)
    if sync_app_mode_to_subscription(current_user):
        db.add(current_user)
        await db.flush()
        await db.refresh(current_user)
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)

    # Normalize email if being changed
    if "email" in update_data:
        update_data["email"] = normalize_email(update_data["email"])

    # If email is being changed, check uniqueness
    if "email" in update_data and update_data["email"] != current_user.email:
        result = await db.execute(
            select(User).where(User.email == update_data["email"])
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/date-format", response_model=UserResponse)
async def update_date_format(
    body: UserDateFormatUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.date_format = body.date_format
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return current_user


# ── Password Reset (User self-service) ─────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=72)


class ValidateResetTokenRequest(BaseModel):
    token: str


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Send a password reset email. Always returns success to prevent email enumeration."""
    from app.services.password_reset_service import initiate_password_reset_for_email

    await initiate_password_reset_for_email(
        db, body.email, require_must_reset=False
    )
    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post("/validate-reset-token")
async def validate_reset_token(
    body: ValidateResetTokenRequest, db: AsyncSession = Depends(get_db)
):
    """Check whether a reset token is still valid (used by the reset-password page)."""
    from app.services.password_reset_service import (
        assert_reset_token_valid,
        find_user_by_reset_token,
    )

    user = await find_user_by_reset_token(db, body.token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link.",
        )
    assert_reset_token_valid(user)
    return {"valid": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Reset password using a valid token. Clears token so it cannot be reused."""
    from app.services.password_reset_service import (
        assert_reset_token_valid,
        complete_password_reset,
        find_user_by_reset_token,
    )

    user = await find_user_by_reset_token(db, body.token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link.",
        )
    assert_reset_token_valid(user)
    complete_password_reset(user, body.new_password)
    await db.flush()

    return {"message": "Password has been reset successfully. You can now log in."}


class AcceptTosRequest(BaseModel):
    version: str = Field(..., max_length=20)


@router.post("/accept-tos")
async def accept_tos(
    body: AcceptTosRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.tos_accepted_at = datetime.now(timezone.utc)
    current_user.tos_version = body.version
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return {"message": "Terms of Service accepted successfully."}
