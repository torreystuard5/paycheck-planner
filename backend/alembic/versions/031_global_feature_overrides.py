"""global_feature_overrides table with seed data

Revision ID: 031
Revises: 030
"""
from alembic import op
import sqlalchemy as sa

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None

SEED_DATA = [
    ("savings_challenges", "Savings Challenges & Gamification", "pro"),
    ("household_overview", "Household Financial Overview", "pro"),
    ("tax_prep", "Tax Prep & Deduction Tracking", "pro"),
    ("receipt_ocr", "Receipt/Bill Photo Upload & OCR", "pro"),
    ("bill_reminders", "Bill Reminders & Push Notifications", "pro"),
    ("spending_insights", "Spending Insights & Reports", "pro"),
    ("sales_tracking", "Sales Tracking", "business"),
    ("business_deductions", "Business Deductions", "business"),
    ("contingency_fund", "Contingency Fund", "business"),
    ("upgrade_fund", "Upgrade Fund", "business"),
    ("net_profit", "Net Profit Balance", "business"),
]


def upgrade() -> None:
    table = op.create_table(
        "global_feature_overrides",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("feature_key", sa.String(), nullable=False, unique=True),
        sa.Column("feature_label", sa.String(), nullable=False),
        sa.Column("tier", sa.String(), nullable=False),
        sa.Column("is_free_for_all", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.bulk_insert(
        table,
        [
            {"feature_key": key, "feature_label": label, "tier": tier, "is_free_for_all": False}
            for key, label, tier in SEED_DATA
        ],
    )


def downgrade() -> None:
    op.drop_table("global_feature_overrides")
