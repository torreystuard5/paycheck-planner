"""Unit tests for migration status helpers (no DB required for head/redact)."""

from app.services.migration_status import get_alembic_head, redact_database_url


def test_redact_database_url_hides_credentials():
    url = "postgresql+asyncpg://user:secret@dpg-abc.oregon-postgres.render.com/paydrift"
    assert "secret" not in redact_database_url(url)
    assert "dpg-abc" in redact_database_url(url)


def test_get_alembic_head_is_single_revision():
    head = get_alembic_head()
    assert head is not None
    assert len(head) <= 4  # e.g. "048"
