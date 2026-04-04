"""add notes table, passwords table, and pin_hash/notes_lock_timeout to users

Revision ID: 012
Revises: 011
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Notes table ---
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # --- Passwords table ---
    op.create_table(
        "passwords",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_name", sa.String(500), nullable=True),
        sa.Column("username", sa.Text(), nullable=True),
        sa.Column("password", sa.Text(), nullable=True),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # --- User model additions ---
    op.add_column(
        "users", sa.Column("pin_hash", sa.String(255), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "notes_lock_timeout",
            sa.Integer(),
            server_default=sa.text("5"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notes_lock_timeout")
    op.drop_column("users", "pin_hash")
    op.drop_table("passwords")
    op.drop_table("notes")
