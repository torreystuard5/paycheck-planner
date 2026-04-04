"""paycheck schedules and debt split support

Revision ID: 019
Revises: 018
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create paycheck_schedules table
    op.create_table(
        "paycheck_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("anchor_date", sa.Date(), nullable=True),
        sa.Column("day1", sa.Integer(), nullable=True),
        sa.Column("day2", sa.Integer(), nullable=True),
        sa.Column("income_source_name", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_paycheck_schedules_id", "paycheck_schedules", ["id"])
    op.create_index("ix_paycheck_schedules_user_id", "paycheck_schedules", ["user_id"])

    # Add is_split column to debts table (check if exists first)
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'debts' AND column_name = 'is_split'"
        )
    )
    if result.fetchone() is None:
        op.add_column(
            "debts",
            sa.Column("is_split", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    # Add split_members column to debts table (check if exists first)
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'debts' AND column_name = 'split_members'"
        )
    )
    if result.fetchone() is None:
        op.add_column(
            "debts",
            sa.Column("split_members", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    # Remove split columns from debts
    op.drop_column("debts", "split_members")
    op.drop_column("debts", "is_split")

    # Drop paycheck_schedules table
    op.drop_index("ix_paycheck_schedules_user_id", table_name="paycheck_schedules")
    op.drop_index("ix_paycheck_schedules_id", table_name="paycheck_schedules")
    op.drop_table("paycheck_schedules")
