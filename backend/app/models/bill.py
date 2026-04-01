import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Bill(Base):
    __tablename__ = "bills"

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
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(150), nullable=True, server_default=text("'Untitled Bill'"))
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, server_default=text("0"))
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default=text("1"))
    frequency: Mapped[str | None] = mapped_column(String(20), server_default=text("'monthly'"), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    auto_pay: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    reminder_days: Mapped[int] = mapped_column(Integer, server_default=text("3"))
    is_paid: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    paid_date: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    # New fields: payment mode
    payment_mode: Mapped[str | None] = mapped_column(String(20), server_default=text("'single'"), nullable=True)
    assigned_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Tax deduction tracking
    is_tax_deductible: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    tax_category: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # New fields: biweekly support
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[str | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="bills", foreign_keys=[user_id])
    assigned_member = relationship("User", foreign_keys=[assigned_member_id])
    household = relationship("Household", back_populates="bills")
    payments = relationship("Payment", back_populates="bill")
    member_payments = relationship("BillMemberPayment", back_populates="bill", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_bills_user_id", "user_id"),
        Index("ix_bills_due_day", "due_day"),
    )
