import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(200), nullable=True, server_default=text("'Anonymous'"))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, server_default=text("''"))
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True, server_default=text("'No Subject'"))
    message: Mapped[str | None] = mapped_column(Text, nullable=True, server_default=text("''"))
    status: Mapped[str] = mapped_column(String(20), server_default=text("'open'"))
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cant_access_email: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user = relationship("User", back_populates="support_tickets")
    replies = relationship("SupportTicketReply", back_populates="ticket", order_by="SupportTicketReply.created_at")

    __table_args__ = (
        Index("ix_support_tickets_user_id", "user_id"),
    )
