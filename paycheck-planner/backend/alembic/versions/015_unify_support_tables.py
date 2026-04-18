"""unify support_requests into support_tickets table

Revision ID: 015
Revises: 014
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to support_tickets
    op.add_column(
        "support_tickets",
        sa.Column("admin_notes", sa.Text, nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "cant_access_email",
            sa.Boolean,
            server_default="false",
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Migrate existing support_requests into support_tickets
    op.execute(
        """
        INSERT INTO support_tickets (email, subject, message, status, admin_notes, cant_access_email, created_at, resolved_at)
        SELECT email, 'Auth / Account Issue', message, status, admin_notes, cant_access_email, created_at, resolved_at
        FROM support_requests
        """
    )

    # Drop the now-unused support_requests table
    op.drop_table("support_requests")


def downgrade():
    # Recreate support_requests table
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

    op.drop_column("support_tickets", "resolved_at")
    op.drop_column("support_tickets", "cant_access_email")
    op.drop_column("support_tickets", "admin_notes")
