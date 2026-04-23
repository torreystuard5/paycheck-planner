"""add current_budget_id to users table

Revision ID: 042
Revises: 041
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add current_budget_id column to users
    op.add_column(
        "users",
        sa.Column("current_budget_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_current_budget_id",
        "users",
        "budgets",
        ["current_budget_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_current_budget_id", "users", ["current_budget_id"])

    # 2. Backfill: set current_budget_id to user's default budget
    op.execute(
        """
        UPDATE users
        SET current_budget_id = (
            SELECT id FROM budgets
            WHERE budgets.user_id = users.id AND budgets.is_default = true
            LIMIT 1
        )
        WHERE current_budget_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_users_current_budget_id", table_name="users")
    op.drop_constraint("fk_users_current_budget_id", "users", type_="foreignkey")
    op.drop_column("users", "current_budget_id")
