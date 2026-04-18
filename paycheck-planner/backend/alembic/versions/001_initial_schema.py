"""Initial schema — all tables

Revision ID: 001
Revises:
Create Date: 2026-03-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- households (created first so users can FK to it) --
    op.create_table(
        "households",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("split_method", sa.String(20), server_default=sa.text("'equal'")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invite_code", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invite_code"),
    )

    # -- users --
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("currency", sa.String(3), server_default=sa.text("'USD'")),
        sa.Column("pay_frequency", sa.String(20), nullable=False),
        sa.Column("next_pay_date", sa.Date, nullable=False),
        sa.Column("net_pay_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="SET NULL"),
    )

    # Add FK from households.created_by -> users.id (deferred because of circular dep)
    op.create_foreign_key("fk_households_created_by", "households", "users", ["created_by"], ["id"])

    # -- income_sources --
    op.create_table(
        "income_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("next_pay_date", sa.Date, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_income_sources_user_id", "income_sources", ["user_id"])

    # -- bills --
    op.create_table(
        "bills",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_day", sa.Integer, nullable=False),
        sa.Column("frequency", sa.String(20), server_default=sa.text("'monthly'")),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("auto_pay", sa.Boolean, server_default=sa.text("false")),
        sa.Column("reminder_days", sa.Integer, server_default=sa.text("3")),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="SET NULL"),
        sa.CheckConstraint("due_day >= 1 AND due_day <= 31", name="ck_bills_due_day"),
    )
    op.create_index("ix_bills_user_id", "bills", ["user_id"])
    op.create_index("ix_bills_due_day", "bills", ["due_day"])

    # -- debts --
    op.create_table(
        "debts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("credit_limit", sa.Numeric(12, 2), nullable=True),
        sa.Column("apr", sa.Numeric(5, 2), nullable=False),
        sa.Column("minimum_payment", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_day", sa.Integer, nullable=False),
        sa.Column("auto_pay", sa.Boolean, server_default=sa.text("false")),
        sa.Column("reminder_days", sa.Integer, server_default=sa.text("3")),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="SET NULL"),
        sa.CheckConstraint("due_day >= 1 AND due_day <= 31", name="ck_debts_due_day"),
    )
    op.create_index("ix_debts_user_id", "debts", ["user_id"])
    op.create_index("ix_debts_due_day", "debts", ["due_day"])

    # -- savings_goals --
    op.create_table(
        "savings_goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("target_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("current_amount", sa.Numeric(12, 2), server_default=sa.text("0")),
        sa.Column("target_date", sa.Date, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_savings_goals_user_id", "savings_goals", ["user_id"])

    # -- savings_contributions --
    op.create_table(
        "savings_contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("pay_period_date", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["goal_id"], ["savings_goals.id"], ondelete="CASCADE"),
    )

    # -- payments --
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("debt_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_date", sa.Date, nullable=False),
        sa.Column("pay_period_date", sa.Date, nullable=False),
        sa.Column("is_extra", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bill_id"], ["bills.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["debt_id"], ["debts.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "(bill_id IS NOT NULL AND debt_id IS NULL) OR (bill_id IS NULL AND debt_id IS NOT NULL)",
            name="ck_payments_bill_or_debt",
        ),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])
    op.create_index("ix_payments_pay_period_date", "payments", ["pay_period_date"])

    # -- support_tickets --
    op.create_table(
        "support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'open'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])


def downgrade() -> None:
    op.drop_table("support_tickets")
    op.drop_table("payments")
    op.drop_table("savings_contributions")
    op.drop_table("savings_goals")
    op.drop_table("debts")
    op.drop_table("bills")
    op.drop_table("income_sources")
    op.drop_constraint("fk_households_created_by", "households", type_="foreignkey")
    op.drop_table("users")
    op.drop_table("households")
