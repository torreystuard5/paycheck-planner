"""Abstract OCR provider interface — scaffolding only (Phase 6A)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.models.document_upload import DocumentUpload


class OcrResult(BaseModel):
    """Result from an OCR processing run."""

    status: str  # "completed", "failed", "skipped"
    text: str | None = None
    parsed_json: dict | None = None
    error: str | None = None
    confidence: float | None = None


class OcrProvider(ABC):
    """Minimal interface for OCR backends."""

    @abstractmethod
    async def process(
        self, document: DocumentUpload, signed_get_url: str
    ) -> OcrResult:
        ...
