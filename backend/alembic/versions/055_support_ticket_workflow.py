"""Add priority, assignment, and internal notes to support tickets.

Revision ID: 055
Revises: 054
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects import postgresql

revision = "055"
down_revision = "054"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa_inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("support_tickets"):
        return

    if not _column_exists(bind, "support_tickets", "priority"):
        op.add_column(
            "support_tickets",
            sa.Column(
                "priority",
                sa.String(20),
                server_default=sa.text("'normal'"),
                nullable=False,
            ),
        )

    if not _column_exists(bind, "support_tickets", "assigned_to"):
        op.add_column(
            "support_tickets",
            sa.Column(
                "assigned_to",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_support_tickets_assigned_to",
            "support_tickets",
            ["assigned_to"],
        )

    if sa_inspect(bind).has_table("support_ticket_replies"):
        if not _column_exists(bind, "support_ticket_replies", "is_internal"):
            op.add_column(
                "support_ticket_replies",
                sa.Column(
                    "is_internal",
                    sa.Boolean,
                    server_default=sa.text("false"),
                    nullable=False,
                ),
            )


def downgrade() -> None:
    bind = op.get_bind()
    if sa_inspect(bind).has_table("support_ticket_replies"):
        if _column_exists(bind, "support_ticket_replies", "is_internal"):
            op.drop_column("support_ticket_replies", "is_internal")

    if sa_inspect(bind).has_table("support_tickets"):
        if _column_exists(bind, "support_tickets", "assigned_to"):
            op.drop_index("ix_support_tickets_assigned_to", table_name="support_tickets")
            op.drop_column("support_tickets", "assigned_to")
        if _column_exists(bind, "support_tickets", "priority"):
            op.drop_column("support_tickets", "priority")
