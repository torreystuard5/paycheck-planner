"""Fallback OCR when Tesseract is unavailable — filename/heuristic parsing only."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.ocr.base import OcrProvider, OcrResult
from app.services.ocr_parsers import parse_document_text

if TYPE_CHECKING:
    from app.models.document_upload import DocumentUpload


class NoopOcrProvider(OcrProvider):
    """No download/OCR — still populates parsed_json from filename heuristics."""

    async def process(
        self, document: DocumentUpload, signed_get_url: str
    ) -> OcrResult:
        text = document.original_filename or ""
        parsed = parse_document_text(text, document.document_type)
        return OcrResult(
            status="completed",
            text=None,
            parsed_json=parsed,
        )
