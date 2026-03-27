"""Add broadcasts table and email_unsubscribed fields to users

Revision ID: 024
Revises: 023
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add email unsubscribe fields to users
    op.add_column("users", sa.Column("email_unsubscribed", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True))

    # Create broadcasts table
    op.create_table(
        "broadcasts",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience_filter", sa.String(50), nullable=False),
        sa.Column("recipient_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sent_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("broadcasts")
    op.drop_column("users", "unsubscribed_at")
    op.drop_column("users", "email_unsubscribed")
