"""Stripe subscription fields, pricing_config, user_discounts, paystub_uploads

Revision ID: 041
Revises: 040
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users: Stripe / subscription columns ──────────────────────────
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "subscription_status",
            sa.String(30),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("subscription_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("subscription_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("billing_period", sa.String(20), nullable=True))

    # ── pricing_config ────────────────────────────────────────────────
    op.create_table(
        "pricing_config",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tier", sa.String(20), nullable=False),
        sa.Column("billing_period", sa.String(20), nullable=False),
        sa.Column("base_price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "discount_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_pricing_config_tier_period", "pricing_config", ["tier", "billing_period"])

    # Seed 3 tiers × 3 periods (placeholder cents; admin sets stripe_price_id)
    seed = [
        ("pro", "monthly", 999, 0.0),
        ("pro", "six_month", 4999, 15.0),
        ("pro", "annual", 8999, 25.0),
        ("business", "monthly", 2999, 0.0),
        ("business", "six_month", 14999, 15.0),
        ("business", "annual", 26999, 25.0),
        ("bundle", "monthly", 3499, 0.0),
        ("bundle", "six_month", 17499, 15.0),
        ("bundle", "annual", 31499, 25.0),
    ]
    for tier, period, cents, disc in seed:
        op.execute(
            sa.text(
                "INSERT INTO pricing_config (tier, billing_period, base_price_cents, discount_pct, is_active) "
                f"VALUES ('{tier}', '{period}', {int(cents)}, {float(disc)}, true)"
            )
        )

    # ── user_discounts ───────────────────────────────────────────────
    op.create_table(
        "user_discounts",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "discount_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_discounts_user_id", "user_discounts", ["user_id"])

    # ── paystub_uploads ───────────────────────────────────────────────
    op.create_table(
        "paystub_uploads",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("file_type", sa.String(20), nullable=False),
        sa.Column(
            "ocr_status",
            sa.String(30),
            nullable=False,
            server_default="uploaded",
        ),
        sa.Column("ocr_result", JSONB, nullable=True),
        sa.Column(
            "income_id",
            UUID(as_uuid=True),
            sa.ForeignKey("income_sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_paystub_uploads_user_id", "paystub_uploads", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_paystub_uploads_user_id", table_name="paystub_uploads")
    op.drop_table("paystub_uploads")
    op.drop_index("ix_user_discounts_user_id", table_name="user_discounts")
    op.drop_table("user_discounts")
    op.drop_index("ix_pricing_config_tier_period", table_name="pricing_config")
    op.drop_table("pricing_config")
    op.drop_column("users", "billing_period")
    op.drop_column("users", "subscription_ends_at")
    op.drop_column("users", "subscription_started_at")
    op.drop_column("users", "trial_ends_at")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
