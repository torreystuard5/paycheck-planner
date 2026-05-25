"""Business trial, team members, tax categories, payment request scaffold

Revision ID: 048
Revises: 047
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return sa_inspect(bind).has_table(name)


def upgrade() -> None:
    # -- users: add business trial / access columns (idempotent) -----------
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "business_trial_started_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "business_trial_ends_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "business_trial_consumed BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "business_access_granted_until TIMESTAMP WITH TIME ZONE"
    )

    # -- business_team_members table ---------------------------------------
    bind = op.get_bind()

    if not _table_exists(bind, "business_team_members"):
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

    # indexes + unique constraint — guarded separately
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_business_team_owner "
        "ON business_team_members(owner_user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_business_team_member "
        "ON business_team_members(member_user_id)"
    )
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE business_team_members
                ADD CONSTRAINT uq_business_team_owner_member
                UNIQUE (owner_user_id, member_user_id);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # -- business_team_audit_logs table ------------------------------------
    if not _table_exists(bind, "business_team_audit_logs"):
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

    # -- business_deductions: add tax columns (idempotent) -----------------
    op.execute(
        "ALTER TABLE business_deductions ADD COLUMN IF NOT EXISTS "
        "tax_schedule_c_category VARCHAR(80)"
    )
    op.execute(
        "ALTER TABLE business_deductions ADD COLUMN IF NOT EXISTS "
        "is_1099_contractor BOOLEAN NOT NULL DEFAULT false"
    )

    # -- business_payment_requests table -----------------------------------
    if not _table_exists(bind, "business_payment_requests"):
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

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_business_payment_requests_user "
        "ON business_payment_requests(user_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_business_payment_requests_user")
    op.execute("DROP TABLE IF EXISTS business_payment_requests")
    op.execute(
        "ALTER TABLE business_deductions DROP COLUMN IF EXISTS is_1099_contractor"
    )
    op.execute(
        "ALTER TABLE business_deductions DROP COLUMN IF EXISTS tax_schedule_c_category"
    )
    op.execute("DROP TABLE IF EXISTS business_team_audit_logs")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE business_team_members
                DROP CONSTRAINT IF EXISTS uq_business_team_owner_member;
        EXCEPTION WHEN undefined_table THEN NULL;
        END $$;
    """)
    op.execute("DROP INDEX IF EXISTS ix_business_team_member")
    op.execute("DROP INDEX IF EXISTS ix_business_team_owner")
    op.execute("DROP TABLE IF EXISTS business_team_members")
    op.execute(
        "ALTER TABLE users DROP COLUMN IF EXISTS business_access_granted_until"
    )
    op.execute(
        "ALTER TABLE users DROP COLUMN IF EXISTS business_trial_consumed"
    )
    op.execute(
        "ALTER TABLE users DROP COLUMN IF EXISTS business_trial_ends_at"
    )
    op.execute(
        "ALTER TABLE users DROP COLUMN IF EXISTS business_trial_started_at"
    )
