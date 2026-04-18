"""fix global_feature_overrides.updated_by from Integer to UUID

Revision ID: 034
Revises: 033
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The column was created as Integer but needs to be UUID to match users.id.
    # Since no admin has toggled features yet, the column is all NULLs.
    # Drop and re-add with the correct type to avoid cast issues.
    op.drop_column("global_feature_overrides", "updated_by")
    op.add_column(
        "global_feature_overrides",
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("global_feature_overrides", "updated_by")
    op.add_column(
        "global_feature_overrides",
        sa.Column("updated_by", sa.Integer(), nullable=True),
    )
