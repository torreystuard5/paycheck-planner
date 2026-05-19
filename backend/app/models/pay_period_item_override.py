import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.services.pay_period_constants import OVERRIDE_PULL_FORWARD


class PayPeriodItemOverride(Base):
    """Persisted effective pay-period assignment for one bill/debt occurrence.

    Natural assignment is computed from due dates + IncomeSource pay calendar.
    Active rows change which pay period counts an occurrence (v1: pull_forward only).
    """

    __tablename__ = "pay_period_item_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=True,
    )
    budget_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("budgets.id", ondelete="SET NULL"),
        nullable=True,
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    occurrence_due_date: Mapped[str] = mapped_column(Date, nullable=False)
    natural_period_start: Mapped[str] = mapped_column(Date, nullable=False)
    effective_period_start: Mapped[str] = mapped_column(Date, nullable=False)
    override_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'pull_forward'"),
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    revoked_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    household = relationship("Household")
    budget = relationship("Budget")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        CheckConstraint(
            "item_type IN ('bill', 'debt')",
            name="ck_pay_period_item_overrides_item_type",
        ),
        CheckConstraint(
            f"override_type IN ('{OVERRIDE_PULL_FORWARD}')",
            name="ck_pay_period_item_overrides_override_type_v1",
        ),
        CheckConstraint(
            "natural_period_start > effective_period_start",
            name="ck_pay_period_item_overrides_pull_forward_order",
        ),
        Index(
            "ix_pay_period_item_overrides_household_budget",
            "household_id",
            "budget_id",
        ),
        Index(
            "ix_pay_period_item_overrides_effective_period",
            "effective_period_start",
        ),
        Index(
            "ix_pay_period_item_overrides_natural_period",
            "natural_period_start",
        ),
        Index(
            "ix_pay_period_item_overrides_item",
            "item_type",
            "item_id",
        ),
        Index(
            "ux_pay_period_item_overrides_active_occurrence",
            "item_type",
            "item_id",
            "occurrence_due_date",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )
