import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class BillCyclePayment(Base):
    """Payment state for one bill occurrence/cycle.

    Bill remains the recurring definition; this row answers whether a specific
    due date was paid and how much was paid.
    """

    __tablename__ = "bill_cycle_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bills.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="SET NULL"),
        nullable=True,
    )
    budget_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("budgets.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    cycle_year: Mapped[int] = mapped_column(Integer, nullable=False)
    cycle_month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_due: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, server_default=text("0")
    )
    is_paid: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    paid_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    bill = relationship("Bill", back_populates="cycle_payments")
    user = relationship("User")
    household = relationship("Household")
    budget = relationship("Budget")

    __table_args__ = (
        UniqueConstraint("bill_id", "due_date", name="uq_bill_cycle_payments_bill_due"),
        Index("ix_bill_cycle_payments_bill_id", "bill_id"),
        Index("ix_bill_cycle_payments_due_date", "due_date"),
        Index("ix_bill_cycle_payments_household_id", "household_id"),
        Index("ix_bill_cycle_payments_budget_id", "budget_id"),
    )
