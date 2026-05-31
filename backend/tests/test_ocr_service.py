"""Unit tests for OCR text parsers (no Tesseract required)."""

from app.services.ocr_parsers import parse_paystub_text, parse_receipt_text, parse_document_text


def test_parse_receipt_text_extracts_vendor_and_total():
    text = """
    ACME GROCERY
    Date: 01/15/2026
    Total: $42.50
    Thank you
    """
    parsed = parse_receipt_text(text)
    assert parsed["vendor_name"] == "ACME GROCERY"
    assert parsed["amount"] == "42.50"
    assert parsed["confidence"] in ("medium", "high")


def test_parse_paystub_text_extracts_net_and_employer():
    text = """
    Employer: Contoso LLC
    Pay Date: 03/01/2026
    Gross Pay: $3,500.00
    Net Pay: $2,450.00
    """
    parsed = parse_paystub_text(text)
    assert parsed["employer_name"] == "Contoso LLC"
    assert parsed["gross_amount"] == "3500.00"
    assert parsed["net_amount"] == "2450.00"
    assert parsed["pay_date"] == "2026-03-01"
    # A normal paystub must not be flagged suspicious.
    assert parsed["is_suspicious"] is False
    assert parsed["sanity_errors"] == []


def test_parse_document_text_routes_by_type():
    receipt = parse_document_text("Total: $10.00\nStore", "receipt")
    assert "vendor_name" in receipt
    paystub = parse_document_text("Employer: X\nNet Pay: $100.00", "paystub")
    assert paystub.get("net_amount") == "100.00"


def test_parse_paystub_text_flags_suspicious_cases():
    text = """
    Employer: TinyCo
    Pay Date: 01/01/2026
    Gross Pay: $18,000.00
    Net Pay: $200.00
    """
    parsed = parse_paystub_text(text)
    # Even when flagged, the parser must still return numeric values so the
    # user can review and correct them in the confirm drawer.
    assert parsed["gross_amount"] == "18000.00"
    assert parsed["net_amount"] == "200.00"
    assert parsed.get("is_suspicious") is True
    # The reason must be explained in sanity_errors.
    assert parsed.get("sanity_errors")
    assert "gross_too_large_vs_net" in parsed.get("sanity_errors", []) or "gross_exceeds_max" in parsed.get("sanity_errors", [])
