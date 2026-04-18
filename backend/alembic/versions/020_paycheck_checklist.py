"""paycheck checklist

Revision ID: 020
Revises: 019
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paycheck_checklist",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pay_period_start", sa.Date(), nullable=False),
        sa.Column("is_checked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_paycheck_checklist_user_period",
        "paycheck_checklist",
        ["user_id", "pay_period_start"],
    )


def downgrade() -> None:
    op.drop_index("ix_paycheck_checklist_user_period", table_name="paycheck_checklist")
    op.drop_table("paycheck_checklist")
