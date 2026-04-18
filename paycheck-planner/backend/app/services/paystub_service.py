"""Save paystub files and run OCR / PDF text extraction."""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".pdf"}


def upload_dir_root() -> Path:
    root = os.getenv("PAYSTUB_UPLOAD_DIR", "uploads")
    return Path(root)


def save_upload_file(user_id: uuid.UUID, filename: str, data: bytes) -> tuple[str, str]:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError("Invalid file type")
    uid = str(user_id)
    dest_dir = upload_dir_root() / "paystubs" / uid
    dest_dir.mkdir(parents=True, exist_ok=True)
    new_name = f"{uuid.uuid4()}{ext}"
    full = dest_dir / new_name
    full.write_bytes(data)
    rel = str(full.as_posix())
    ft = "pdf" if ext == ".pdf" else "image"
    return rel, ft


def _field(value: Any, confident: bool) -> dict[str, Any]:
    return {"value": value, "confidence": "confident" if confident else "needs_review"}


def extract_from_text(text: str) -> dict[str, Any]:
    """Heuristic extraction from raw OCR / PDF text."""
    t = text or ""
    t_norm = " ".join(t.split())

    employer = None
    m = re.search(r"(?:Employer|Company|Employer Name)\s*[:\s]+\s*(.+?)(?:\n|$)", t, re.I)
    if m:
        employer = m.group(1).strip()[:200]

    dates = re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", t)
    pay_date = None
    if dates:
        try:
            pay_date = _parse_loose_date(dates[0])
        except Exception:
            pay_date = None

    money = re.findall(r"\$?\s*([\d,]+\.\d{2})\b", t)
    amounts: list[Decimal] = []
    for raw in money[:20]:
        try:
            amounts.append(Decimal(raw.replace(",", "")))
        except InvalidOperation:
            continue

    gross = max(amounts) if amounts else None
    net = amounts[-1] if len(amounts) >= 2 else amounts[0] if amounts else None

    net_m = re.search(r"(?:Net\s*Pay|Take\s*Home|Net)\s*[:\s]*\$?\s*([\d,]+\.\d{2})", t, re.I)
    gross_m = re.search(r"(?:Gross\s*Pay|Gross)\s*[:\s]*\$?\s*([\d,]+\.\d{2})", t, re.I)
    tax_m = re.search(r"(?:Tax(?:es)?\s*Withheld|Total\s*Tax)\s*[:\s]*\$?\s*([\d,]+\.\d{2})", t, re.I)

    if net_m:
        try:
            net = Decimal(net_m.group(1).replace(",", ""))
        except InvalidOperation:
            pass
    if gross_m:
        try:
            gross = Decimal(gross_m.group(1).replace(",", ""))
        except InvalidOperation:
            pass
    taxes = None
    if tax_m:
        try:
            taxes = Decimal(tax_m.group(1).replace(",", ""))
        except InvalidOperation:
            taxes = None

    confident_employer = bool(employer and len(employer) > 2)
    confident_net = net is not None and bool(net_m)
    confident_gross = gross is not None and bool(gross_m)

    return {
        "employer_name": _field(employer or "Unknown employer", confident_employer),
        "pay_period_start": _field(None, False),
        "pay_period_end": _field(None, False),
        "gross_pay": _field(str(gross) if gross is not None else None, confident_gross),
        "net_pay": _field(str(net) if net is not None else None, confident_net),
        "taxes_withheld": _field(str(taxes) if taxes is not None else None, taxes is not None),
        "pay_date": _field(pay_date.isoformat() if pay_date else None, pay_date is not None),
    }


def _parse_loose_date(s: str) -> date:
    s = s.replace("-", "/")
    parts = s.split("/")
    if len(parts) != 3:
        raise ValueError("bad date")
    a, b, c = int(parts[0]), int(parts[1]), int(parts[2])
    if c < 100:
        c += 2000 if c < 70 else 1900
    if a > 12:
        return date(c, b, a)
    return date(c, a, b)


def extract_text_from_file(file_path: str, file_type: str) -> tuple[str, bool]:
    """Returns (text, used_ocr)."""
    path = Path(file_path)
    if not path.is_file():
        return "", False

    if file_type == "pdf" or path.suffix.lower() == ".pdf":
        try:
            import pdfplumber

            chunks = []
            with pdfplumber.open(str(path)) as pdf:
                for page in pdf.pages[:5]:
                    chunks.append(page.extract_text() or "")
            return "\n".join(chunks), False
        except Exception:
            logger.exception("pdfplumber failed")
            return "", False

    try:
        import pytesseract
        from PIL import Image

        img = Image.open(str(path))
        txt = pytesseract.image_to_string(img)
        return txt or "", True
    except Exception as e:
        logger.warning("Tesseract OCR unavailable: %s", e)
        return "", True


def run_ocr_on_file(file_path: str, file_type: str) -> dict[str, Any]:
    text, used_ocr = extract_text_from_file(file_path, file_type)
    if not text.strip():
        return {
            "error": "OCR not available. Please enter paystub details manually.",
            "extracted": extract_from_text(""),
            "raw_text": "",
        }
    extracted = extract_from_text(text)
    return {"extracted": extracted, "raw_text": text[:8000], "used_tesseract": used_ocr}
