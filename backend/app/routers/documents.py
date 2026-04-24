"""Document upload endpoints — presign, finalize, list, get, delete."""

import logging
import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document_upload import DocumentUpload
from app.models.user import User
from app.schemas.document_upload import (
    DocumentDetailResponse,
    DocumentFinalizeRequest,
    DocumentUploadRequest,
    DocumentUploadResponse,
    PresignedUploadResponse,
)
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError
from app.services.storage.r2_provider import get_storage_provider
from app.utils.budget import resolve_budget_id
from app.utils.security import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
}


def _extension_from_filename(filename: str) -> str:
    """Extract file extension from filename, or empty string."""
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else ""


# ── Endpoints ────────────────────────────────────────────────────


@router.post("/presign", response_model=PresignedUploadResponse)
async def presign_upload(
    data: DocumentUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue a presigned PUT URL for direct-to-R2 upload."""
    # Validate content type
    if data.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type '{data.content_type}' is not allowed. "
            f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )

    # Validate file size
    if data.file_size > settings.R2_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size {data.file_size} exceeds maximum of {settings.R2_MAX_UPLOAD_BYTES} bytes.",
        )

    # Resolve budget
    budget_id = await resolve_budget_id(current_user, db)

    # Create metadata row
    ext = _extension_from_filename(data.filename)
    doc = DocumentUpload(
        user_id=current_user.id,
        budget_id=budget_id,
        household_id=getattr(current_user, "household_id", None),
        bucket=settings.R2_BUCKET_NAME or "",
        object_key="",  # will be set below
        original_filename=data.filename,
        content_type=data.content_type,
        file_size=data.file_size,
        document_type=data.document_type,
        storage_provider="r2",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    # Build object key: uploads/{user_id}/{yyyy}/{mm}/{document_id}{ext}
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    object_key = f"uploads/{current_user.id}/{now.year}/{now.month:02d}/{doc.id}{ext}"
    doc.object_key = object_key
    doc.bucket = settings.R2_BUCKET_NAME or ""
    await db.flush()

    # Generate presigned URL
    try:
        storage = get_storage_provider()
        result = storage.presign_put(
            object_key=object_key,
            content_type=data.content_type,
            expires_in=settings.R2_PRESIGNED_URL_TTL,
            max_bytes=settings.R2_MAX_UPLOAD_BYTES,
        )
    except R2NotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except R2OperationError as exc:
        logger.error("R2 presign failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Storage service error. Please try again.",
        ) from exc

    return PresignedUploadResponse(
        document_id=doc.id,
        upload_url=result.url,
        method="PUT",
        required_headers=result.headers,
        object_key=object_key,
        expires_at=result.expires_at,
        max_bytes=result.max_bytes,
    )


@router.post("/finalize", response_model=DocumentUploadResponse)
async def finalize_upload(
    data: DocumentFinalizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm an upload completed — verify object in R2 and transition status."""
    result = await db.execute(
        select(DocumentUpload).where(
            DocumentUpload.id == data.document_id,
            DocumentUpload.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    # Guard against re-finalize
    if doc.status not in ("pending_upload",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document is already in status '{doc.status}' and cannot be finalized.",
        )

    # Verify object exists in R2
    try:
        storage = get_storage_provider()
        exists = storage.object_exists(doc.object_key)
    except R2NotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except R2OperationError as exc:
        logger.error("R2 object_exists check failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Storage service error. Please try again.",
        ) from exc

    if not exists:
        doc.status = "failed"
        doc.error_message = "Upload not found in storage"
        await db.flush()
        await db.refresh(doc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload not found in storage",
        )

    doc.status = "uploaded"
    if data.file_size is not None:
        doc.file_size = data.file_size
    await db.flush()
    await db.refresh(doc)
    return doc


@router.get("", response_model=list[DocumentUploadResponse])
async def list_documents(
    budget_id: Optional[UUID] = Query(default=None),
    document_type: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List documents for the current user."""
    query = select(DocumentUpload).where(DocumentUpload.user_id == current_user.id)

    if budget_id is not None:
        query = query.where(DocumentUpload.budget_id == budget_id)
    if document_type is not None:
        query = query.where(DocumentUpload.document_type == document_type)
    if status_filter is not None:
        query = query.where(DocumentUpload.status == status_filter)

    query = query.order_by(DocumentUpload.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get document details including a short-lived download URL."""
    result = await db.execute(
        select(DocumentUpload).where(
            DocumentUpload.id == document_id,
            DocumentUpload.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    # Generate signed download URL (best-effort — skip if R2 not configured)
    download_url = None
    if doc.object_key and doc.status in ("uploaded", "processing", "completed"):
        try:
            storage = get_storage_provider()
            download_url = storage.presign_get(doc.object_key, expires_in=300)
        except (R2NotConfiguredError, R2OperationError) as exc:
            logger.warning("Could not generate download URL: %s", exc)

    return DocumentDetailResponse(
        id=doc.id,
        status=doc.status,
        original_filename=doc.original_filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        document_type=doc.document_type,
        linked_entity_type=doc.linked_entity_type,
        linked_entity_id=doc.linked_entity_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        parsed_json=doc.parsed_json,
        download_url=download_url,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document and best-effort remove from R2."""
    result = await db.execute(
        select(DocumentUpload).where(
            DocumentUpload.id == document_id,
            DocumentUpload.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    # Best-effort R2 cleanup — log failures but don't block DB deletion
    if doc.object_key:
        try:
            storage = get_storage_provider()
            storage.delete_object(doc.object_key)
        except (R2NotConfiguredError, R2OperationError) as exc:
            logger.warning("R2 cleanup failed for %s: %s", doc.object_key, exc)

    await db.delete(doc)
    await db.flush()
