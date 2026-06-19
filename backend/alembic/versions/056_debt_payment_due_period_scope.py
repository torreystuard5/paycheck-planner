"""Add due/pay-period scope to debt payments.

Revision ID: 056
Revises: 055
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    if not inspector.has_table(table_name):
        return False
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    if not inspector.has_table(table_name):
        return False
    return any(idx["name"] == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("debt_payments"):
        return

    if not _has_column("debt_payments", "due_date"):
        op.add_column("debt_payments", sa.Column("due_date", sa.Date(), nullable=True))
    if not _has_column("debt_payments", "pay_period_start"):
        op.add_column("debt_payments", sa.Column("pay_period_start", sa.Date(), nullable=True))

    op.execute(
        """
        UPDATE debt_payments dp
        SET due_date = make_date(
                dp.period_year,
                dp.period_month,
                LEAST(
                    COALESCE(d.due_day, 1),
                    EXTRACT(
                        DAY FROM (
                            date_trunc('month', make_date(dp.period_year, dp.period_month, 1))
                            + interval '1 month - 1 day'
                        )
                    )::int
                )
            )
        FROM debts d
        WHERE dp.debt_id = d.id
          AND dp.due_date IS NULL
        """
    )
    op.execute(
        """
        UPDATE debt_payments
        SET pay_period_start = make_date(period_year, period_month, 1)
        WHERE pay_period_start IS NULL
        """
    )

    if not _has_index("debt_payments", "ix_debt_payments_due_date"):
        op.create_index("ix_debt_payments_due_date", "debt_payments", ["due_date"])
    if not _has_index("debt_payments", "ix_debt_payments_pay_period_start"):
        op.create_index(
            "ix_debt_payments_pay_period_start",
            "debt_payments",
            ["pay_period_start"],
        )
    if not _has_index("debt_payments", "ix_debt_payments_debt_due_user"):
        op.create_index(
            "ix_debt_payments_debt_due_user",
            "debt_payments",
            ["debt_id", "due_date", "user_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("debt_payments"):
        return

    if _has_index("debt_payments", "ix_debt_payments_debt_due_user"):
        op.drop_index("ix_debt_payments_debt_due_user", table_name="debt_payments")
    if _has_index("debt_payments", "ix_debt_payments_pay_period_start"):
        op.drop_index("ix_debt_payments_pay_period_start", table_name="debt_payments")
    if _has_index("debt_payments", "ix_debt_payments_due_date"):
        op.drop_index("ix_debt_payments_due_date", table_name="debt_payments")
    if _has_column("debt_payments", "pay_period_start"):
        op.drop_column("debt_payments", "pay_period_start")
    if _has_column("debt_payments", "due_date"):
        op.drop_column("debt_payments", "due_date")
