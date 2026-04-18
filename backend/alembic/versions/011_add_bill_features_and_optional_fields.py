"""add bill features (payment_mode, assigned_member_id, day_of_week, start_date) and make user-facing columns nullable

Revision ID: 011
Revises: 010
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Bills: new columns ---
    op.add_column("bills", sa.Column("payment_mode", sa.String(20), server_default="single", nullable=True))
    op.add_column("bills", sa.Column("assigned_member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("bills", sa.Column("day_of_week", sa.Integer(), nullable=True))
    op.add_column("bills", sa.Column("start_date", sa.Date(), nullable=True))

    # --- Bills: make user-facing columns nullable ---
    op.alter_column("bills", "name", existing_type=sa.String(150), nullable=True, server_default="Untitled Bill")
    op.alter_column("bills", "amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("bills", "due_day", existing_type=sa.Integer(), nullable=True, server_default=sa.text("1"))

    # --- Debts: make user-facing columns nullable ---
    op.alter_column("debts", "name", existing_type=sa.String(150), nullable=True, server_default="Untitled Debt")
    op.alter_column("debts", "type", existing_type=sa.String(30), nullable=True, server_default="other")
    op.alter_column("debts", "balance", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("debts", "apr", existing_type=sa.Numeric(5, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("debts", "minimum_payment", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("debts", "due_day", existing_type=sa.Integer(), nullable=True, server_default=sa.text("1"))

    # --- Savings Goals: make user-facing columns nullable ---
    op.alter_column("savings_goals", "name", existing_type=sa.String(150), nullable=True, server_default="Untitled Goal")
    op.alter_column("savings_goals", "target_amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))

    # --- Savings Contributions: make user-facing columns nullable ---
    op.alter_column("savings_contributions", "amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("savings_contributions", "pay_period_date", existing_type=sa.Date(), nullable=True)

    # --- Income Sources: make user-facing columns nullable ---
    op.alter_column("income_sources", "name", existing_type=sa.String(100), nullable=True, server_default="Untitled Income")
    op.alter_column("income_sources", "amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("income_sources", "frequency", existing_type=sa.String(20), nullable=True, server_default="monthly")
    op.alter_column("income_sources", "next_pay_date", existing_type=sa.Date(), nullable=True)

    # --- Payments: make user-facing columns nullable ---
    op.alter_column("payments", "amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))
    op.alter_column("payments", "paid_date", existing_type=sa.Date(), nullable=True)
    op.alter_column("payments", "pay_period_date", existing_type=sa.Date(), nullable=True)

    # --- Households: make name nullable ---
    op.alter_column("households", "name", existing_type=sa.String(100), nullable=True, server_default="My Household")

    # --- Support Tickets: make user-facing columns nullable ---
    op.alter_column("support_tickets", "name", existing_type=sa.String(200), nullable=True, server_default="Anonymous")
    op.alter_column("support_tickets", "email", existing_type=sa.String(320), nullable=True, server_default="")
    op.alter_column("support_tickets", "subject", existing_type=sa.String(255), nullable=True, server_default="No Subject")
    op.alter_column("support_tickets", "message", existing_type=sa.Text(), nullable=True, server_default="")

    # --- Users: make user-facing columns nullable ---
    op.alter_column("users", "pay_frequency", existing_type=sa.String(20), nullable=True, server_default="biweekly")
    op.alter_column("users", "next_pay_date", existing_type=sa.Date(), nullable=True)
    op.alter_column("users", "net_pay_amount", existing_type=sa.Numeric(12, 2), nullable=True, server_default=sa.text("0"))

    # Drop the check constraint that requires exactly one of bill_id or debt_id
    op.drop_constraint("ck_payments_bill_or_debt", "payments")


def downgrade() -> None:
    # Re-add payment constraint
    op.create_check_constraint(
        "ck_payments_bill_or_debt",
        "payments",
        "(bill_id IS NOT NULL AND debt_id IS NULL) OR (bill_id IS NULL AND debt_id IS NOT NULL)",
    )

    # Users
    op.alter_column("users", "net_pay_amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("users", "next_pay_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("users", "pay_frequency", existing_type=sa.String(20), nullable=False, server_default=None)

    # Support Tickets
    op.alter_column("support_tickets", "message", existing_type=sa.Text(), nullable=False, server_default=None)
    op.alter_column("support_tickets", "subject", existing_type=sa.String(255), nullable=False, server_default=None)
    op.alter_column("support_tickets", "email", existing_type=sa.String(320), nullable=False, server_default=None)
    op.alter_column("support_tickets", "name", existing_type=sa.String(200), nullable=False, server_default=None)

    # Households
    op.alter_column("households", "name", existing_type=sa.String(100), nullable=False, server_default=None)

    # Payments
    op.alter_column("payments", "pay_period_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("payments", "paid_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("payments", "amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)

    # Income Sources
    op.alter_column("income_sources", "next_pay_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("income_sources", "frequency", existing_type=sa.String(20), nullable=False, server_default=None)
    op.alter_column("income_sources", "amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("income_sources", "name", existing_type=sa.String(100), nullable=False, server_default=None)

    # Savings Contributions
    op.alter_column("savings_contributions", "pay_period_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("savings_contributions", "amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)

    # Savings Goals
    op.alter_column("savings_goals", "target_amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("savings_goals", "name", existing_type=sa.String(150), nullable=False, server_default=None)

    # Debts
    op.alter_column("debts", "due_day", existing_type=sa.Integer(), nullable=False, server_default=None)
    op.alter_column("debts", "minimum_payment", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("debts", "apr", existing_type=sa.Numeric(5, 2), nullable=False, server_default=None)
    op.alter_column("debts", "balance", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("debts", "type", existing_type=sa.String(30), nullable=False, server_default=None)
    op.alter_column("debts", "name", existing_type=sa.String(150), nullable=False, server_default=None)

    # Bills
    op.alter_column("bills", "due_day", existing_type=sa.Integer(), nullable=False, server_default=None)
    op.alter_column("bills", "amount", existing_type=sa.Numeric(12, 2), nullable=False, server_default=None)
    op.alter_column("bills", "name", existing_type=sa.String(150), nullable=False, server_default=None)

    op.drop_column("bills", "start_date")
    op.drop_column("bills", "day_of_week")
    op.drop_column("bills", "assigned_member_id")
    op.drop_column("bills", "payment_mode")
