import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    household_member_role: Mapped[str] = mapped_column(
        String(20), server_default=text("'adult'"), nullable=False
    )
    household_child_permissions: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    is_admin: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))

    # Terms of Service fields
    tos_accepted_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tos_version: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Account management fields
    last_login_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_login_count: Mapped[int] = mapped_column(
        Integer, server_default=text("0")
    )
    account_status: Mapped[str] = mapped_column(
        String(20), server_default=text("'active'")
    )
    account_status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Password reset fields
    must_reset_password: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    token_version: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), nullable=False
    )
    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # App mode (personal or business)
    app_mode: Mapped[str | None] = mapped_column(
        String, server_default=text("'personal'"), nullable=True
    )

    # What's New tracking
    last_seen_whats_new: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Secure vault fields
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes_lock_timeout: Mapped[int] = mapped_column(Integer, server_default=text("5"))

    # Email unsubscribe fields
    email_unsubscribed: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    unsubscribed_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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

    # Stripe / subscription billing
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subscription_status: Mapped[str] = mapped_column(
        String(30), server_default=text("'none'"), nullable=False
    )
    trial_ends_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_started_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    subscription_ends_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    billing_period: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Business Edition trial / admin grant
    business_trial_started_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    business_trial_ends_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    business_trial_consumed: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), nullable=False
    )
    business_access_granted_until: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Active budget tracking (Phase 4B)
    current_budget_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("budgets.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    household = relationship("Household", back_populates="members", foreign_keys=[household_id])
    income_sources = relationship("IncomeSource", back_populates="user", cascade="all, delete-orphan")
    bills = relationship("Bill", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Bill.user_id]")
    debts = relationship("Debt", back_populates="user", cascade="all, delete-orphan")
    savings_goals = relationship("SavingsGoal", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    support_tickets = relationship(
        "SupportTicket",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="[SupportTicket.user_id]",
    )
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
    paycheck_schedules = relationship("PaycheckSchedule", back_populates="user", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Budget.user_id]")
    current_budget = relationship("Budget", foreign_keys=[current_budget_id])
