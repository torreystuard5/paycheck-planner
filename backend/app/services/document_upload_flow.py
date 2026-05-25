"""Server-side document upload: API receives file, writes to R2, runs OCR."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document_upload import DocumentUpload
from app.services.document_responses import document_detail_response
from app.services.ocr_service import run_document_ocr_bytes
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError, put_object
from app.schemas.document_upload import DocumentDetailResponse

logger = logging.getLogger(__name__)

PERSONAL_DOC_TYPES = frozenset({"paystub", "receipt", "tax", "other"})


def _storage_error_detail(exc: R2OperationError) -> str:
    msg = str(exc)
    if "AccessDenied" in msg:
        return (
            "Storage access denied. In Cloudflare R2, create an API token with "
            "Object Read & Write on bucket "
            f"'{(settings.R2_BUCKET_NAME or '').strip()}'."
        )
    if "SignatureDoesNotMatch" in msg or "InvalidRequest" in msg:
        return (
            "Storage rejected the upload (signature mismatch). Redeploy the API "
            "(needs boto3 1.35.99), then recreate the R2 S3 API token and re-paste "
            "both keys into Render with no extra spaces."
        )
    if "NoSuchBucket" in msg:
        return (
            f"Storage bucket '{(settings.R2_BUCKET_NAME or '').strip()}' was not found. "
            "Check R2_BUCKET_NAME on Render."
        )
    return "Storage upload failed on the server. Please try again."


def normalize_content_type(content_type: str | None, filename: str) -> str:
    t = (content_type or "").strip().lower()
    if not t or t == "image/heif":
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            return "application/pdf"
        if name.endswith(".png"):
            return "image/png"
        if name.endswith(".webp"):
            return "image/webp"
        if name.endswith(".heic") or name.endswith(".heif"):
            return "image/heic"
        if name.endswith(".jpg") or name.endswith(".jpeg"):
            return "image/jpeg"
        return "application/octet-stream"
    return t


def _extension_from_filename(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else ""


async def ingest_document_bytes(
    *,
    db: AsyncSession,
    user_id: UUID,
    household_id: UUID | None,
    budget_id: UUID | None,
    document_type: str,
    filename: str,
    content_type: str,
    raw: bytes,
    object_key_prefix: str,
    allowed_types: frozenset[str],
    allowed_content_types: frozenset[str],
) -> DocumentDetailResponse:
    if document_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid document type")
    if content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Content type not allowed")
    if len(raw) > settings.R2_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large")

    ext = _extension_from_filename(filename)
    now = datetime.now(timezone.utc)

    doc = DocumentUpload(
        user_id=user_id,
        budget_id=budget_id,
        household_id=household_id,
        bucket=settings.R2_BUCKET_NAME or "",
        object_key="",
        original_filename=filename[:255] if filename else None,
        content_type=content_type,
        file_size=len(raw),
        document_type=document_type,
        storage_provider="r2",
        status="pending_upload",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    object_key = f"{object_key_prefix}/{now.year}/{now.month:02d}/{doc.id}{ext}"
    doc.object_key = object_key
    doc.bucket = settings.R2_BUCKET_NAME or ""

    try:
        await asyncio.to_thread(put_object, object_key, raw, content_type)
    except R2NotConfiguredError as exc:
        await db.delete(doc)
        await db.flush()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except R2OperationError as exc:
        logger.error("R2 put_object failed: %s", exc)
        doc.status = "failed"
        doc.error_message = str(exc)
        await db.flush()
        raise HTTPException(
            status_code=502,
            detail=_storage_error_detail(exc),
        ) from exc

    doc.status = "processing"
    await db.flush()

    try:
        ocr_result = await run_document_ocr_bytes(doc, raw)
        doc.ocr_text = ocr_result.text
        doc.parsed_json = ocr_result.parsed_json
        if ocr_result.status == "completed":
            doc.status = "completed"
        elif ocr_result.status == "failed":
            doc.status = "failed"
            doc.error_message = ocr_result.error
        else:
            doc.status = "uploaded"
    except Exception as exc:
        logger.exception("OCR after server upload failed")
        doc.status = "uploaded"
        doc.error_message = str(exc)

    await db.flush()
    await db.refresh(doc)
    return document_detail_response(doc)
