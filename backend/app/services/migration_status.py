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

# Tables that must exist when alembic_version matches head (catches stamp drift).
CRITICAL_TABLES = (
    "shopping_list_items",
    "pay_period_item_overrides",
    "business_team_members",
)


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


async def verify_critical_tables(session: AsyncSession) -> dict[str, bool]:
    """Return {table_name: exists} for CRITICAL_TABLES."""
    out: dict[str, bool] = {}
    for name in CRITICAL_TABLES:
        try:
            result = await session.execute(
                text("SELECT to_regclass(:regclass) IS NOT NULL"),
                {"regclass": f"public.{name}"},
            )
            out[name] = bool(result.scalar())
        except Exception:
            out[name] = False
    return out


@dataclass
class MigrationStatus:
    db_ok: bool
    current: str | None
    head: str | None
    migration_ok: bool
    database_host: str
    tables_ok: bool = True
    missing_tables: tuple[str, ...] = ()

    def to_health_payload(self) -> dict[str, Any]:
        ok = self.db_ok and self.migration_ok and self.tables_ok
        payload: dict[str, Any] = {
            "status": "healthy" if ok else "degraded",
            "db": "ok" if self.db_ok else "error",
            "migration_ok": self.migration_ok,
            "migration_current": self.current,
            "migration_head": self.head,
            "schema_tables_ok": self.tables_ok,
        }
        if self.missing_tables:
            payload["missing_tables"] = list(self.missing_tables)
        if self.db_ok and not self.migration_ok:
            payload["migration_status"] = "behind"
        if self.db_ok and self.migration_ok and not self.tables_ok:
            payload["migration_status"] = "tables_missing"
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
        if self.migration_ok and self.tables_ok:
            logger.info(
                "[startup] Database OK (%s). Schema at revision %s (head=%s).",
                host,
                self.current,
                self.head,
            )
        elif self.migration_ok and not self.tables_ok:
            logger.error(
                "[startup] Database at revision %s but missing tables: %s. "
                "Run pending migrations (start.sh should apply head %s).",
                self.current,
                ", ".join(self.missing_tables),
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
    tables: dict[str, bool] = {}
    if db_ok and migration_ok:
        tables = await verify_critical_tables(session)
    missing = tuple(name for name, ok in tables.items() if not ok)
    tables_ok = not missing
    return MigrationStatus(
        db_ok=db_ok,
        current=current,
        head=head,
        migration_ok=migration_ok,
        database_host=redact_database_url(settings.DATABASE_URL),
        tables_ok=tables_ok,
        missing_tables=missing,
    )
