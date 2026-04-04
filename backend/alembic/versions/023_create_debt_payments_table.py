"""create debt_payments table

Revision ID: 023
Revises: 022
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "debt_payments",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("debt_id", UUID(as_uuid=True), sa.ForeignKey("debts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_debt_payments_debt_id", "debt_payments", ["debt_id"])
    op.create_index(
        "ix_debt_payments_unique_period",
        "debt_payments",
        ["debt_id", "user_id", "period_month", "period_year"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_debt_payments_unique_period", table_name="debt_payments")
    op.drop_index("ix_debt_payments_debt_id", table_name="debt_payments")
    op.drop_table("debt_payments")
