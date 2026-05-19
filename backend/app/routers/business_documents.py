"""Business document uploads — paystub OCR, receipts, invoices (R2 presigned flow)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document_upload import DocumentUpload
from app.models.user import User
from app.schemas.document_upload import DocumentDetailResponse, DocumentFinalizeRequest, PresignedUploadResponse
from app.services.ocr_service import run_document_ocr
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError
from app.services.storage.r2_provider import get_storage_provider
from app.services.business_context import BusinessContext, get_business_ctx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/business/documents", tags=["Business Documents"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
BUSINESS_DOC_TYPES = frozenset(
    {"paystub", "receipt", "invoice", "bill", "vendor", "tax", "other"}
)


class BusinessDocumentUploadRequest(BaseModel):
    filename: str = Field(max_length=255)
    content_type: str
    file_size: int = Field(gt=0)
    document_type: str


def _extension_from_filename(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else ""


@router.post("/presign", response_model=PresignedUploadResponse)
async def business_presign(
    data: BusinessDocumentUploadRequest,
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    if data.document_type not in BUSINESS_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Invalid business document type")
    if data.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Content type not allowed")
    if data.file_size > settings.R2_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large")

    doc = DocumentUpload(
        user_id=ctx.owner_id,
        budget_id=None,
        household_id=None,
        bucket=settings.R2_BUCKET_NAME or "",
        object_key="",
        original_filename=data.filename,
        content_type=data.content_type,
        file_size=data.file_size,
        document_type=data.document_type,
        storage_provider="r2",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    now = datetime.now(timezone.utc)
    ext = _extension_from_filename(data.filename)
    object_key = f"business/{ctx.owner_id}/{now.year}/{now.month:02d}/{doc.id}{ext}"
    doc.object_key = object_key
    await db.flush()

    try:
        storage = get_storage_provider()
        result = storage.presign_put(
            object_key=object_key,
            content_type=data.content_type,
            expires_in=settings.R2_PRESIGNED_URL_TTL,
            max_bytes=settings.R2_MAX_UPLOAD_BYTES,
        )
    except (R2NotConfiguredError, R2OperationError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return PresignedUploadResponse(
        document_id=doc.id,
        upload_url=result.url,
        method="PUT",
        required_headers=result.headers,
        object_key=object_key,
        expires_at=result.expires_at,
        max_bytes=result.max_bytes,
    )


@router.post("/finalize", response_model=DocumentDetailResponse)
async def business_finalize(
    data: DocumentFinalizeRequest,
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DocumentUpload).where(
            DocumentUpload.id == data.document_id,
            DocumentUpload.user_id == ctx.owner_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status not in ("pending_upload",):
        raise HTTPException(status_code=409, detail=f"Cannot finalize status {doc.status}")

    try:
        storage = get_storage_provider()
        if not storage.object_exists(doc.object_key):
            raise HTTPException(status_code=400, detail="Upload not found in storage")
    except R2NotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    doc.status = "processing"
    if data.file_size is not None:
        doc.file_size = data.file_size
    await db.flush()
    try:
        storage = get_storage_provider()
        download_url = storage.presign_get(doc.object_key, expires_in=600)
        ocr_result = await run_document_ocr(doc, download_url)
        doc.ocr_text = ocr_result.text
        doc.parsed_json = ocr_result.parsed_json
        doc.status = "completed" if ocr_result.status == "completed" else "uploaded"
        if ocr_result.status == "failed":
            doc.error_message = ocr_result.error
    except Exception as exc:
        logger.exception("Business document OCR failed for %s", doc.id)
        doc.status = "uploaded"
        doc.error_message = str(exc)

    await db.flush()
    await db.refresh(doc)
    return DocumentDetailResponse.model_validate(doc)


@router.get("", response_model=list[DocumentDetailResponse])
async def business_list_documents(
    document_type: str | None = Query(None),
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    q = select(DocumentUpload).where(
        DocumentUpload.user_id == ctx.owner_id,
        DocumentUpload.object_key.like("business/%"),
    )
    if document_type:
        q = q.where(DocumentUpload.document_type == document_type)
    q = q.order_by(DocumentUpload.created_at.desc()).limit(100)
    rows = (await db.execute(q)).scalars().all()
    return [DocumentDetailResponse.model_validate(r) for r in rows]
