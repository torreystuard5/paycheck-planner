"""Add occurrence date to paycheck checklist.

Revision ID: 057
Revises: 056
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "057"
down_revision = "056"
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
    if not sa_inspect(bind).has_table("paycheck_checklist"):
        return
    if not _has_column("paycheck_checklist", "occurrence_due_date"):
        op.add_column("paycheck_checklist", sa.Column("occurrence_due_date", sa.Date(), nullable=True))
    if not _has_index("paycheck_checklist", "ix_paycheck_checklist_item_occurrence"):
        op.create_index(
            "ix_paycheck_checklist_item_occurrence",
            "paycheck_checklist",
            ["item_type", "item_id", "occurrence_due_date"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa_inspect(bind).has_table("paycheck_checklist"):
        return
    if _has_index("paycheck_checklist", "ix_paycheck_checklist_item_occurrence"):
        op.drop_index("ix_paycheck_checklist_item_occurrence", table_name="paycheck_checklist")
    if _has_column("paycheck_checklist", "occurrence_due_date"):
        op.drop_column("paycheck_checklist", "occurrence_due_date")
