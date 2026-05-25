"""Shared query scope for personal/household document uploads."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_upload import DocumentUpload
from app.models.user import User


def document_access_scope(user: User):
    """SQLAlchemy filter: documents the user may read/link."""
    if user.household_id:
        return or_(
            DocumentUpload.user_id == user.id,
            DocumentUpload.household_id == user.household_id,
        )
    return DocumentUpload.user_id == user.id


def document_owner_scope(user: User):
    """SQLAlchemy filter: documents the user uploaded (delete/finalize)."""
    return DocumentUpload.user_id == user.id


async def get_document_for_user(
    db: AsyncSession,
    document_id: UUID,
    user: User,
    *,
    owner_only: bool = False,
) -> DocumentUpload | None:
    scope = document_owner_scope(user) if owner_only else document_access_scope(user)
    result = await db.execute(
        select(DocumentUpload).where(and_(DocumentUpload.id == document_id, scope))
    )
    return result.scalar_one_or_none()
