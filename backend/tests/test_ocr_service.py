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


def test_parse_document_text_routes_by_type():
    receipt = parse_document_text("Total: $10.00\nStore", "receipt")
    assert "vendor_name" in receipt
    paystub = parse_document_text("Employer: X\nNet Pay: $100.00", "paystub")
    assert paystub.get("net_amount") == "100.00"
