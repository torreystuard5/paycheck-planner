"""Add hidden_dashboard_widgets to user_ui_preferences.

Revision ID: 052
Revises: 051
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "052"
down_revision = "051"
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
    if not _column_exists(bind, "user_ui_preferences", "hidden_dashboard_widgets"):
        op.add_column(
            "user_ui_preferences",
            sa.Column(
                "hidden_dashboard_widgets",
                sa.JSON(),
                server_default=sa.text("'[]'::json"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("user_ui_preferences"):
        return
    if _column_exists(bind, "user_ui_preferences", "hidden_dashboard_widgets"):
        op.drop_column("user_ui_preferences", "hidden_dashboard_widgets")
