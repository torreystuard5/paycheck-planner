import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class PaycheckEntry(Base):
    __tablename__ = "paycheck_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    income_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("income_sources.id", ondelete="SET NULL"),
        nullable=True,
    )
    pay_date: Mapped[str] = mapped_column(Date, nullable=False)
    gross_amount: Mapped[float | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    net_amount: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    source_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    memo: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Budget scoping (Phase 4A)
    budget_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("budgets.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user = relationship("User", backref="paycheck_entries")
    income_source = relationship("IncomeSource", backref="paycheck_entries")
    budget = relationship("Budget")

    __table_args__ = (
        Index("ix_paycheck_entries_user_id", "user_id"),
        Index("ix_paycheck_entries_pay_date", "user_id", "pay_date"),
        Index("ix_paycheck_entries_budget_id", "budget_id"),
    )
