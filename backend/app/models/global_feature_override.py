import uuid

from sqlalchemy import Boolean, DateTime, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class GlobalFeatureOverride(Base):
    __tablename__ = "global_feature_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feature_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    feature_label: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[str] = mapped_column(String, nullable=False)
    is_free_for_all: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    updated_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
