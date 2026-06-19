import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class PaycheckChecklist(Base):
    __tablename__ = "paycheck_checklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    pay_period_start: Mapped[str] = mapped_column(Date, nullable=False)
    occurrence_due_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    is_checked: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    checked_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user = relationship("User")

    __table_args__ = (
        Index("ix_paycheck_checklist_user_period", "user_id", "pay_period_start"),
        Index("ix_paycheck_checklist_item_occurrence", "item_type", "item_id", "occurrence_due_date"),
    )
