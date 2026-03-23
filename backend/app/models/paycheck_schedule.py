from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PaycheckSchedule(Base):
    __tablename__ = "paycheck_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    frequency = Column(String(20), nullable=False)  # "weekly", "biweekly", "semi_monthly", "monthly"
    day_of_week = Column(Integer, nullable=True)  # 0=Monday...6=Sunday (for weekly/biweekly)
    anchor_date = Column(Date, nullable=True)  # Reference paycheck date (for biweekly)
    day1 = Column(Integer, nullable=True)  # Day of month (for semi_monthly first date, or monthly)
    day2 = Column(Integer, nullable=True)  # Day of month (for semi_monthly second date)
    income_source_name = Column(String(100), nullable=True)  # Optional label
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="paycheck_schedules")
