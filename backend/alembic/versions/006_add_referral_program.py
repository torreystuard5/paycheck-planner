"""add referral program

Revision ID: 006
Revises: 005
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add referral columns to users table
    op.add_column("users", sa.Column("referral_code", sa.String(10), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "referred_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "free_month_credits",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "next_billing_date",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_unique_constraint("uq_users_referral_code", "users", ["referral_code"])

    # Create referral_rewards table
    op.create_table(
        "referral_rewards",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "referrer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "referred_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reward_type",
            sa.String(50),
            server_default=sa.text("'free_month'"),
            nullable=False,
        ),
        sa.Column(
            "reward_status",
            sa.String(20),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("referral_rewards")
    op.drop_constraint("uq_users_referral_code", "users", type_="unique")
    op.drop_column("users", "next_billing_date")
    op.drop_column("users", "free_month_credits")
    op.drop_column("users", "referred_by_user_id")
    op.drop_column("users", "referral_code")
