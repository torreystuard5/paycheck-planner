"""Pydantic schemas for document uploads."""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentUploadRequest(BaseModel):
    """Body for POST /documents/presign."""

    filename: str = Field(max_length=255)
    content_type: str
    file_size: int = Field(gt=0)
    document_type: Literal["paystub", "receipt", "other"]


class PresignedUploadResponse(BaseModel):
    """Returned after presign — tells the client where/how to upload."""

    document_id: UUID
    upload_url: str
    method: str = "PUT"
    required_headers: dict[str, str]
    object_key: str
    expires_at: datetime
    max_bytes: int


class DocumentFinalizeRequest(BaseModel):
    """Body for POST /documents/finalize."""

    document_id: UUID
    file_size: Optional[int] = None


class DocumentUploadResponse(BaseModel):
    """Standard read model — excludes internal storage/OCR fields."""

    id: UUID
    status: str
    original_filename: Optional[str] = None
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    document_type: str
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetailResponse(DocumentUploadResponse):
    """Extended model with OCR data and a short-lived download URL."""

    parsed_json: Optional[dict] = None
    download_url: Optional[str] = None
