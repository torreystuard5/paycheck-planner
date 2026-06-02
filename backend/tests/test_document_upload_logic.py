"""Unit tests for document upload helpers (no DB)."""

import pytest

from app.services.document_link import validate_business_link_target
from app.services.document_scope import document_access_scope, document_owner_scope
from app.services.document_upload_flow import ingest_document_bytes, normalize_content_type
from app.services.ocr_parsers import parse_document_text, parse_paystub_text
from app.services.storage.r2_health import r2_config_status

import asyncio
from fastapi import HTTPException
from uuid import uuid4


def test_r2_config_status_reports_missing(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "")
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", "")
    monkeypatch.setattr(settings, "R2_BUCKET_NAME", "")
    monkeypatch.setattr(settings, "R2_ENDPOINT_URL", "")
    out = r2_config_status()
    assert out["configured"] is False
    assert "R2_ACCESS_KEY_ID" in out["missing"]


def test_parse_document_text_paystub_route():
    parsed = parse_document_text("Employer: X\nNet Pay: $500.00", "paystub")
    assert parsed["net_amount"] == "500.00"


def test_parse_paystub_pay_date_from_body():
    parsed = parse_paystub_text("Employer: Acme\nPay Date: 03/01/2026\nNet Pay: $100.00")
    assert parsed["pay_date"] == "2026-03-01"


def test_parse_paystub_summary_table_maps_current_row():
    text = (
        "Pay Period Begin: 05/03/2026   Check Date: 05/22/2026\n"
        "Hours Worked   Gross Pay   Pre Tax Deductions   Employee Taxes   Post Tax Deductions   Net Pay\n"
        "Current   59.23   1,449.88   165.83   171.78   65.73   1,046.54\n"
        "YTD   714.68   18,750.27   1,531.53   2,504.01   758.17   13,956.56\n"
    )
    parsed = parse_document_text(text, "paystub")
    # Current-row Gross/Net and the Check Date — not YTD, not Pay Period Begin.
    assert parsed["gross_amount"] == "1449.88"
    assert parsed["net_amount"] == "1046.54"
    assert parsed["pay_date"] == "2026-05-22"


def test_parse_paystub_header_table_company_and_check_date():
    text = (
        "Name  Company  Employee ID  Pay Period Begin  Pay Period End  Check Date  Check Number\n"
        "Torrey Stuard  Vanderbilt University Medical Center  0150776  05/03/2026  05/16/2026  05/22/2026  000123\n"
    )
    parsed = parse_document_text(text, "paystub")
    # Employer from the Company column; pay date from the Check Date column.
    assert parsed["employer_name"] == "Vanderbilt University Medical Center"
    assert parsed["pay_date"] == "2026-05-22"


def test_parse_paystub_single_space_header_company_and_check_date():
    text = (
        "Name Company Employee ID Pay Period Begin Pay Period End Check Date Check Number\n"
        "Torrey Stuard Vanderbilt University Medical Center 0150776 05/03/2026 05/16/2026 05/22/2026 000123\n"
    )
    parsed = parse_document_text(text, "paystub")
    assert parsed["employer_name"] == "Vanderbilt University Medical Center"
    assert parsed["pay_date"] == "2026-05-22"
    assert parsed["pay_date"] != "2026-05-03"


def test_parse_paystub_split_label_row_vanderbilt():
    text = (
        "Name Company Employee ID\n"
        "Pay Period Begin Pay Period End Check Date Check Number\n"
        "Torrey Stuard Vanderbilt University Medical Center 0150776 05/03/2026 05/16/2026 05/22/2026 000123\n"
    )
    parsed = parse_document_text(text, "paystub")
    assert parsed["employer_name"] == "Vanderbilt University Medical Center"
    assert parsed["pay_date"] == "2026-05-22"
    assert "Employee ID" not in (parsed["employer_name"] or "")


def test_document_scope_helpers_are_callable():
    from uuid import uuid4

    class U:
        id = uuid4()
        household_id = None

    assert document_access_scope(U()) is not None
    assert document_owner_scope(U()) is not None


def test_normalize_content_type_falls_back_from_filename():
    assert normalize_content_type(None, 'receipt.pdf') == 'application/pdf'
    assert normalize_content_type('', 'photo.heic') == 'image/heic'
    assert normalize_content_type('image/heif', 'photo.jpg') == 'image/jpeg'
    assert normalize_content_type('', 'unknown.xyz') == 'application/octet-stream'


def test_ingest_document_bytes_rejects_invalid_document_type():
    class DummyDB:
        pass

    with pytest.raises(HTTPException):
        asyncio.run(
            ingest_document_bytes(
                db=DummyDB(),
                user_id=uuid4(),
                household_id=None,
                budget_id=None,
                document_type='invalid_type',
                filename='file.pdf',
                content_type='application/pdf',
                raw=b'test',
                object_key_prefix='uploads/user',
                allowed_types=frozenset({'receipt'}),
                allowed_content_types=frozenset({'application/pdf'}),
            )
        )


def test_ingest_document_bytes_rejects_invalid_content_type():
    class DummyDB:
        pass

    with pytest.raises(HTTPException):
        asyncio.run(
            ingest_document_bytes(
                db=DummyDB(),
                user_id=uuid4(),
                household_id=None,
                budget_id=None,
                document_type='receipt',
                filename='file.txt',
                content_type='text/plain',
                raw=b'test',
                object_key_prefix='uploads/user',
                allowed_types=frozenset({'receipt'}),
                allowed_content_types=frozenset({'application/pdf'}),
            )
        )


def test_validate_business_link_target_raises_when_deduction_missing():
    class DummyResult:
        def __init__(self, row):
            self.row = row

        def scalar_one_or_none(self):
            return self.row

    class DummyDB:
        def __init__(self, row):
            self.row = row

        async def execute(self, query):
            return DummyResult(self.row)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            validate_business_link_target(
                db=DummyDB(None),
                owner_id=uuid4(),
                entity_type='business_deduction',
                entity_id=uuid4(),
            )
        )
    assert exc.value.status_code == 404


def test_validate_business_link_target_succeeds_when_deduction_exists():
    class DummyResult:
        def __init__(self, row):
            self.row = row

        def scalar_one_or_none(self):
            return self.row

    class DummyDB:
        def __init__(self, row):
            self.row = row

        async def execute(self, query):
            return DummyResult(self.row)

    asyncio.run(
        validate_business_link_target(
            db=DummyDB(object()),
            owner_id=uuid4(),
            entity_type='business_deduction',
            entity_id=uuid4(),
        )
    )
