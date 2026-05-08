"""normalize user emails — lowercase + trim, add functional unique index

Revision ID: 044
Revises: 043
"""

from alembic import op
from sqlalchemy import text

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Collision check — abort if any case-duplicate emails exist
    dupes = conn.execute(
        text(
            "SELECT lower(trim(email)) AS norm, count(*) AS n, "
            "array_agg(id::text) AS ids, array_agg(email) AS originals "
            "FROM users "
            "GROUP BY lower(trim(email)) "
            "HAVING count(*) > 1"
        )
    ).fetchall()

    if dupes:
        lines = []
        for row in dupes:
            lines.append(
                f"  email={row.norm!r}  count={row.n}  ids={row.ids}  originals={row.originals}"
            )
        detail = "\n".join(lines)
        raise RuntimeError(
            f"Cannot normalize emails — {len(dupes)} duplicate group(s) found. "
            f"Resolve manually before re-running:\n{detail}"
        )

    # 2. Backfill — lowercase + trim all emails
    conn.execute(
        text(
            "UPDATE users SET email = lower(trim(email)) "
            "WHERE email <> lower(trim(email))"
        )
    )

    # 3. Add functional unique index for defense in depth
    op.create_index(
        "ix_users_email_lower",
        "users",
        [text("lower(email)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_users_email_lower", table_name="users")
