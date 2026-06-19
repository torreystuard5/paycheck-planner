"""Repair recurring bill paid state stored on bill rows.

Revision ID: 058
Revises: 057
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    if not inspector.has_table("bills") or not inspector.has_table("bill_cycle_payments"):
        return

    # Old code wrote recurring occurrence paid state onto bills.is_paid /
    # bills.paid_date.  New code intentionally ignores those global fields for
    # recurring bills, so migrate the legacy signal into the closest existing
    # cycle row in the same paid month before clearing the global fields.
    op.execute(
        """
        WITH polluted AS (
            SELECT
                b.id AS bill_id,
                b.user_id,
                b.household_id,
                b.budget_id,
                COALESCE(b.amount, 0) AS amount_due,
                COALESCE(b.paid_amount, b.amount, 0) AS amount_paid,
                b.paid_date,
                b.paid_date::date AS paid_on
            FROM bills b
            WHERE b.is_paid IS TRUE
              AND b.paid_date IS NOT NULL
              AND COALESCE(b.frequency, 'monthly') <> 'one_time'
        ),
        ranked_cycles AS (
            SELECT
                p.*,
                bcp.id AS cycle_id,
                bcp.due_date,
                ROW_NUMBER() OVER (
                    PARTITION BY p.bill_id
                    ORDER BY
                        ABS(bcp.due_date - p.paid_on),
                        CASE WHEN bcp.due_date <= p.paid_on THEN 0 ELSE 1 END,
                        bcp.due_date
                ) AS rn
            FROM polluted p
            JOIN bill_cycle_payments bcp
              ON bcp.bill_id = p.bill_id
             AND EXTRACT(YEAR FROM bcp.due_date)::int = EXTRACT(YEAR FROM p.paid_on)::int
             AND EXTRACT(MONTH FROM bcp.due_date)::int = EXTRACT(MONTH FROM p.paid_on)::int
        ),
        updated AS (
            UPDATE bill_cycle_payments bcp
            SET
                is_paid = TRUE,
                paid_date = COALESCE(bcp.paid_date, rc.paid_date),
                amount_paid = GREATEST(COALESCE(bcp.amount_paid, 0), rc.amount_paid),
                amount_due = GREATEST(COALESCE(bcp.amount_due, 0), rc.amount_due),
                source = COALESCE(bcp.source, 'legacy_bill_flag_repair'),
                updated_at = now()
            FROM ranked_cycles rc
            WHERE rc.rn = 1
              AND bcp.id = rc.cycle_id
            RETURNING bcp.bill_id
        )
        INSERT INTO bill_cycle_payments (
            bill_id,
            user_id,
            household_id,
            budget_id,
            due_date,
            cycle_year,
            cycle_month,
            amount_due,
            amount_paid,
            is_paid,
            paid_date,
            source,
            notes,
            created_at,
            updated_at
        )
        SELECT
            p.bill_id,
            p.user_id,
            p.household_id,
            p.budget_id,
            p.paid_on,
            EXTRACT(YEAR FROM p.paid_on)::int,
            EXTRACT(MONTH FROM p.paid_on)::int,
            p.amount_due,
            p.amount_paid,
            TRUE,
            p.paid_date,
            'legacy_bill_flag_repair',
            'Backfilled from recurring bills.is_paid cleanup',
            now(),
            now()
        FROM polluted p
        WHERE NOT EXISTS (
            SELECT 1 FROM ranked_cycles rc
            WHERE rc.bill_id = p.bill_id
              AND rc.rn = 1
        )
        ON CONFLICT (bill_id, due_date) DO UPDATE SET
            is_paid = TRUE,
            paid_date = COALESCE(bill_cycle_payments.paid_date, EXCLUDED.paid_date),
            amount_paid = GREATEST(COALESCE(bill_cycle_payments.amount_paid, 0), EXCLUDED.amount_paid),
            source = COALESCE(bill_cycle_payments.source, EXCLUDED.source),
            updated_at = now()
        """
    )

    op.execute(
        """
        UPDATE bills
        SET
            is_paid = FALSE,
            paid_date = NULL,
            paid_amount = NULL
        WHERE COALESCE(frequency, 'monthly') <> 'one_time'
          AND (
              is_paid IS TRUE
              OR paid_date IS NOT NULL
              OR paid_amount IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    # Data repair is intentionally not reversible.
    pass
