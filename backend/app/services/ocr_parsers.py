"""Heuristic text parsers for receipt, paystub, and tax documents (no Tesseract)."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

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


def _parse_loose_date(s: str) -> date | None:
    try:
        raw = s.replace("-", "/")
        parts = raw.split("/")
        if len(parts) != 3:
            return None
        a, b, c = int(parts[0]), int(parts[1]), int(parts[2])
        if c < 100:
            c += 2000 if c < 70 else 1900
        if a > 12:
            return date(c, b, a)
        return date(c, a, b)
    except (ValueError, TypeError):
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
    amt = _parse_amount(text)
    due = _parse_date(text)
    return {
        "amount": str(amt) if amt is not None else None,
        "due_date": due.isoformat() if due else None,
        "vendor_name": _parse_vendor(text),
        "account_number": None,
        "confidence": "medium" if len(text) > 40 else "low",
    }


def parse_paystub_text(text: str) -> dict[str, Any]:
    t = text or ""
    employer = None
    m = re.search(r"(?:Employer|Company|Employer Name)\s*[:\s]+\s*(.+?)(?:\n|$)", t, re.I)
    if m:
        employer = m.group(1).strip()[:200]

    dates = re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", t)
    pay_date = _parse_loose_date(dates[0]) if dates else None

    money = re.findall(r"\$?\s*([\d,]+\.\d{2})\b", t)
    amounts: list[Decimal] = []
    for raw in money[:20]:
        try:
            amounts.append(Decimal(raw.replace(",", "")))
        except InvalidOperation:
            continue

    gross = max(amounts) if amounts else None
    net = amounts[-1] if len(amounts) >= 2 else (amounts[0] if amounts else None)

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

    confident = bool(net_m or gross_m)
    return {
        "employer_name": employer,
        "pay_date": pay_date.isoformat() if pay_date else None,
        "gross_amount": str(gross) if gross is not None else None,
        "net_amount": str(net) if net is not None else None,
        "taxes_withheld": str(taxes) if taxes is not None else None,
        "confidence": "high" if confident else ("medium" if len(t) > 40 else "low"),
    }


def parse_tax_document_text(text: str) -> dict[str, Any]:
    base = parse_receipt_text(text)
    base["document_kind"] = "tax"
    return base


def parse_for_document_type(document_type: str, text: str) -> dict[str, Any]:
    if document_type == "paystub":
        return parse_paystub_text(text)
    if document_type == "receipt":
        return parse_receipt_text(text)
    if document_type == "tax":
        return parse_tax_document_text(text)
    if text.strip():
        return {"preview": text.strip()[:500], "confidence": "low"}
    return {"confidence": "low"}


def parse_document_text(text: str, document_type: str) -> dict[str, Any]:
    return parse_for_document_type(document_type, text)
