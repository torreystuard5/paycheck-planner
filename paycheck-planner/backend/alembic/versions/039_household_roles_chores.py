"""household member roles, child permissions, household_chores

Revision ID: 039
Revises: 038
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "household_member_role",
            sa.String(20),
            nullable=False,
            server_default="adult",
        ),
    )
    op.add_column(
        "users",
        sa.Column("household_child_permissions", JSONB, nullable=True),
    )

    op.create_table(
        "household_chores",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "household_id",
            UUID(as_uuid=True),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "assigned_to",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("recurring", sa.String(20), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_household_chores_household_id",
        "household_chores",
        ["household_id"],
    )
    op.create_index(
        "ix_household_chores_assigned_to",
        "household_chores",
        ["assigned_to"],
    )


def downgrade() -> None:
    op.drop_index("ix_household_chores_assigned_to", table_name="household_chores")
    op.drop_index("ix_household_chores_household_id", table_name="household_chores")
    op.drop_table("household_chores")
    op.drop_column("users", "household_child_permissions")
    op.drop_column("users", "household_member_role")
