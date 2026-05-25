#!/usr/bin/env python3
"""Sync merged public changelog (history + CHANGELOG.md) into app_updates.

Runs on every deploy via start.sh so the in-app Changelog page updates automatically.
Idempotent: matches on (date, description); does not delete admin-only rows.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.app_update import AppUpdate
from app.models.user import User
from app.services.public_changelog import CHANGELOG_PATH, merge_public_entries


class ChangelogSyncError(RuntimeError):
    pass


async def sync_changelog() -> int:
    """Upsert public changelog entries. Returns count inserted. Raises on fatal error."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ChangelogSyncError("DATABASE_URL not set")

    if not CHANGELOG_PATH.is_file():
        raise ChangelogSyncError(f"Missing {CHANGELOG_PATH} — run: npm run changelog")

    entries = merge_public_entries()
    if not entries:
        raise ChangelogSyncError("No changelog entries parsed from history + CHANGELOG.md")

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            admin_result = await session.execute(
                select(User).where(User.is_admin.is_(True)).order_by(User.created_at.asc()).limit(1)
            )
            admin = admin_result.scalar_one_or_none()
            if not admin:
                admin_result = await session.execute(
                    select(User).order_by(User.created_at.asc()).limit(1)
                )
                admin = admin_result.scalar_one_or_none()
            if not admin:
                raise ChangelogSyncError("No users in database")

            now = datetime.now(timezone.utc)
            inserted = 0
            updated = 0
            for entry in entries:
                existing = await session.execute(
                    select(AppUpdate).where(
                        and_(
                            AppUpdate.date == entry.entry_date,
                            AppUpdate.description == entry.description,
                        )
                    )
                )
                row = existing.scalar_one_or_none()
                if row:
                    if row.type != entry.entry_type:
                        row.type = entry.entry_type
                        updated += 1
                    continue

                session.add(
                    AppUpdate(
                        date=entry.entry_date,
                        description=entry.description,
                        type=entry.entry_type,
                        created_by=admin.id,
                        created_at=now,
                    )
                )
                inserted += 1

            await session.commit()

        print(
            f"[changelog-sync] Done — {inserted} inserted, {updated} type-updated, "
            f"{len(entries)} total in source"
        )
        return inserted
    finally:
        await engine.dispose()


def main() -> None:
    try:
        asyncio.run(sync_changelog())
    except ChangelogSyncError as exc:
        print(f"[changelog-sync] ERROR: {exc}")
        sys.exit(1)
    except Exception:
        print("[changelog-sync] ERROR: sync failed")
        raise


if __name__ == "__main__":
    main()
