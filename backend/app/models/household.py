import uuid

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str | None] = mapped_column(String(100), nullable=True, server_default=text("'My Household'"))
    split_method: Mapped[str] = mapped_column(String(20), server_default=text("'equal'"))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    invite_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    members = relationship("User", back_populates="household", foreign_keys="[User.household_id]")
    bills = relationship("Bill", back_populates="household")
    debts = relationship("Debt", back_populates="household")
