"""Add tax_deductions table and is_tax_deductible to bills

Revision ID: 025
Revises: 024
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_tax_deductible and tax_category to bills table
    op.add_column("bills", sa.Column("is_tax_deductible", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("bills", sa.Column("tax_category", sa.String(50), nullable=True))

    # Create tax_deductions table
    op.create_table(
        "tax_deductions",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("household_id", UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("receipt_note", sa.Text(), nullable=True),
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tax_deductions_user_id", "tax_deductions", ["user_id"])
    op.create_index("ix_tax_deductions_tax_year", "tax_deductions", ["tax_year"])
    op.create_index("ix_tax_deductions_user_year", "tax_deductions", ["user_id", "tax_year"])


def downgrade() -> None:
    op.drop_index("ix_tax_deductions_user_year", table_name="tax_deductions")
    op.drop_index("ix_tax_deductions_tax_year", table_name="tax_deductions")
    op.drop_index("ix_tax_deductions_user_id", table_name="tax_deductions")
    op.drop_table("tax_deductions")
    op.drop_column("bills", "tax_category")
    op.drop_column("bills", "is_tax_deductible")
