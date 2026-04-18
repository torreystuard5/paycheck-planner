"""add hidden_overdue to bills

Revision ID: 026
Revises: 025
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bills",
        sa.Column("hidden_overdue", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("bills", "hidden_overdue")
