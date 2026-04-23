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
    Text,
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
    name: Mapped[str | None] = mapped_column(String(150), nullable=True, server_default=text("'Untitled Debt'"))
    type: Mapped[str | None] = mapped_column(String(30), nullable=True, server_default=text("'other'"))
    balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, server_default=text("0"))
    credit_limit: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    apr: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True, server_default=text("0"))
    minimum_payment: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, server_default=text("0"))
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default=text("1"))
    auto_pay: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    reminder_days: Mapped[int] = mapped_column(Integer, server_default=text("3"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    is_split: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    split_members: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Postpone override — temporarily moves debt to a later pay period
    postpone_until: Mapped[str | None] = mapped_column(Date, nullable=True)
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
    debt_payments = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_debts_user_id", "user_id"),
        Index("ix_debts_due_day", "due_day"),
    )
