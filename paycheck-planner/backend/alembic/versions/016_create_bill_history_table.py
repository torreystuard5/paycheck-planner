"""create bill_history table

Revision ID: 016
Revises: 015
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bill_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("bill_name", sa.String(150), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["bill_id"], ["bills.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bill_history_bill_id", "bill_history", ["bill_id"])
    op.create_index("ix_bill_history_user_id", "bill_history", ["user_id"])
    op.create_index("ix_bill_history_created_at", "bill_history", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_bill_history_created_at", table_name="bill_history")
    op.drop_index("ix_bill_history_user_id", table_name="bill_history")
    op.drop_index("ix_bill_history_bill_id", table_name="bill_history")
    op.drop_table("bill_history")
