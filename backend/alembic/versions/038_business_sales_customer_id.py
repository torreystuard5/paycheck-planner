"""business_sales.customer_id FK to business_customers

Revision ID: 038
Revises: 037
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "business_sales",
        sa.Column("customer_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_business_sales_customer_id",
        "business_sales",
        "business_customers",
        ["customer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_business_sales_customer_id", "business_sales", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_business_sales_customer_id", table_name="business_sales")
    op.drop_constraint("fk_business_sales_customer_id", "business_sales", type_="foreignkey")
    op.drop_column("business_sales", "customer_id")
