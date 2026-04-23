"""add postpone_until to bills and debts

Revision ID: 040
Revises: 039
"""
from alembic import op
import sqlalchemy as sa

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("postpone_until", sa.Date(), nullable=True))
    op.add_column("debts", sa.Column("postpone_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("debts", "postpone_until")
    op.drop_column("bills", "postpone_until")
