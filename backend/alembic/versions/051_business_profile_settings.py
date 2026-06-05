"""Business profile fields on user_ui_preferences.

Revision ID: 051
Revises: 050
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "051"
down_revision = "050"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa_inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("user_ui_preferences"):
        return
    if not _column_exists(bind, "user_ui_preferences", "business_name"):
        op.add_column("user_ui_preferences", sa.Column("business_name", sa.String(255), nullable=True))
    if not _column_exists(bind, "user_ui_preferences", "business_tagline"):
        op.add_column("user_ui_preferences", sa.Column("business_tagline", sa.String(500), nullable=True))
    if not _column_exists(bind, "user_ui_preferences", "fiscal_year_start_month"):
        op.add_column(
            "user_ui_preferences",
            sa.Column("fiscal_year_start_month", sa.Integer(), server_default="1", nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("user_ui_preferences"):
        return
    if _column_exists(bind, "user_ui_preferences", "fiscal_year_start_month"):
        op.drop_column("user_ui_preferences", "fiscal_year_start_month")
    if _column_exists(bind, "user_ui_preferences", "business_tagline"):
        op.drop_column("user_ui_preferences", "business_tagline")
    if _column_exists(bind, "user_ui_preferences", "business_name"):
        op.drop_column("user_ui_preferences", "business_name")
