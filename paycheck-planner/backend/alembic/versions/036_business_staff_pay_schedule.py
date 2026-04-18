"""business_staff pay_frequency, anchor_date, tax_rate

Revision ID: 036
Revises: 035
"""
from alembic import op
import sqlalchemy as sa


revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "business_staff",
        sa.Column("pay_frequency", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "business_staff",
        sa.Column("anchor_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "business_staff",
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("business_staff", "tax_rate")
    op.drop_column("business_staff", "anchor_date")
    op.drop_column("business_staff", "pay_frequency")
