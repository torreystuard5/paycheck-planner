"""OCR for document uploads — Tesseract + PDF text, type-specific parsers."""

from __future__ import annotations

import io
import logging

import httpx

from app.models.document_upload import DocumentUpload
from app.services.ocr.base import OcrProvider, OcrResult
from app.services.ocr_parsers import parse_document_text, parse_for_document_type

# Re-export parsers for tests and callers
from app.services.ocr_parsers import parse_paystub_text, parse_receipt_text, parse_tax_document_text  # noqa: F401

logger = logging.getLogger(__name__)


async def _download_bytes(url: str, max_bytes: int = 10_485_760) -> bytes:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.content
        if len(data) > max_bytes:
            raise ValueError("File exceeds maximum size for OCR")
        return data


def _pdf_bytes_to_text(data: bytes) -> str:
    try:
        import pdfplumber

        chunks: list[str] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages[:5]:
                chunks.append(page.extract_text() or "")
        return "\n".join(chunks)
    except Exception:
        logger.warning("pdfplumber failed for PDF OCR", exc_info=True)
        return ""


def _image_bytes_to_text(data: bytes, content_type: str | None) -> str:
    try:
        from PIL import Image
    except ImportError:
        return ""

    try:
        import pytesseract
    except ImportError:
        logger.info("pytesseract not installed — OCR text extraction skipped")
        return ""

    img = Image.open(io.BytesIO(data))
    if content_type and "heic" in content_type.lower():
        img = img.convert("RGB")
    return pytesseract.image_to_string(img) or ""


def _bytes_to_text(data: bytes, content_type: str | None, filename: str | None) -> str:
    is_pdf = (content_type == "application/pdf") or (
        filename and filename.lower().endswith(".pdf")
    )
    if is_pdf:
        text = _pdf_bytes_to_text(data)
        if text.strip():
            return text
    return _image_bytes_to_text(data, content_type)


class TesseractOcrProvider(OcrProvider):
    async def process(self, document: DocumentUpload, signed_get_url: str) -> OcrResult:
        try:
            data = await _download_bytes(signed_get_url)
            text = _bytes_to_text(data, document.content_type, document.original_filename)
            if not text.strip():
                text = document.original_filename or ""
            parsed = parse_for_document_type(document.document_type, text)
            return OcrResult(
                status="completed",
                text=text[:50_000] if text else None,
                parsed_json=parsed,
            )
        except Exception as exc:
            logger.exception("OCR failed for document %s", document.id)
            return OcrResult(status="failed", error=str(exc))


_provider: OcrProvider | None = None


def get_ocr_provider() -> OcrProvider:
    global _provider
    if _provider is None:
        try:
            import pytesseract  # noqa: F401

            _provider = TesseractOcrProvider()
        except ImportError:
            from app.services.ocr.noop_provider import NoopOcrProvider

            _provider = NoopOcrProvider()
    return _provider


async def run_document_ocr(document: DocumentUpload, signed_get_url: str) -> OcrResult:
    return await get_ocr_provider().process(document, signed_get_url)


async def run_document_ocr_bytes(document: DocumentUpload, data: bytes) -> OcrResult:
    """OCR from in-memory file bytes (server-side upload path)."""
    try:
        text = _bytes_to_text(data, document.content_type, document.original_filename)
        if not text.strip():
            text = document.original_filename or ""
        parsed = parse_for_document_type(document.document_type, text)
        return OcrResult(
            status="completed",
            text=text[:50_000] if text else None,
            parsed_json=parsed,
        )
    except Exception as exc:
        logger.exception("OCR failed for document %s", document.id)
        return OcrResult(status="failed", error=str(exc))
