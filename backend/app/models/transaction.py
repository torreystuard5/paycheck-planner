import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

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
    bill_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bills.id", ondelete="SET NULL"),
        nullable=True,
    )
    debt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("debts.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, server_default=text("0"))
    paid_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    pay_period_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    is_extra: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    auto_logged: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="payments")
    bill = relationship("Bill", back_populates="payments")
    debt = relationship("Debt", back_populates="payments")

    __table_args__ = (
        Index("ix_payments_user_id", "user_id"),
        Index("ix_payments_pay_period_date", "pay_period_date"),
    )
