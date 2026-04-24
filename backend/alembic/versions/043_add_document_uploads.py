"""add document_uploads table

Revision ID: 043
Revises: 042
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_uploads",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("budget_id", UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("household_id", UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="SET NULL"), nullable=True),
        sa.Column("storage_provider", sa.String(32), nullable=False, server_default=sa.text("'r2'")),
        sa.Column("bucket", sa.String(255), nullable=False),
        sa.Column("object_key", sa.String(512), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("content_type", sa.String(128), nullable=True),
        sa.Column("file_size", sa.BigInteger, nullable=True),
        sa.Column("document_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'pending_upload'")),
        sa.Column("ocr_text", sa.Text, nullable=True),
        sa.Column("parsed_json", JSONB, nullable=True),
        sa.Column("linked_entity_type", sa.String(32), nullable=True),
        sa.Column("linked_entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_document_uploads_user_id", "document_uploads", ["user_id"])
    op.create_index("ix_document_uploads_budget_id", "document_uploads", ["budget_id"])
    op.create_index("ix_document_uploads_status", "document_uploads", ["status"])
    op.create_index("ix_document_uploads_user_created", "document_uploads", ["user_id", sa.text("created_at DESC")])
    op.create_unique_constraint("uq_document_uploads_bucket_object_key", "document_uploads", ["bucket", "object_key"])


def downgrade() -> None:
    op.drop_table("document_uploads")
