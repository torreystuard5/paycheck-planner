"""Create support_ticket_replies table

Revision ID: 005
Revises: 004
Create Date: 2026-03-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "support_ticket_replies",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reply_message", sa.Text(), nullable=False),
        sa.Column("replied_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_support_ticket_replies_ticket_id", "support_ticket_replies", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_support_ticket_replies_ticket_id", table_name="support_ticket_replies")
    op.drop_table("support_ticket_replies")
