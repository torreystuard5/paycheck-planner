"""OCR for receipt/bill uploads — pluggable provider with Tesseract when available."""

from __future__ import annotations

import io
import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.models.document_upload import DocumentUpload
from app.services.ocr.base import OcrProvider, OcrResult
from app.services.ocr.noop_provider import NoopOcrProvider

logger = logging.getLogger(__name__)

_AMOUNT_RE = re.compile(
    r"(?:total|amount due|balance due|due)[:\s]*\$?\s*([\d,]+\.\d{2})",
    re.IGNORECASE,
)
_FALLBACK_AMOUNT_RE = re.compile(r"\$\s*([\d,]+\.\d{2})")
_DATE_RE = re.compile(
    r"(?:due|pay by|payment due)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    re.IGNORECASE,
)
_VENDOR_SKIP = re.compile(r"^(total|amount|due|bill|invoice|statement)\b", re.I)


def _parse_amount(text: str) -> Decimal | None:
    for pat in (_AMOUNT_RE, _FALLBACK_AMOUNT_RE):
        m = pat.search(text)
        if m:
            try:
                return Decimal(m.group(1).replace(",", ""))
            except InvalidOperation:
                continue
    return None


def _parse_date(text: str) -> date | None:
    m = _DATE_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace("-", "/")
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _parse_vendor(text: str) -> str | None:
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 3 or len(line) > 80:
            continue
        if _VENDOR_SKIP.match(line):
            continue
        if re.search(r"\d{2}/\d{2}", line):
            continue
        return line
    return None


def parse_receipt_text(text: str) -> dict[str, Any]:
    return {
        "amount": str(_parse_amount(text)) if _parse_amount(text) is not None else None,
        "due_date": _parse_date(text).isoformat() if _parse_date(text) else None,
        "vendor_name": _parse_vendor(text),
        "account_number": None,
        "confidence": "medium" if len(text) > 40 else "low",
    }


async def _download_bytes(url: str, max_bytes: int = 10_485_760) -> bytes:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.content
        if len(data) > max_bytes:
            raise ValueError("File exceeds maximum size for OCR")
        return data


def _image_to_text(data: bytes, content_type: str | None) -> str:
    try:
        from PIL import Image
    except ImportError:
        return ""

    try:
        import pytesseract
    except ImportError:
        logger.info("pytesseract not installed — using filename heuristics only")
        return ""

    img = Image.open(io.BytesIO(data))
    if content_type and "heic" in content_type.lower():
        img = img.convert("RGB")
    return pytesseract.image_to_string(img) or ""


class TesseractOcrProvider(OcrProvider):
    async def process(self, document: DocumentUpload, signed_get_url: str) -> OcrResult:
        try:
            data = await _download_bytes(signed_get_url)
            text = _image_to_text(data, document.content_type)
            if not text.strip():
                text = document.original_filename or ""
            parsed = parse_receipt_text(text)
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
            _provider = TesseractOcrProvider()
    return _provider


async def run_document_ocr(document: DocumentUpload, signed_get_url: str) -> OcrResult:
    return await get_ocr_provider().process(document, signed_get_url)
