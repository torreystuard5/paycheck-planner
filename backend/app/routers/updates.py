from fastapi import APIRouter, Depends
from sqlalchemy import select
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
