"""Business document uploads — paystub OCR, receipts, invoices (R2 presigned flow)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document_upload import DocumentUpload
from app.models.user import User
from app.schemas.document_upload import (
    DocumentDetailResponse,
    DocumentFinalizeRequest,
    DocumentUploadResponse,
    PresignedUploadResponse,
)
from app.services.document_link import validate_business_link_target
from app.services.document_responses import document_detail_response
from app.services.document_upload_flow import ingest_document_bytes, normalize_content_type
from app.services.ocr_service import run_document_ocr
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError
from app.services.storage.r2_provider import get_storage_provider
from app.services.business_context import BusinessContext, get_business_ctx
from app.services.document_constants import ALLOWED_DOCUMENT_CONTENT_TYPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/business/documents", tags=["Business Documents"])

ALLOWED_CONTENT_TYPES = ALLOWED_DOCUMENT_CONTENT_TYPES
BUSINESS_DOC_TYPES = frozenset(
    {"paystub", "receipt", "invoice", "bill", "vendor", "tax", "other"}
)


class BusinessDocumentUploadRequest(BaseModel):
    filename: str = Field(max_length=255)
    content_type: str
    file_size: int = Field(gt=0)
    document_type: str


class BusinessDocumentLinkRequest(BaseModel):
    entity_type: str = Field(..., pattern="^(business_deduction)$")
    entity_id: UUID


def _extension_from_filename(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else ""


def _business_scope(ctx: BusinessContext):
    return and_(
        DocumentUpload.user_id == ctx.owner_id,
        DocumentUpload.object_key.like("business/%"),
    )


async def _get_business_doc(
    document_id: UUID, ctx: BusinessContext, db: AsyncSession
) -> DocumentUpload:
    result = await db.execute(
        select(DocumentUpload).where(
            DocumentUpload.id == document_id,
            _business_scope(ctx),
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


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
    doc = await _get_business_doc(data.document_id, ctx, db)
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
    return document_detail_response(doc)


@router.post("/upload", response_model=DocumentDetailResponse)
async def business_upload_file(
    file: UploadFile = File(...),
    document_type: str = Form(...),
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    """Upload via API (file → R2 on server). Avoids browser CORS to the bucket."""
    raw = await file.read()
    filename = file.filename or "upload"
    content_type = normalize_content_type(file.content_type, filename)
    return await ingest_document_bytes(
        db=db,
        user_id=ctx.owner_id,
        household_id=None,
        budget_id=None,
        document_type=document_type,
        filename=filename,
        content_type=content_type,
        raw=raw,
        object_key_prefix=f"business/{ctx.owner_id}",
        allowed_types=BUSINESS_DOC_TYPES,
        allowed_content_types=ALLOWED_CONTENT_TYPES,
    )


@router.get("", response_model=list[DocumentDetailResponse])
async def business_list_documents(
    document_type: str | None = Query(None),
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    q = select(DocumentUpload).where(_business_scope(ctx))
    if document_type:
        q = q.where(DocumentUpload.document_type == document_type)
    q = q.order_by(DocumentUpload.created_at.desc()).limit(100)
    rows = (await db.execute(q)).scalars().all()
    return [document_detail_response(r) for r in rows]


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def business_get_document(
    document_id: UUID,
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_business_doc(document_id, ctx, db)
    return document_detail_response(doc)


@router.post("/{document_id}/link", response_model=DocumentUploadResponse)
async def business_link_document(
    document_id: UUID,
    body: BusinessDocumentLinkRequest,
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_business_doc(document_id, ctx, db)
    await validate_business_link_target(
        db, ctx.owner_id, body.entity_type, body.entity_id
    )

    doc.linked_entity_type = body.entity_type
    doc.linked_entity_id = body.entity_id
    await db.flush()
    await db.refresh(doc)
    return DocumentUploadResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def business_delete_document(
    document_id: UUID,
    ctx: BusinessContext = Depends(get_business_ctx),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_business_doc(document_id, ctx, db)
    if doc.object_key:
        try:
            storage = get_storage_provider()
            storage.delete_object(doc.object_key)
        except (R2NotConfiguredError, R2OperationError) as exc:
            logger.warning("R2 cleanup failed for %s: %s", doc.object_key, exc)
    await db.delete(doc)
    await db.flush()
