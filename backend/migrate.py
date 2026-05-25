"""Run Alembic migrations (used by start.sh before uvicorn on every deploy).

Exits non-zero on failure so Render aborts the deploy/start.
Uses a PostgreSQL advisory lock to avoid concurrent upgrades.
"""

from __future__ import annotations

import logging
import sys
import traceback

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.config import settings
from app.services.migration_status import (
    _PG_ADVISORY_LOCK_KEY,
    get_alembic_head,
    redact_database_url,
)

BASE_DIR = Path(__file__).resolve().parent
ALEMBIC_CFG_PATH = BASE_DIR / "alembic.ini"

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("migrate")


def _sync_database_url() -> str:
    url = settings.DATABASE_URL
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")


def _read_current_revision(sync_url: str) -> str | None:
    engine = create_engine(sync_url, poolclass=NullPool)
    try:
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            return ctx.get_current_revision()
    finally:
        engine.dispose()


def run_migrations() -> None:
    cfg = Config(str(ALEMBIC_CFG_PATH))
    sync_url = _sync_database_url()
    head = get_alembic_head()
    host = redact_database_url(settings.DATABASE_URL)

    log.info("Migration target: %s", host)
    log.info("Alembic head revision: %s", head)

    try:
        before = _read_current_revision(sync_url)
    except Exception as exc:
        log.error("Could not read current revision (is alembic_version present?): %s", exc)
        traceback.print_exc()
        sys.exit(1)

    log.info("Current revision before upgrade: %s", before)
    if before == head:
        log.info("Database already at head — no upgrade needed.")
        return

    log.info("Running Alembic upgrade to head...")
    engine = create_engine(sync_url, poolclass=NullPool)
    try:
        with engine.connect() as conn:
            conn.execute(text(f"SELECT pg_advisory_lock({_PG_ADVISORY_LOCK_KEY})"))
            conn.commit()
            try:
                command.upgrade(cfg, "head")
            finally:
                conn.execute(text(f"SELECT pg_advisory_unlock({_PG_ADVISORY_LOCK_KEY})"))
                conn.commit()
    except Exception:
        log.error("Alembic migration FAILED — aborting start/deploy")
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.dispose()

    try:
        after = _read_current_revision(sync_url)
    except Exception as exc:
        log.error("Upgrade ran but could not verify revision: %s", exc)
        sys.exit(1)

    log.info("Current revision after upgrade: %s", after)
    if after != head:
        log.error("Expected head %s but database is at %s", head, after)
        sys.exit(1)
    log.info("Alembic upgrade complete — schema at head %s.", after)


if __name__ == "__main__":
    run_migrations()
