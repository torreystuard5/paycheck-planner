"""create bill_member_payments table

Revision ID: 010
Revises: 009
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bill_member_payments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "bill_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bills.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "amount_paid",
            sa.Numeric(10, 2),
            nullable=False,
        ),
        sa.Column(
            "paid_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bill_member_payments_bill_id", "bill_member_payments", ["bill_id"])
    op.create_index("ix_bill_member_payments_member_id", "bill_member_payments", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_bill_member_payments_member_id", table_name="bill_member_payments")
    op.drop_index("ix_bill_member_payments_bill_id", table_name="bill_member_payments")
    op.drop_table("bill_member_payments")
