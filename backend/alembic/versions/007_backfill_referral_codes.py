"""backfill referral codes for existing users

Revision ID: 007
Revises: 006
Create Date: 2026-03-21
"""

import secrets

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def _generate_code() -> str:
    """Generate an 8-character uppercase alphanumeric code."""
    return secrets.token_urlsafe(6)[:8].upper()


def upgrade() -> None:
    conn = op.get_bind()

    # Find all users missing a referral code
    users = conn.execute(
        sa.text("SELECT id FROM users WHERE referral_code IS NULL")
    ).fetchall()

    # Collect existing codes to avoid duplicates
    existing = conn.execute(
        sa.text("SELECT referral_code FROM users WHERE referral_code IS NOT NULL")
    ).fetchall()
    used_codes = {row[0] for row in existing}

    for (user_id,) in users:
        code = _generate_code()
        attempts = 0
        while code in used_codes and attempts < 20:
            code = _generate_code()
            attempts += 1
        used_codes.add(code)
        conn.execute(
            sa.text("UPDATE users SET referral_code = :code WHERE id = :uid"),
            {"code": code, "uid": user_id},
        )


def downgrade() -> None:
    # No-op: we don't remove codes that were backfilled since that would
    # break referral links already shared by users.
    pass
