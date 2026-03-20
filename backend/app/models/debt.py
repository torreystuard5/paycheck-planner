import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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


class Debt(Base):
    __tablename__ = "debts"

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
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    apr: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    minimum_payment: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False)
    auto_pay: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    reminder_days: Mapped[int] = mapped_column(Integer, server_default=text("3"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="debts")
    household = relationship("Household", back_populates="debts")
    payments = relationship("Payment", back_populates="debt")

    __table_args__ = (
        CheckConstraint("due_day >= 1 AND due_day <= 31", name="ck_debts_due_day"),
        Index("ix_debts_user_id", "user_id"),
        Index("ix_debts_due_day", "due_day"),
    )
