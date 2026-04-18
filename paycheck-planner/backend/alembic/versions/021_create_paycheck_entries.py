"""create paycheck_entries table

Revision ID: 021
Revises: 020
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paycheck_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("income_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pay_date", sa.Date(), nullable=False),
        sa.Column("gross_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("net_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("memo", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["income_source_id"], ["income_sources.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_paycheck_entries_user_id", "paycheck_entries", ["user_id"])
    op.create_index("ix_paycheck_entries_pay_date", "paycheck_entries", ["user_id", "pay_date"])


def downgrade() -> None:
    op.drop_index("ix_paycheck_entries_pay_date", table_name="paycheck_entries")
    op.drop_index("ix_paycheck_entries_user_id", table_name="paycheck_entries")
    op.drop_table("paycheck_entries")
