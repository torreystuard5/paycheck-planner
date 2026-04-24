"""No-op OCR provider — returns status="skipped" (Phase 6A placeholder)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.ocr.base import OcrProvider, OcrResult

if TYPE_CHECKING:
    from app.models.document_upload import DocumentUpload


class NoopOcrProvider(OcrProvider):
    """Placeholder that does nothing — swapped for real provider in Phase 6C."""

    async def process(
        self, document: DocumentUpload, signed_get_url: str
    ) -> OcrResult:
        return OcrResult(status="skipped")


_instance: NoopOcrProvider | None = None


def get_ocr_provider() -> OcrProvider:
    """Factory — returns the noop provider for now."""
    global _instance
    if _instance is None:
        _instance = NoopOcrProvider()
    return _instance
