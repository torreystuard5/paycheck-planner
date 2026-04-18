from sqlalchemy import Column, String, Integer, Boolean, DateTime, text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code = Column(String(30), unique=True, nullable=False)
    tier = Column(String(20), server_default="pro")  # pro | lifetime
    max_uses = Column(Integer, nullable=True)  # null = unlimited
    current_uses = Column(Integer, server_default="0")
    is_active = Column(Boolean, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    expires_at = Column(DateTime(timezone=True), nullable=True)
