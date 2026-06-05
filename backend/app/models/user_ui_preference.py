import uuid

from sqlalchemy import DateTime, Integer, JSON, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class UserUIPreference(Base):
    __tablename__ = "user_ui_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    collapsed_sections: Mapped[list] = mapped_column(
        JSON, server_default=text("'[]'::json"), nullable=False
    )
    business_mileage_rate_per_mile: Mapped[float | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_tagline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fiscal_year_start_month: Mapped[int] = mapped_column(
        Integer, server_default=text("1"), nullable=False
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
