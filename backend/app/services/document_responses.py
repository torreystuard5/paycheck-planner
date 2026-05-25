"""Build API responses for document upload rows."""

from __future__ import annotations

import logging

from app.models.document_upload import DocumentUpload
from app.schemas.document_upload import DocumentDetailResponse
from app.services.storage.r2_client import R2NotConfiguredError, R2OperationError
from app.services.storage.r2_provider import get_storage_provider

logger = logging.getLogger(__name__)


def document_detail_response(doc: DocumentUpload, *, include_download: bool = True) -> DocumentDetailResponse:
    download_url = None
    if (
        include_download
        and doc.object_key
        and doc.status in ("uploaded", "processing", "completed")
    ):
        try:
            storage = get_storage_provider()
            download_url = storage.presign_get(doc.object_key, expires_in=300)
        except (R2NotConfiguredError, R2OperationError) as exc:
            logger.warning("Could not generate download URL for %s: %s", doc.id, exc)

    return DocumentDetailResponse(
        id=doc.id,
        status=doc.status,
        original_filename=doc.original_filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        document_type=doc.document_type,
        linked_entity_type=doc.linked_entity_type,
        linked_entity_id=doc.linked_entity_id,
        parsed_json=doc.parsed_json,
        error_message=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        download_url=download_url,
    )
