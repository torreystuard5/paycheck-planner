"""add support_requests table and user account management fields

Revision ID: 014
Revises: 013
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    # Create support_requests table
    op.create_table(
        "support_requests",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("cant_access_email", sa.Boolean, server_default="false"),
        sa.Column("status", sa.String(20), server_default="'open'"),
        sa.Column("admin_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Add account management fields to users
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("failed_login_count", sa.Integer, server_default="0"))
    op.add_column("users", sa.Column("account_status", sa.String(20), server_default="'active'"))
    op.add_column("users", sa.Column("account_status_reason", sa.Text, nullable=True))
    op.add_column("users", sa.Column("admin_notes", sa.Text, nullable=True))


def downgrade():
    op.drop_column("users", "admin_notes")
    op.drop_column("users", "account_status_reason")
    op.drop_column("users", "account_status")
    op.drop_column("users", "failed_login_count")
    op.drop_column("users", "last_login_at")
    op.drop_table("support_requests")
