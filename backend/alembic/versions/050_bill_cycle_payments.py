"""Add bill cycle payments.

Revision ID: 050
Revises: 049
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("bill_cycle_payments"):
        op.create_table(
            "bill_cycle_payments",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("bill_id", UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), nullable=False),
            sa.Column("household_id", UUID(as_uuid=True), nullable=True),
            sa.Column("budget_id", UUID(as_uuid=True), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("cycle_year", sa.Integer(), nullable=False),
            sa.Column("cycle_month", sa.Integer(), nullable=False),
            sa.Column("amount_due", sa.Numeric(12, 2), nullable=False),
            sa.Column(
                "amount_paid",
                sa.Numeric(12, 2),
                server_default=sa.text("0"),
                nullable=False,
            ),
            sa.Column(
                "is_paid",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
            sa.Column("paid_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("source", sa.String(50), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
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
            sa.ForeignKeyConstraint(["bill_id"], ["bills.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("bill_id", "due_date", name="uq_bill_cycle_payments_bill_due"),
        )
        op.create_index("ix_bill_cycle_payments_bill_id", "bill_cycle_payments", ["bill_id"])
        op.create_index("ix_bill_cycle_payments_due_date", "bill_cycle_payments", ["due_date"])
        op.create_index(
            "ix_bill_cycle_payments_household_id",
            "bill_cycle_payments",
            ["household_id"],
        )
        op.create_index("ix_bill_cycle_payments_budget_id", "bill_cycle_payments", ["budget_id"])

    # Backfill from existing payment rows.  Use the payment date as the
    # occurrence due date because legacy rows do not store the bill occurrence.
    op.execute(
        """
        INSERT INTO bill_cycle_payments (
            bill_id, user_id, household_id, budget_id, due_date, cycle_year, cycle_month,
            amount_due, amount_paid, is_paid, paid_date, source, notes, created_at, updated_at
        )
        SELECT
            p.bill_id,
            p.user_id,
            b.household_id,
            COALESCE(p.budget_id, b.budget_id),
            p.paid_date::date,
            EXTRACT(YEAR FROM p.paid_date::date)::int,
            EXTRACT(MONTH FROM p.paid_date::date)::int,
            COALESCE(b.amount, p.amount, 0),
            COALESCE(p.amount, b.amount, 0),
            true,
            p.paid_date::timestamp with time zone,
            COALESCE(p.source, 'legacy_payment'),
            'Backfilled from payments',
            COALESCE(p.created_at, now()),
            now()
        FROM payments p
        JOIN bills b ON b.id = p.bill_id
        WHERE p.bill_id IS NOT NULL
          AND p.paid_date IS NOT NULL
        ON CONFLICT (bill_id, due_date) DO UPDATE SET
            amount_paid = GREATEST(bill_cycle_payments.amount_paid, EXCLUDED.amount_paid),
            is_paid = bill_cycle_payments.is_paid OR EXCLUDED.is_paid,
            paid_date = COALESCE(bill_cycle_payments.paid_date, EXCLUDED.paid_date),
            source = COALESCE(bill_cycle_payments.source, EXCLUDED.source),
            updated_at = now()
        """
    )

    # Preserve bills that were marked paid before auto payment rows existed.
    op.execute(
        """
        INSERT INTO bill_cycle_payments (
            bill_id, user_id, household_id, budget_id, due_date, cycle_year, cycle_month,
            amount_due, amount_paid, is_paid, paid_date, source, notes, created_at, updated_at
        )
        SELECT
            b.id,
            b.user_id,
            b.household_id,
            b.budget_id,
            COALESCE(b.paid_date::date, CURRENT_DATE),
            EXTRACT(YEAR FROM COALESCE(b.paid_date::date, CURRENT_DATE))::int,
            EXTRACT(MONTH FROM COALESCE(b.paid_date::date, CURRENT_DATE))::int,
            COALESCE(b.amount, 0),
            COALESCE(b.paid_amount, b.amount, 0),
            true,
            b.paid_date,
            'legacy_bill_flag',
            'Backfilled from bills.is_paid',
            COALESCE(b.created_at, now()),
            now()
        FROM bills b
        WHERE b.is_paid IS TRUE
        ON CONFLICT (bill_id, due_date) DO NOTHING
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("bill_cycle_payments"):
        return
    op.drop_index("ix_bill_cycle_payments_budget_id", table_name="bill_cycle_payments")
    op.drop_index("ix_bill_cycle_payments_household_id", table_name="bill_cycle_payments")
    op.drop_index("ix_bill_cycle_payments_due_date", table_name="bill_cycle_payments")
    op.drop_index("ix_bill_cycle_payments_bill_id", table_name="bill_cycle_payments")
    op.drop_table("bill_cycle_payments")
