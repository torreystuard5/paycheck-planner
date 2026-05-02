"""
One-shot: set maintenance_mode to false in system_settings.

Run on Render (Shell) or locally with DATABASE_URL set:

    cd backend
    python scripts/disable_maintenance.py
"""
import asyncio

from sqlalchemy import text

from app.database import async_session


async def main() -> None:
    async with async_session() as session:
        await session.execute(
            text(
                "UPDATE system_settings SET value = 'false' "
                "WHERE key = 'maintenance_mode'"
            )
        )
        await session.commit()
    print("maintenance_mode set to false (rows updated if key existed).")


if __name__ == "__main__":
    asyncio.run(main())
