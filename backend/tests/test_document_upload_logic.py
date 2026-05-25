"""Unit tests for document upload helpers (no DB)."""

from app.services.document_scope import document_access_scope, document_owner_scope
from app.services.ocr_parsers import parse_document_text, parse_paystub_text
from app.services.storage.r2_health import r2_config_status


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


def test_document_scope_helpers_are_callable():
    from uuid import uuid4

    class U:
        id = uuid4()
        household_id = None

    assert document_access_scope(U()) is not None
    assert document_owner_scope(U()) is not None
