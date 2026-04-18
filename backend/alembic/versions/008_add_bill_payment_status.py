"""add bill payment status columns

Revision ID: 008
Revises: 007
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("bills", sa.Column("paid_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bills", sa.Column("paid_amount", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("bills", "paid_amount")
    op.drop_column("bills", "paid_date")
    op.drop_column("bills", "is_paid")
