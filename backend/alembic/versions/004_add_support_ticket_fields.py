"""Add name, email columns to support_tickets and make user_id nullable

Revision ID: 004
Revises: 003
Create Date: 2026-03-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("name", sa.String(200), nullable=False, server_default=sa.text("''")))
    op.add_column("support_tickets", sa.Column("email", sa.String(320), nullable=False, server_default=sa.text("''")))
    op.alter_column("support_tickets", "subject", type_=sa.String(255), existing_type=sa.String(200))
    op.alter_column("support_tickets", "user_id", nullable=True, existing_nullable=False)


def downgrade() -> None:
    op.alter_column("support_tickets", "user_id", nullable=False, existing_nullable=True)
    op.alter_column("support_tickets", "subject", type_=sa.String(200), existing_type=sa.String(255))
    op.drop_column("support_tickets", "email")
    op.drop_column("support_tickets", "name")
