from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class SupportRequest(Base):
    __tablename__ = "support_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cant_access_email: Mapped[bool] = mapped_column(Boolean, server_default="false")
    status: Mapped[str] = mapped_column(String(20), server_default="'open'")
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
