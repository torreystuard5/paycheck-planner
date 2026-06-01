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


# Multi-column pay summary table: Current vs YTD rows. Defaults must come from
# the Current row and the correct columns, and the Check Date — not YTD values
# and not the Pay Period Begin date.
PAY_SUMMARY_STUB = (
    "ACME PAYROLL SERVICES\n"
    "Employee: Jane Doe   Employer: Globex Corp\n"
    "Pay Period Begin: 05/03/2026   Pay Period End: 05/18/2026   Check Date: 05/22/2026\n"
    "Hours Worked   Gross Pay   Pre Tax Deductions   Employee Taxes   Post Tax Deductions   Net Pay\n"
    "Current   59.23   1,449.88   165.83   171.78   65.73   1,046.54\n"
    "YTD   714.68   18,750.27   1,531.53   2,504.01   758.17   13,956.56\n"
)


def test_parse_paystub_summary_table_uses_current_row_and_check_date():
    parsed = parse_paystub_text(PAY_SUMMARY_STUB)

    # Defaults come from the Current row's Gross Pay / Net Pay columns.
    assert parsed["gross_amount"] == "1449.88"
    assert parsed["net_amount"] == "1046.54"
    # Pay date is the Check Date, not Pay Period Begin (05/03).
    assert parsed["pay_date"] == "2026-05-22"
    # Plausible numbers — not flagged.
    assert parsed["is_suspicious"] is False
    assert parsed["sanity_errors"] == []


def test_parse_paystub_summary_table_never_uses_ytd_or_employee_taxes():
    parsed = parse_paystub_text(PAY_SUMMARY_STUB)

    # YTD gross / net must never leak into the paycheck defaults.
    assert parsed["gross_amount"] != "18750.27"
    assert parsed["net_amount"] != "13956.56"
    # Employee Taxes (Current 171.78 / YTD 2504.01) must never be used as net.
    assert parsed["net_amount"] not in {"171.78", "2504.01"}


# Full header section (label row + data row) over the summary table. Employer
# must come from the Company column and pay date from the Check Date column —
# not the header label row and not Pay Period Begin (05/03).
HEADER_TABLE_STUB = (
    "Name  Company  Employee ID  Pay Period Begin  Pay Period End  Check Date  Check Number\n"
    "Torrey Stuard  Vanderbilt University Medical Center  0150776  05/03/2026  05/16/2026  05/22/2026  000123\n"
    "\n"
    "Hours Worked  Gross Pay  Pre Tax Deductions  Employee Taxes  Post Tax Deductions  Net Pay\n"
    "Current  59.23  1,449.88  165.83  171.78  65.73  1,046.54\n"
    "YTD  714.68  18,750.27  1,531.53  2,504.01  758.17  13,956.56\n"
)


def test_parse_paystub_header_table_maps_company_and_check_date():
    parsed = parse_paystub_text(HEADER_TABLE_STUB)

    # Employer comes from the Company column, pay date from the Check Date column.
    assert parsed["employer_name"] == "Vanderbilt University Medical Center"
    assert parsed["pay_date"] == "2026-05-22"
    # gross/net still come from the Current row and are unchanged.
    assert parsed["gross_amount"] == "1449.88"
    assert parsed["net_amount"] == "1046.54"
    assert parsed["is_suspicious"] is False


def test_parse_paystub_header_table_ignores_label_row_and_period_begin():
    parsed = parse_paystub_text(HEADER_TABLE_STUB)

    # The previously-wrong values must not appear.
    assert "Employee ID" not in (parsed["employer_name"] or "")
    assert "Pay Period" not in (parsed["employer_name"] or "")
    assert parsed["pay_date"] != "2026-05-03"
