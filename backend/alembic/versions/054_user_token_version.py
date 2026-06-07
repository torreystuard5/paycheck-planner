"""Add token_version to users for session invalidation.

Revision ID: 054
Revises: 053
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa_inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("users"):
        return
    if not _column_exists(bind, "users", "token_version"):
        op.add_column(
            "users",
            sa.Column(
                "token_version",
                sa.Integer(),
                server_default=sa.text("0"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _column_exists(bind, "users", "token_version"):
        op.drop_column("users", "token_version")
