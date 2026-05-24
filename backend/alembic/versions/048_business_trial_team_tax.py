"""Business trial, team members, tax categories, payment request scaffold

Revision ID: 048
Revises: 047
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("business_trial_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("business_trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "business_trial_consumed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("business_access_granted_until", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "business_team_members",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="employee"),
        sa.Column("permissions", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("invited_email", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_business_team_owner", "business_team_members", ["owner_user_id"])
    op.create_index("ix_business_team_member", "business_team_members", ["member_user_id"])
    op.create_unique_constraint(
        "uq_business_team_owner_member",
        "business_team_members",
        ["owner_user_id", "member_user_id"],
    )

    op.create_table(
        "business_team_audit_logs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.add_column(
        "business_deductions",
        sa.Column("tax_schedule_c_category", sa.String(80), nullable=True),
    )
    op.add_column(
        "business_deductions",
        sa.Column("is_1099_contractor", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "business_payment_requests",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("business_customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("stripe_payment_link_id", sa.String(255), nullable=True),
        sa.Column("stripe_payment_link_url", sa.String(1024), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_business_payment_requests_user", "business_payment_requests", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_business_payment_requests_user", table_name="business_payment_requests")
    op.drop_table("business_payment_requests")
    op.drop_column("business_deductions", "is_1099_contractor")
    op.drop_column("business_deductions", "tax_schedule_c_category")
    op.drop_table("business_team_audit_logs")
    op.drop_constraint("uq_business_team_owner_member", "business_team_members", type_="unique")
    op.drop_index("ix_business_team_member", table_name="business_team_members")
    op.drop_index("ix_business_team_owner", table_name="business_team_members")
    op.drop_table("business_team_members")
    op.drop_column("users", "business_access_granted_until")
    op.drop_column("users", "business_trial_consumed")
    op.drop_column("users", "business_trial_ends_at")
    op.drop_column("users", "business_trial_started_at")
