"""Add dashboard_widget_order to user_ui_preferences.

Revision ID: 053
Revises: 052
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "053"
down_revision = "052"
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
    if not _column_exists(bind, "user_ui_preferences", "dashboard_widget_order"):
        op.add_column(
            "user_ui_preferences",
            sa.Column(
                "dashboard_widget_order",
                sa.JSON(),
                server_default=sa.text("'[]'::json"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("user_ui_preferences"):
        return
    if _column_exists(bind, "user_ui_preferences", "dashboard_widget_order"):
        op.drop_column("user_ui_preferences", "dashboard_widget_order")
