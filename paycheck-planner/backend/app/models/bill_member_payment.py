import uuid

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class BillMemberPayment(Base):
    __tablename__ = "bill_member_payments"

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
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_paid: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    paid_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    bill = relationship("Bill", back_populates="member_payments")
    member = relationship("User", back_populates="bill_member_payments")

    __table_args__ = (
        Index("ix_bill_member_payments_bill_id", "bill_id"),
        Index("ix_bill_member_payments_member_id", "member_id"),
    )
