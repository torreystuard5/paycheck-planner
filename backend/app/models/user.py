import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), server_default=text("'USD'"))
    date_format: Mapped[str] = mapped_column(String(20), server_default=text("'MM/DD/YYYY'"))
    pay_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True, server_default=text("'biweekly'"))
    next_pay_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    net_pay_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, server_default=text("0"))
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    is_admin: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Supporter fields
    subscription_tier: Mapped[str] = mapped_column(
        String(20), server_default=text("'early_access'")
    )
    supporter_months_banked: Mapped[int] = mapped_column(
        Integer, server_default=text("0")
    )
    promo_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("promo_codes.id"),
        nullable=True,
    )
    is_supporter: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))

    # Referral fields
    referral_code: Mapped[str | None] = mapped_column(
        String(10), unique=True, nullable=True
    )
    referred_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    free_month_credits: Mapped[int] = mapped_column(
        Integer, server_default=text("0")
    )
    next_billing_date: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    household = relationship("Household", back_populates="members", foreign_keys=[household_id])
    income_sources = relationship("IncomeSource", back_populates="user", cascade="all, delete-orphan")
    bills = relationship("Bill", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Bill.user_id]")
    debts = relationship("Debt", back_populates="user", cascade="all, delete-orphan")
    savings_goals = relationship("SavingsGoal", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    support_tickets = relationship("SupportTicket", back_populates="user", cascade="all, delete-orphan")
    referrals_given = relationship(
        "ReferralReward",
        back_populates="referrer",
        foreign_keys="[ReferralReward.referrer_id]",
    )
    referrals_received = relationship(
        "ReferralReward",
        back_populates="referred_user",
        foreign_keys="[ReferralReward.referred_user_id]",
    )
    bill_member_payments = relationship("BillMemberPayment", back_populates="member", cascade="all, delete-orphan")
