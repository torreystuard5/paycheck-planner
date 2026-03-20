from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Supporter(Base):
    __tablename__ = "supporters"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    ko_fi_transaction_id = Column(String(100), nullable=True)
    donation_amount = Column(Numeric(12, 2), nullable=False)
    months_credited = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
