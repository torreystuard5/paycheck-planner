"""Add source and auto_logged fields to payments table."""

from alembic import op
import sqlalchemy as sa


revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("source", sa.String(50), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column(
            "auto_logged",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("payments", "auto_logged")
    op.drop_column("payments", "source")
