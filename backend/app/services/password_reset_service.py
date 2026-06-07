"""Shared password-reset token lifecycle for self-service and admin flows."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.utils.email import normalize_email
from app.utils.security import hash_password, bump_user_token_version

logger = logging.getLogger(__name__)

RESET_TOKEN_EXPIRY_HOURS = 1
PASSWORD_RESET_REQUIRED_DETAIL = (
    "A password reset is required. Check your email for a reset link or use Forgot Password."
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_expires(expires: datetime | None) -> datetime | None:
    if expires is None:
        return None
    if expires.tzinfo is None:
        return expires.replace(tzinfo=timezone.utc)
    return expires


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def apply_reset_token_to_user(
    user: User,
    *,
    token: str,
    require_must_reset: bool,
) -> None:
    user.reset_token = token
    user.reset_token_expires = _utcnow() + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS)
    if require_must_reset:
        user.must_reset_password = True
    bump_user_token_version(user)


async def find_user_by_reset_token(db: AsyncSession, token: str) -> User | None:
    if not token or not token.strip():
        return None
    result = await db.execute(select(User).where(User.reset_token == token.strip()))
    return result.scalar_one_or_none()


def assert_reset_token_valid(user: User) -> None:
    if not user.reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link.",
        )
    expires = _normalize_expires(user.reset_token_expires)
    if expires and expires < _utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link has expired. Please request a new one.",
        )


def complete_password_reset(user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.must_reset_password = False
    user.failed_login_count = 0
    bump_user_token_version(user)


async def send_reset_email(user: User, token: str) -> bool:
    from app.services.email_service import send_password_reset_email

    sent = await send_password_reset_email(
        to_email=user.email,
        user_name=user.first_name or "there",
        reset_token=token,
    )
    if not sent:
        from app.services.email_service import build_password_reset_link

        link = build_password_reset_link(token)
        logger.warning(
            "Password reset email not delivered for %s; link: %s",
            user.email,
            link,
        )
    return sent


async def initiate_password_reset_for_email(
    db: AsyncSession,
    email: str,
    *,
    require_must_reset: bool,
) -> tuple[User | None, bool]:
    """Create token and send email. Returns (user, email_sent). User is None if not found/inactive."""
    normalized = normalize_email(email)
    if not normalized:
        return None, False

    result = await db.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None, False

    token = generate_reset_token()
    apply_reset_token_to_user(user, token=token, require_must_reset=require_must_reset)
    await db.flush()
    email_sent = await send_reset_email(user, token)
    return user, email_sent
