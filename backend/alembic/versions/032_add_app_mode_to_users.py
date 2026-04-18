"""add app_mode to users

Revision ID: 032
Revises: 031
"""
from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("app_mode", sa.String(), nullable=True, server_default=sa.text("'personal'")),
    )


def downgrade() -> None:
    op.drop_column("users", "app_mode")
