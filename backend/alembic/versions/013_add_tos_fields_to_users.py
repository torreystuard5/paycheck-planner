"""add tos_accepted_at and tos_version to users

Revision ID: 013
Revises: 012
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("tos_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("tos_version", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("users", "tos_version")
    op.drop_column("users", "tos_accepted_at")
