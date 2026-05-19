"""add pay_period_item_overrides for pull-forward (next -> current)

Revision ID: 045
Revises: 044
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pay_period_item_overrides",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "household_id",
            UUID(as_uuid=True),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "budget_id",
            UUID(as_uuid=True),
            sa.ForeignKey("budgets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("item_id", UUID(as_uuid=True), nullable=False),
        sa.Column("occurrence_due_date", sa.Date(), nullable=False),
        sa.Column("natural_period_start", sa.Date(), nullable=False),
        sa.Column("effective_period_start", sa.Date(), nullable=False),
        sa.Column(
            "override_type",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'pull_forward'"),
        ),
        sa.Column(
            "created_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "item_type IN ('bill', 'debt')",
            name="ck_pay_period_item_overrides_item_type",
        ),
        sa.CheckConstraint(
            "override_type IN ('pull_forward')",
            name="ck_pay_period_item_overrides_override_type_v1",
        ),
        sa.CheckConstraint(
            "natural_period_start > effective_period_start",
            name="ck_pay_period_item_overrides_pull_forward_order",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pay_period_item_overrides_household_budget",
        "pay_period_item_overrides",
        ["household_id", "budget_id"],
    )
    op.create_index(
        "ix_pay_period_item_overrides_effective_period",
        "pay_period_item_overrides",
        ["effective_period_start"],
    )
    op.create_index(
        "ix_pay_period_item_overrides_natural_period",
        "pay_period_item_overrides",
        ["natural_period_start"],
    )
    op.create_index(
        "ix_pay_period_item_overrides_item",
        "pay_period_item_overrides",
        ["item_type", "item_id"],
    )
    op.create_index(
        "ux_pay_period_item_overrides_active_occurrence",
        "pay_period_item_overrides",
        ["item_type", "item_id", "occurrence_due_date"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ux_pay_period_item_overrides_active_occurrence",
        table_name="pay_period_item_overrides",
    )
    op.drop_index(
        "ix_pay_period_item_overrides_item",
        table_name="pay_period_item_overrides",
    )
    op.drop_index(
        "ix_pay_period_item_overrides_natural_period",
        table_name="pay_period_item_overrides",
    )
    op.drop_index(
        "ix_pay_period_item_overrides_effective_period",
        table_name="pay_period_item_overrides",
    )
    op.drop_index(
        "ix_pay_period_item_overrides_household_budget",
        table_name="pay_period_item_overrides",
    )
    op.drop_table("pay_period_item_overrides")
