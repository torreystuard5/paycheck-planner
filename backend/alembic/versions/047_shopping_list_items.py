"""add shopping_list_items table for household shopping lists

Revision ID: 047
Revises: 046
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shopping_list_items",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "household_id",
            UUID(as_uuid=True),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_name", sa.String(200), nullable=False),
        sa.Column("quantity", sa.String(50), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "is_completed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_shopping_list_items_household_id",
        "shopping_list_items",
        ["household_id"],
    )
    op.create_index(
        "ix_shopping_list_items_is_completed",
        "shopping_list_items",
        ["is_completed"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shopping_list_items_is_completed",
        table_name="shopping_list_items",
    )
    op.drop_index(
        "ix_shopping_list_items_household_id",
        table_name="shopping_list_items",
    )
    op.drop_table("shopping_list_items")
