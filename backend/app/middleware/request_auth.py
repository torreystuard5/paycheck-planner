"""Per-request auth snapshot — one DB round-trip shared by gate middleware."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Request
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.user import User


@dataclass(frozen=True)
class RequestUserSnapshot:
    user_id: UUID
    tos_version: str | None
    subscription_tier: str | None
    is_admin: bool


def bearer_access_user_id(request: Request) -> UUID | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return UUID(str(sub))
    except (ValueError, TypeError):
        return None


async def get_request_user_snapshot(request: Request) -> RequestUserSnapshot | None:
    """Load (or return cached) user fields used by TOS / tier / maintenance middleware."""
    if getattr(request.state, "_user_snapshot_loaded", False):
        return getattr(request.state, "user_snapshot", None)

    request.state._user_snapshot_loaded = True
    uid = bearer_access_user_id(request)
    if uid is None:
        request.state.user_snapshot = None
        return None

    try:
        async with async_session() as session:
            result = await session.execute(
                select(
                    User.tos_version,
                    User.subscription_tier,
                    User.is_admin,
                ).where(User.id == uid)
            )
            row = result.one_or_none()
    except Exception:
        request.state.user_snapshot = None
        raise

    if row is None:
        request.state.user_snapshot = None
        return None

    snap = RequestUserSnapshot(
        user_id=uid,
        tos_version=row[0],
        subscription_tier=row[1],
        is_admin=bool(row[2]),
    )
    request.state.user_snapshot = snap
    return snap
