"""add source_name to paycheck_entries

Revision ID: 029
Revises: 028
"""

from alembic import op
import sqlalchemy as sa


revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "paycheck_entries",
        sa.Column("source_name", sa.String(150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("paycheck_entries", "source_name")
