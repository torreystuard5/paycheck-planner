from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.announcement import Announcement
from app.models.user import User
from app.schemas.admin import AnnouncementOut
from app.utils.security import get_current_user

router = APIRouter(prefix="/announcements", tags=["Announcements"])


@router.get("/active", response_model=list[AnnouncementOut])
async def get_active_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get active, non-expired announcements. Available to any authenticated user."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Announcement)
        .where(
            Announcement.is_active.is_(True),
            (Announcement.expires_at.is_(None)) | (Announcement.expires_at > now),
        )
        .order_by(Announcement.created_at.desc())
    )
    return [AnnouncementOut.model_validate(a) for a in result.scalars().all()]
