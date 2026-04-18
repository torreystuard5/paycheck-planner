"""recurring subscriptions and household shopping list

Revision ID: 040
Revises: 039
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_subscriptions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "household_id",
            UUID(as_uuid=True),
            sa.ForeignKey("households.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False, server_default=sa.text("''")),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True, server_default=sa.text("0")),
        sa.Column("frequency", sa.String(30), nullable=False, server_default="monthly"),
        sa.Column("next_billing_date", sa.Date(), nullable=True),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_recurring_subscriptions_user_id", "recurring_subscriptions", ["user_id"])
    op.create_index("ix_recurring_subscriptions_household_id", "recurring_subscriptions", ["household_id"])

    op.create_table(
        "household_shopping_items",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "household_id",
            UUID(as_uuid=True),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("label", sa.String(500), nullable=False, server_default=sa.text("''")),
        sa.Column("is_purchased", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "purchased_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_household_shopping_household_id", "household_shopping_items", ["household_id"])


def downgrade() -> None:
    op.drop_index("ix_household_shopping_household_id", table_name="household_shopping_items")
    op.drop_table("household_shopping_items")
    op.drop_index("ix_recurring_subscriptions_household_id", table_name="recurring_subscriptions")
    op.drop_index("ix_recurring_subscriptions_user_id", table_name="recurring_subscriptions")
    op.drop_table("recurring_subscriptions")
