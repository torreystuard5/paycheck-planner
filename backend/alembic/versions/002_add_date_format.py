"""Add date_format column to users

Revision ID: 002
Revises: 001
Create Date: 2026-03-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("date_format", sa.String(20), server_default=sa.text("'MM/DD/YYYY'")),
    )


def downgrade() -> None:
    op.drop_column("users", "date_format")
