from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.app_update import AppUpdate
from app.models.coming_soon import ComingSoon
from app.models.user import User
from app.schemas.updates import AppUpdateOut, ComingSoonOut
from app.utils.security import get_current_user

router = APIRouter(tags=["Updates"])


@router.get("/app-updates", response_model=list[AppUpdateOut])
async def list_app_updates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the 20 most recent app updates, sorted by date descending."""
    result = await db.execute(
        select(AppUpdate).order_by(AppUpdate.date.desc()).limit(20)
    )
    return [AppUpdateOut.model_validate(u) for u in result.scalars().all()]


@router.get("/whats-new-unseen-count")
async def get_unseen_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the number of app updates the user hasn't seen yet."""
    query = select(func.count(AppUpdate.id))
    if current_user.last_seen_whats_new is not None:
        query = query.where(AppUpdate.created_at > current_user.last_seen_whats_new)
    result = await db.execute(query)
    return {"unseen_count": result.scalar() or 0}


@router.patch("/whats-new-seen")
async def mark_whats_new_seen(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all current updates as seen for the authenticated user."""
    current_user.last_seen_whats_new = datetime.now(timezone.utc)
    await db.flush()
    return {"status": "ok"}


@router.get("/coming-soon", response_model=list[ComingSoonOut])
async def list_coming_soon(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all coming soon items."""
    result = await db.execute(
        select(ComingSoon).order_by(ComingSoon.created_at.desc())
    )
    return [ComingSoonOut.model_validate(c) for c in result.scalars().all()]
