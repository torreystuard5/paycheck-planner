"""Database connectivity and Alembic revision checks for deploy/startup health."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
_PG_ADVISORY_LOCK_KEY = 834729104


def redact_database_url(url: str) -> str:
    """Return host/db fragment safe for logs (no credentials)."""
    if not url:
        return "(unset)"
    try:
        # postgresql[+asyncpg]://user:pass@host:port/dbname
        m = re.match(
            r"^(?:postgres(?:ql)?(?:\+\w+)?://)(?:[^@]+@)?([^/]+)(/.*)?$",
            url,
        )
        if m:
            host = m.group(1)
            db = (m.group(2) or "").lstrip("/") or "?"
            return f"{host}/{db}"
    except Exception:
        pass
    return "(redacted)"


def get_alembic_head() -> str | None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(_ALEMBIC_INI))
    return ScriptDirectory.from_config(cfg).get_current_head()


async def get_current_revision(session: AsyncSession) -> str | None:
    try:
        result = await session.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        )
        return result.scalar_one_or_none()
    except Exception:
        return None


async def check_db_connection(session: AsyncSession) -> bool:
    try:
        await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@dataclass
class MigrationStatus:
    db_ok: bool
    current: str | None
    head: str | None
    migration_ok: bool
    database_host: str

    def to_health_payload(self) -> dict[str, Any]:
        ok = self.db_ok and self.migration_ok
        payload: dict[str, Any] = {
            "status": "healthy" if ok else "degraded",
            "db": "ok" if self.db_ok else "error",
            "migration_ok": self.migration_ok,
            "migration_current": self.current,
            "migration_head": self.head,
        }
        if self.db_ok and not self.migration_ok:
            payload["migration_status"] = "behind"
        return payload

    def log_startup_summary(self) -> None:
        host = self.database_host
        if not self.db_ok:
            logger.error(
                "[startup] Database connection FAILED (target=%s). "
                "Check DATABASE_URL and Postgres availability.",
                host,
            )
            return
        if self.migration_ok:
            logger.info(
                "[startup] Database OK (%s). Schema at revision %s (head=%s).",
                host,
                self.current,
                self.head,
            )
        else:
            logger.error(
                "[startup] Database connected (%s) but schema is BEHIND: "
                "current=%s head=%s. Migrations should run via start.sh before uvicorn.",
                host,
                self.current,
                self.head,
            )


async def build_migration_status(session: AsyncSession) -> MigrationStatus:
    from app.config import settings

    head = get_alembic_head()
    db_ok = await check_db_connection(session)
    current = await get_current_revision(session) if db_ok else None
    migration_ok = bool(db_ok and head and current == head)
    return MigrationStatus(
        db_ok=db_ok,
        current=current,
        head=head,
        migration_ok=migration_ok,
        database_host=redact_database_url(settings.DATABASE_URL),
    )
