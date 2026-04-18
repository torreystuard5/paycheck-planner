import uuid

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class PricingConfig(Base):
    __tablename__ = "pricing_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_period: Mapped[str] = mapped_column(String(20), nullable=False)
    base_price_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    discount_pct: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("0")
    )
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
