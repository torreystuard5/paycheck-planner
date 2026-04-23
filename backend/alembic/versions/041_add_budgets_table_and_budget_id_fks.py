"""add budgets table and budget_id FK columns to entity tables

Revision ID: 041
Revises: 040
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None

# The 8 entity tables that get a budget_id FK column
ENTITY_TABLES = [
    "bills",
    "debts",
    "income_sources",
    "payments",
    "paycheck_schedules",
    "paycheck_entries",
    "savings_goals",
    "tax_deductions",
]


def upgrade() -> None:
    # 1. Create budgets table
    op.create_table(
        "budgets",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("household_id", UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"])
    # Unique partial index: only one default budget per user
    op.execute(
        "CREATE UNIQUE INDEX ix_budgets_user_default ON budgets (user_id) WHERE is_default = true"
    )

    # 2. Add budget_id column + FK + index to each entity table
    for table in ENTITY_TABLES:
        op.add_column(
            table,
            sa.Column("budget_id", UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table}_budget_id",
            table,
            "budgets",
            ["budget_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_budget_id", table, ["budget_id"])

    # 3. Backfill: create one "Default" budget per existing user
    # Uses INSERT ... SELECT to create exactly one default budget per user
    # who does not already have one (idempotent).
    op.execute(
        """
        INSERT INTO budgets (id, user_id, household_id, name, is_default, created_at, updated_at)
        SELECT gen_random_uuid(), u.id, u.household_id, 'Default', true, now(), now()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM budgets b WHERE b.user_id = u.id AND b.is_default = true
        )
        """
    )

    # 4. Backfill: set budget_id on all existing entity rows that don't have one
    for table in ENTITY_TABLES:
        op.execute(
            f"""
            UPDATE {table} t
            SET budget_id = (
                SELECT b.id FROM budgets b
                WHERE b.user_id = t.user_id AND b.is_default = true
                LIMIT 1
            )
            WHERE t.budget_id IS NULL
            """
        )


def downgrade() -> None:
    # Drop budget_id columns + FKs + indexes from entity tables (reverse order)
    for table in reversed(ENTITY_TABLES):
        op.drop_index(f"ix_{table}_budget_id", table_name=table)
        op.drop_constraint(f"fk_{table}_budget_id", table, type_="foreignkey")
        op.drop_column(table, "budget_id")

    # Drop budgets table and its indexes
    op.drop_index("ix_budgets_user_default", table_name="budgets")
    op.drop_index("ix_budgets_user_id", table_name="budgets")
    op.drop_table("budgets")
