#!/usr/bin/env python3
"""
Seed historical changelog entries into the app_updates table.

Usage (from the backend/ directory):
    python -m scripts.seed_changelog_history

Or from Render shell:
    cd backend && python -m scripts.seed_changelog_history

Requirements:
    - DATABASE_URL env var must be set (async postgres URL)
    - At least one admin user must exist in the users table

Behavior:
    - Idempotent: skips entries whose (date, description) already exist
    - Uses the first admin user as created_by
    - Does NOT run automatically in migrations
"""

import asyncio
import os
import sys
from datetime import date

# Allow running as `python -m scripts.seed_changelog_history` from backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.app_update import AppUpdate
from app.models.user import User

# Historical entries pulled from updates.json + recent git commits on main.
ENTRIES = [
    # From git log (recent commits)
    {"date": "2026-04-23", "description": "Propagate bill/debt postponement to all household members", "type": "fix"},
    {"date": "2026-04-22", "description": "Postpone bills to next paycheck or custom date", "type": "new_feature"},
    {"date": "2026-04-21", "description": "Hide zero-balance debts from active payment lists", "type": "fix"},
    {"date": "2026-04-20", "description": "Admin: root API reset-password, modal UX, deploy path docs", "type": "fix"},
    {"date": "2026-04-19", "description": "Admin: reset password in user details modal", "type": "new_feature"},
    {"date": "2026-04-15", "description": "Combine Bills & Debts into unified page + capitalization formatter", "type": "new_feature"},
    {"date": "2026-04-12", "description": "Replace /select-mode page with sidebar mode toggle", "type": "update"},
    {"date": "2026-04-10", "description": "Consolidate duplicate Users views into Command Center", "type": "fix"},
    # From updates.json (historical product entries)
    {"date": "2026-03-25", "description": "Fixed Contact Us form failing to submit support tickets", "type": "fix"},
    {"date": "2026-03-25", "description": "Fixed modal input fields (Add Goal, Add Bill, etc.) losing focus and resetting on every keystroke", "type": "fix"},
    {"date": "2026-03-25", "description": "Added Paid / Still Owed tracker to the paycheck plan and dashboard cards so you can see exactly how much you've paid and what's left.", "type": "new_feature"},
    {"date": "2026-03-23", "description": "Fixed PIN input on Secure Vault losing focus on mobile devices", "type": "fix"},
    {"date": "2026-03-23", "description": "Fixed dashboard and page layouts being clipped or cut off on mobile devices.", "type": "fix"},
    {"date": "2026-03-23", "description": "Mobile experience improvements: fixed sort/filter overflow on small screens, better touch targets, smoother modals, and overall layout stability across all devices.", "type": "update"},
    {"date": "2026-03-23", "description": "All fields on Add/Edit Bill and Debt forms are now optional — fill in only what you need", "type": "update"},
    {"date": "2026-03-23", "description": "Dashboard now shows your split share amounts instead of full amounts. Added optional paycheck checklist to track bill payments.", "type": "new_feature"},
    {"date": "2026-03-23", "description": "Major UI overhaul: redesigned card layout, pay period bill grouping, paycheck scheduling, expandable cards, quick mark as paid, debt splitting, category color badges, and friendly date formatting across the app.", "type": "update"},
    {"date": "2026-03-23", "description": "Fixed Command Center Settings: maintenance mode toggle and admin managers now work correctly.", "type": "fix"},
    {"date": "2026-03-23", "description": "Renamed Credit Score to Credit Cards, fixed recommendations display, Title Case across the app, and admin-managed updates.", "type": "update"},
    {"date": "2026-03-23", "description": "Updated Support PayDrift page to reference upcoming paid features instead of Pro.", "type": "update"},
    {"date": "2026-03-23", "description": "Admin Command Center with dashboard, user management, support, settings, and audit log tabs. Added sort options across all pages.", "type": "new_feature"},
    {"date": "2026-03-23", "description": "Added bill history log to track all bill changes and payments", "type": "new_feature"},
    {"date": "2026-03-23", "description": "All household members can now see every household bill", "type": "update"},
    {"date": "2026-03-23", "description": "Bills now show your share instead of the full amount for split bills", "type": "update"},
    {"date": "2026-03-23", "description": "Bill cards are now expandable to see per-person breakdown", "type": "new_feature"},
    {"date": "2026-03-22", "description": "Support tickets system added — submit and track requests", "type": "new_feature"},
    {"date": "2026-03-22", "description": "Backend stability fix — resolved API loading issues", "type": "fix"},
]


async def seed():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.")
        sys.exit(1)

    # Ensure async driver
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # Find first admin user to use as created_by
        result = await session.execute(
            select(User).where(User.is_admin == True).limit(1)  # noqa: E712
        )
        admin = result.scalar_one_or_none()
        if not admin:
            print("ERROR: No admin user found. Create an admin user first.")
            await engine.dispose()
            sys.exit(1)

        print(f"Using admin user: {admin.email} ({admin.id})")

        inserted = 0
        skipped = 0

        for entry in ENTRIES:
            entry_date = date.fromisoformat(entry["date"])
            # Check if this exact (date, description) already exists
            existing = await session.execute(
                select(AppUpdate.id).where(
                    and_(
                        AppUpdate.date == entry_date,
                        AppUpdate.description == entry["description"],
                    )
                )
            )
            if existing.scalar_one_or_none() is not None:
                skipped += 1
                continue

            update = AppUpdate(
                date=entry_date,
                description=entry["description"],
                type=entry["type"],
                created_by=admin.id,
            )
            session.add(update)
            inserted += 1

        await session.commit()
        print(f"Done. Inserted: {inserted}, Skipped (already exist): {skipped}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
