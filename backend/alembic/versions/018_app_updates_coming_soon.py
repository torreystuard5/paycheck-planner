"""app updates and coming soon tables

Revision ID: 018
Revises: 017
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create app_updates table
    op.create_table(
        "app_updates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type", sa.String(50), server_default=sa.text("'update'"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_app_updates_id", "app_updates", ["id"])
    op.create_index("ix_app_updates_date", "app_updates", ["date"])

    # Create coming_soon table
    op.create_table(
        "coming_soon",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("feature_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("eta", sa.String(100), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coming_soon_id", "coming_soon", ["id"])


def downgrade() -> None:
    op.drop_index("ix_coming_soon_id", table_name="coming_soon")
    op.drop_table("coming_soon")

    op.drop_index("ix_app_updates_date", table_name="app_updates")
    op.drop_index("ix_app_updates_id", table_name="app_updates")
    op.drop_table("app_updates")
