from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def user_token_version(user: User) -> int:
    return int(getattr(user, "token_version", None) or 0)


def bump_user_token_version(user: User) -> int:
    user.token_version = user_token_version(user) + 1
    return user.token_version


def build_user_token_data(user: User, *, impersonated_by: str | None = None) -> dict:
    data = {"sub": str(user.id), "tv": user_token_version(user)}
    if impersonated_by:
        data["imp_by"] = impersonated_by
    return data


def validate_token_version(payload: dict, user: User) -> None:
    token_tv = int(payload.get("tv", 0) or 0)
    if token_tv != user_token_version(user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


_PASSWORD_RESET_EXEMPT_SUFFIXES = (
    "/auth/reset-password",
    "/auth/validate-reset-token",
)


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    validate_token_version(payload, user)

    if user.must_reset_password:
        path = request.url.path
        if not any(path.endswith(suffix) for suffix in _PASSWORD_RESET_EXEMPT_SUFFIXES):
            from app.services.password_reset_service import PASSWORD_RESET_REQUIRED_DETAIL

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=PASSWORD_RESET_REQUIRED_DETAIL,
            )

    return user


def require_feature(feature_key: str):
    """Dependency: block unless user has access to feature_key (Pro/Business/early_access)."""

    async def _dep(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        from app.services.tier_service import user_can_access_feature

        if await user_can_access_feature(db, current_user, feature_key):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "upgrade_required",
                "feature": feature_key,
                "message": "This feature requires Home Pro. Upgrade to unlock it.",
            },
        )

    return _dep


async def require_business_mode(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Business Edition: app_mode=business plus active access (sub, trial, early access, grant)."""
    from app.services.business_access import user_can_write_business, user_has_business_access

    mode = (current_user.app_mode or "personal").lower()
    if mode != "business":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business mode required",
        )
    if not user_has_business_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "business_upgrade_required",
                "message": "Business subscription or trial required",
            },
        )
    if request.method not in ("GET", "HEAD", "OPTIONS") and not user_can_write_business(
        current_user
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "business_trial_expired",
                "message": "Business trial ended. Subscribe to edit records.",
            },
        )
    return current_user
