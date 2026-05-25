"""Document upload endpoints — presign, finalize, list, get, delete."""

import logging
import os
from datetime import date
from decimal import Decimal
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
from app.schemas.paycheck_entry import PaycheckEntryResponse
from app.services.document_link import validate_personal_link_target
from app.services.document_responses import document_detail_response
from app.services.document_scope import document_access_scope, get_document_for_user
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError
from app.services.storage.r2_provider import get_storage_provider
from app.utils.budget import resolve_budget_id
from app.services.ocr_service import run_document_ocr
from app.utils.security import get_current_user
from app.config import settings
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


async def _ensure_document_access(
    db: AsyncSession,
    current_user: User,
    document_type: str | None = None,
) -> None:
    from app.services.tier_service import user_can_access_feature

    if document_type == "tax":
        if await user_can_access_feature(db, current_user, "tax_prep"):
            return
    if await user_can_access_feature(db, current_user, "receipt_ocr"):
        return
    feature = "tax_prep" if document_type == "tax" else "receipt_ocr"
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "upgrade_required",
            "feature": feature,
            "message": "This feature requires Home Pro.",
        },
    )

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
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
    await _ensure_document_access(db, current_user, data.document_type)

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


@router.post("/finalize", response_model=DocumentDetailResponse)
async def finalize_upload(
    data: DocumentFinalizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm an upload completed — verify object in R2 and transition status."""
    await _ensure_document_access(db, current_user)
    doc = await get_document_for_user(
        db, data.document_id, current_user, owner_only=True
    )
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
        if ocr_result.status == "completed":
            doc.status = "completed"
        elif ocr_result.status == "failed":
            doc.status = "failed"
            doc.error_message = ocr_result.error
        else:
            doc.status = "uploaded"
    except Exception as exc:
        logger.exception("OCR after finalize failed")
        doc.status = "uploaded"
        doc.error_message = str(exc)

    await db.flush()
    await db.refresh(doc)
    return document_detail_response(doc)


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
    """List documents for the current user (and household-shared uploads)."""
    await _ensure_document_access(db, current_user)
    query = select(DocumentUpload).where(document_access_scope(current_user))

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
    await _ensure_document_access(db, current_user)
    doc = await get_document_for_user(db, document_id, current_user)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return document_detail_response(doc)


class DocumentLinkRequest(BaseModel):
    entity_type: str = Field(..., pattern="^(bill|debt|tax_deduction|paycheck_entry)$")
    entity_id: UUID


class PaystubConfirmFromDocumentRequest(BaseModel):
    source_name: str = Field(..., max_length=150)
    pay_date: date
    net_amount: Decimal = Field(..., max_digits=12, decimal_places=2)
    gross_amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    memo: str | None = Field(default=None, max_length=255)
    budget_id: UUID | None = None


class CreateBillFromOcrRequest(BaseModel):
    name: str | None = Field(None, max_length=200)
    amount: float | None = None
    due_date: date | None = None
    budget_id: UUID | None = None


@router.post("/{document_id}/link", response_model=DocumentUploadResponse)
async def link_document(
    document_id: UUID,
    body: DocumentLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_document_access(db, current_user)
    doc = await get_document_for_user(db, document_id, current_user)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await validate_personal_link_target(
        db, current_user, body.entity_type, body.entity_id
    )

    doc.linked_entity_type = body.entity_type
    doc.linked_entity_id = body.entity_id
    await db.flush()
    await db.refresh(doc)
    return doc


@router.post("/{document_id}/confirm-paystub", response_model=PaycheckEntryResponse)
async def confirm_paystub_from_document(
    document_id: UUID,
    body: PaystubConfirmFromDocumentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a paycheck entry from a paystub document and link the upload."""
    from app.services.tier_service import user_can_access_feature

    if not await user_can_access_feature(db, current_user, "receipt_ocr"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "upgrade_required", "feature": "receipt_ocr"},
        )
    from app.models.paycheck_entry import PaycheckEntry
    from app.utils.budget import resolve_budget_id

    doc = await get_document_for_user(db, document_id, current_user, owner_only=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.document_type != "paystub":
        raise HTTPException(status_code=400, detail="Document is not a paystub")
    if doc.linked_entity_type == "paycheck_entry" and doc.linked_entity_id:
        raise HTTPException(
            status_code=409,
            detail="This paystub is already linked to a paycheck entry",
        )

    budget_id = await resolve_budget_id(current_user, db, body.budget_id)
    entry = PaycheckEntry(
        user_id=current_user.id,
        source_name=body.source_name[:150],
        pay_date=body.pay_date,
        gross_amount=body.gross_amount,
        net_amount=body.net_amount,
        memo=body.memo,
        budget_id=budget_id,
    )
    db.add(entry)
    await db.flush()
    doc.linked_entity_type = "paycheck_entry"
    doc.linked_entity_id = entry.id
    await db.flush()
    await db.refresh(entry)
    return PaycheckEntryResponse.model_validate(entry)


class CreateBillFromOcrResponse(BaseModel):
    bill_id: UUID
    name: str
    amount: str


@router.post("/{document_id}/create-bill-from-ocr", response_model=CreateBillFromOcrResponse)
async def create_bill_from_ocr(
    document_id: UUID,
    body: CreateBillFromOcrRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as date_type
    from decimal import Decimal

    from app.models.bill import Bill
    from app.utils.budget import resolve_budget_id
    from app.services.tier_service import user_can_access_feature

    if not await user_can_access_feature(db, current_user, "receipt_ocr"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "upgrade_required", "feature": "receipt_ocr"},
        )

    doc = await get_document_for_user(db, document_id, current_user, owner_only=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.document_type not in ("receipt", "other"):
        raise HTTPException(
            status_code=400,
            detail="Only receipt documents can create bills",
        )
    if doc.linked_entity_type == "bill" and doc.linked_entity_id:
        raise HTTPException(status_code=409, detail="Document is already linked to a bill")

    parsed = doc.parsed_json or {}
    amount = body.amount
    if amount is None and parsed.get("amount"):
        amount = float(parsed["amount"])
    if amount is None:
        raise HTTPException(status_code=400, detail="Amount is required")

    due = body.due_date
    if due is None and parsed.get("due_date"):
        due = date_type.fromisoformat(str(parsed["due_date"])[:10])

    name = body.name or parsed.get("vendor_name") or doc.original_filename or "New bill"
    budget_id = await resolve_budget_id(current_user, db, body.budget_id)
    due_day = due.day if due else 1

    bill = Bill(
        user_id=current_user.id,
        household_id=current_user.household_id,
        name=name[:200],
        amount=Decimal(str(amount)),
        frequency="monthly",
        due_day=due_day,
        start_date=due,
        budget_id=budget_id,
        is_active=True,
    )
    db.add(bill)
    await db.flush()
    doc.linked_entity_type = "bill"
    doc.linked_entity_id = bill.id
    await db.flush()
    await db.refresh(bill)
    return CreateBillFromOcrResponse(
        bill_id=bill.id,
        name=bill.name,
        amount=str(bill.amount),
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document and best-effort remove from R2."""
    await _ensure_document_access(db, current_user)
    doc = await get_document_for_user(
        db, document_id, current_user, owner_only=True
    )
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
