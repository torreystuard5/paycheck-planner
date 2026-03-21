"""Add supporter system: promo_codes, supporters tables, user supporter columns

Revision ID: 003
Revises: 002
Create Date: 2026-03-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create promo_codes table first (users FK references it)
    op.create_table(
        "promo_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("tier", sa.String(20), server_default="pro", nullable=True),
        sa.Column("max_uses", sa.Integer, nullable=True),
        sa.Column("current_uses", sa.Integer, server_default="0", nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # Create supporters table
    op.create_table(
        "supporters",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ko_fi_transaction_id", sa.String(100), nullable=True),
        sa.Column("donation_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("months_credited", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # Add supporter columns to users table
    op.add_column("users", sa.Column("subscription_tier", sa.String(20), server_default=sa.text("'early_access'"), nullable=True))
    op.add_column("users", sa.Column("supporter_months_banked", sa.Integer, server_default=sa.text("0"), nullable=True))
    op.add_column("users", sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("is_supporter", sa.Boolean, server_default=sa.text("false"), nullable=True))
    op.create_foreign_key("fk_users_promo_code_id", "users", "promo_codes", ["promo_code_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_users_promo_code_id", "users", type_="foreignkey")
    op.drop_column("users", "is_supporter")
    op.drop_column("users", "promo_code_id")
    op.drop_column("users", "supporter_months_banked")
    op.drop_column("users", "subscription_tier")
    op.drop_table("supporters")
    op.drop_table("promo_codes")
