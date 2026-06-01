"""Heuristic text parsers for receipt, paystub, and tax documents (no Tesseract)."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from typing import List

from app.config import settings

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


def parse_amount_from_text(s: str) -> Decimal | None:
    """Robustly extract a single monetary amount from free text.

    Returns a Decimal or None. Strips commas and ignores malformed values.
    """
    if not s:
        return None
    # Try common labelled patterns first
    for pat in (_AMOUNT_RE, _FALLBACK_AMOUNT_RE):
        m = pat.search(s)
        if m:
            try:
                return Decimal(m.group(1).replace(",", ""))
            except InvalidOperation:
                break
    # Fallback: find any $amount pattern
    m = re.search(r"\$\s*([\d,]+\.\d{2})", s)
    if m:
        try:
            return Decimal(m.group(1).replace(",", ""))
        except InvalidOperation:
            return None
    # Last resort: any bare number with two decimals
    m = re.search(r"([\d,]+\.\d{2})", s)
    if m:
        try:
            return Decimal(m.group(1).replace(",", ""))
        except InvalidOperation:
            return None
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


# Known summary-table columns, with the labels OCR text tends to use. Order
# here is irrelevant — the actual column order is read from the header line.
_PAYSTUB_COLUMNS = [
    ("hours_worked", re.compile(r"hours\s*worked", re.I)),
    ("gross_pay", re.compile(r"gross\s*pay", re.I)),
    ("pre_tax", re.compile(r"pre[\s-]*tax\s*deductions?", re.I)),
    ("employee_taxes", re.compile(r"employee\s*taxes?", re.I)),
    ("post_tax", re.compile(r"post[\s-]*tax\s*deductions?", re.I)),
    ("net_pay", re.compile(r"net\s*pay", re.I)),
]

_MONEY_TOKEN_RE = re.compile(r"[\d,]+\.\d{2}")
_CHECK_DATE_RE = re.compile(
    r"check\s*date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})",
    re.I,
)


def _extract_check_date(text: str) -> date | None:
    """Pull the Check Date specifically (never Pay Period Begin/End)."""
    m = _CHECK_DATE_RE.search(text or "")
    if not m:
        return None
    raw = m.group(1)
    if re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", raw):
        try:
            return date.fromisoformat(raw)
        except ValueError:
            return None
    return _parse_loose_date(raw)


def _summary_row_values(lines: list[str], start: int, keyword: str) -> list[Decimal] | None:
    """Return the money values from the first row after ``start`` whose label
    matches ``keyword`` (e.g. "current", "ytd")."""
    pat = re.compile(rf"\b{keyword}\b", re.I)
    for line in lines[start + 1:]:
        if pat.search(line):
            vals: list[Decimal] = []
            for raw in _MONEY_TOKEN_RE.findall(line):
                try:
                    vals.append(Decimal(raw.replace(",", "")))
                except InvalidOperation:
                    continue
            return vals
    return None


def _parse_pay_summary_table(text: str) -> dict[str, Any] | None:
    """Detect a multi-column pay summary table and read the *Current* row.

    Returns ``None`` when the text does not look like such a table (so plain
    "Gross Pay: $X" stubs are unaffected). When a table is detected, returns a
    dict whose ``gross``/``net`` are Decimals from the Current row, or ``None``
    when the table could not be confidently mapped — signalling the caller to
    fall back to the heuristic and flag the parse. YTD values are read but kept
    out of the paycheck defaults.
    """
    if not text:
        return None
    lines = text.splitlines()

    # The column-header line carries BOTH labels together; a simple labelled
    # stub keeps Gross Pay and Net Pay on separate lines, so it won't match.
    header_idx = None
    for i, line in enumerate(lines):
        low = line.lower()
        if "gross pay" in low and "net pay" in low:
            header_idx = i
            break
    if header_idx is None:
        return None

    header = lines[header_idx]
    found = [(m.start(), name) for name, pat in _PAYSTUB_COLUMNS if (m := pat.search(header))]
    found.sort()
    order = [name for _, name in found]
    if "gross_pay" not in order or "net_pay" not in order:
        return None
    gross_idx = order.index("gross_pay")
    net_idx = order.index("net_pay")

    current_vals = _summary_row_values(lines, header_idx, "current")
    ytd_vals = _summary_row_values(lines, header_idx, "ytd")
    if ytd_vals is None:
        ytd_vals = _summary_row_values(lines, header_idx, "year to date")

    result: dict[str, Any] = {"gross": None, "net": None, "ytd_gross": None, "ytd_net": None}
    if current_vals is not None and len(current_vals) == len(order):
        result["gross"] = current_vals[gross_idx]
        result["net"] = current_vals[net_idx]
    if ytd_vals is not None and len(ytd_vals) == len(order):
        result["ytd_gross"] = ytd_vals[gross_idx]
        result["ytd_net"] = ytd_vals[net_idx]
    return result


# Header-section labels we care about. Each must match a whole table cell so a
# plain "Employer: X" line (one cell, with the value attached) never matches.
_HEADER_LABELS = {
    "company": re.compile(r"company|employer(?:\s*name)?", re.I),
    "check_date": re.compile(r"check\s*date", re.I),
}


def _split_cells(line: str) -> list[str]:
    """Split a layout-preserved table line into cells on runs of 2+ spaces."""
    return [c for c in re.split(r"\s{2,}", line.strip()) if c]


def _label_index(cells: list[str], key: str) -> int | None:
    pat = _HEADER_LABELS[key]
    for i, cell in enumerate(cells):
        if pat.fullmatch(cell.strip()):
            return i
    return None


def _parse_header_table(text: str) -> dict[str, Any] | None:
    """Map the paystub header's label row to the data row beneath it.

    Looks for a row whose cells include both a Company and a Check Date label,
    then reads the matching cells from the next data row. Returns ``None`` when
    no such header is present (so simple "Employer: X" stubs are handled by the
    caller's label regex instead). When the header is found but the data row's
    columns don't line up, returns a dict with ``None`` values so the caller
    won't fall back to the label-row-grabbing regex.
    """
    if not text:
        return None
    lines = text.splitlines()
    for i, line in enumerate(lines):
        cells = _split_cells(line)
        if len(cells) < 2:
            continue
        company_idx = _label_index(cells, "company")
        check_idx = _label_index(cells, "check_date")
        if company_idx is None or check_idx is None:
            continue

        data_cells: list[str] = []
        for nxt in lines[i + 1:]:
            if nxt.strip():
                data_cells = _split_cells(nxt)
                break
        if len(data_cells) != len(cells):
            return {"company": None, "check_date": None}

        company = data_cells[company_idx].strip()[:200] or None
        check_date = _parse_loose_date(data_cells[check_idx].strip())
        return {"company": company, "check_date": check_date}
    return None


def parse_paystub_text(text: str) -> dict[str, Any]:
    t = text or ""

    # Header section: a label row (Name, Company, ..., Check Date, Check Number)
    # over a data row. Map Company -> employer and Check Date -> pay date.
    header = _parse_header_table(t)

    employer = header.get("company") if header else None
    if employer is None and header is None:
        m = re.search(r"(?:Employer|Company|Employer Name)\s*[:\s]+\s*(.+?)(?:\n|$)", t, re.I)
        if m:
            employer = m.group(1).strip()[:200]

    # Pay date priority: the header's Check Date column, then an inline
    # "Check Date:" label, then the first date (often Pay Period Begin).
    pay_date = header.get("check_date") if header else None
    if pay_date is None:
        pay_date = _extract_check_date(t)
    if pay_date is None:
        dates = re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", t)
        pay_date = _parse_loose_date(dates[0]) if dates else None

    # Extract candidate amounts using a robust helper
    money = re.findall(r"\$?\s*([\d,]+\.\d{2})\b", t)
    amounts: List[Decimal] = []
    for raw in money[:40]:
        try:
            amounts.append(Decimal(raw.replace(",", "")))
        except InvalidOperation:
            continue

    gross = None
    net = None

    # 1) Strongly prefer a confidently-parsed summary table's Current row so we
    #    never pick up YTD figures or use Employee Taxes as net.
    table = _parse_pay_summary_table(t)
    table_detected = table is not None
    table_confident = bool(table and table.get("gross") is not None and table.get("net") is not None)

    taxes = None
    confident = False

    if table_confident:
        gross = table["gross"]
        net = table["net"]
        confident = True
    else:
        # 2) Otherwise fall back to explicit labelled gross/net, then inference.
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
        if tax_m:
            try:
                taxes = Decimal(tax_m.group(1).replace(",", ""))
            except InvalidOperation:
                taxes = None

        confident = bool(net_m or gross_m)
        # If still missing, try to infer from positional amounts
        if gross is None and amounts:
            gross = max(amounts)
        if net is None and amounts:
            net = amounts[-1] if len(amounts) >= 2 else (amounts[0] if amounts else None)

    sanity_errors: List[str] = []
    # A table we could see but not confidently map is risky — flag it so the
    # user double-checks the heuristic fallback values.
    if table_detected and not table_confident:
        sanity_errors.append("summary_table_unparsed")
    # Perform sanity checks using configured thresholds
    try:
        if gross is not None and net is not None:
            if gross < net:
                sanity_errors.append("gross_less_than_net")
            # Avoid division by zero
            if net == 0:
                sanity_errors.append("net_is_zero")
            else:
                ratio = float(gross / net)
                if ratio > float(settings.PAYSTUB_GROSS_NET_RATIO):
                    sanity_errors.append("gross_too_large_vs_net")
        if gross is not None and float(gross) > float(settings.PAYSTUB_MAX_PLAUSIBLE_GROSS):
            sanity_errors.append("gross_exceeds_max")
        if net is not None and float(net) <= 0:
            sanity_errors.append("net_nonpositive")
    except Exception:
        # Non-fatal — don't crash parsing on unexpected numeric issues
        pass

    is_suspicious = bool(sanity_errors)

    return {
        "employer_name": employer,
        "pay_date": pay_date.isoformat() if pay_date else None,
        "gross_amount": str(gross) if gross is not None else None,
        "net_amount": str(net) if net is not None else None,
        "taxes_withheld": str(taxes) if taxes is not None else None,
        "confidence": "high" if confident else ("medium" if len(t) > 40 else "low"),
        "is_suspicious": is_suspicious,
        "sanity_errors": sanity_errors,
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
