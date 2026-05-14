"""Customer Relationship Management models."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, Integer, Text, String, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, AuditMixin, BigIntPK


class CustomerProfile(AuditMixin, Base):
    """Customer profile with contact info and preferences."""
    __tablename__ = "customer_profile"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("customer.id"), nullable=True
    )

    # Preferences (stored as JSON strings)
    dietary_preferences: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allergen_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preferred_language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Loyalty
    loyalty_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loyalty_tier: Mapped[str] = mapped_column(
        String(20), default="BRONZE", nullable=False
    )
    total_visits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_spent_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    last_visit_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Consent (GDPR)
    marketing_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    data_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    visits: Mapped[list["CustomerVisit"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    loyalty_transactions: Mapped[list["LoyaltyTransaction"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_customer_profile_email", "tenant_id", "email", unique=True),
        Index("ix_customer_profile_phone", "tenant_id", "phone"),
        Index("ix_customer_profile_device", "device_id"),
        Index("ix_customer_profile_tier", "tenant_id", "loyalty_tier"),
    )


class CustomerVisit(AuditMixin, Base):
    """Record of a customer visit."""
    __tablename__ = "customer_visit"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    customer_profile_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customer_profile.id"), nullable=False, index=True
    )
    table_session_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("table_session.id"), nullable=True
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    party_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_spent_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    profile: Mapped["CustomerProfile"] = relationship(back_populates="visits")

    __table_args__ = (
        Index("ix_customer_visit_profile_date", "customer_profile_id", "visit_date"),
        Index("ix_customer_visit_branch_date", "branch_id", "visit_date"),
    )


class LoyaltyTransaction(AuditMixin, Base):
    """Points earned or redeemed."""
    __tablename__ = "loyalty_transaction"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    customer_profile_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customer_profile.id"), nullable=False, index=True
    )
    transaction_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # EARN, REDEEM, EXPIRE, ADJUST
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # Relationships
    profile: Mapped["CustomerProfile"] = relationship(back_populates="loyalty_transactions")

    __table_args__ = (
        Index("ix_loyalty_tx_profile", "customer_profile_id", "transaction_type"),
    )


class LoyaltyRule(AuditMixin, Base):
    """Configuration for points earning."""
    __tablename__ = "loyalty_rule"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    rule_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # SPEND_BASED, VISIT_BASED, PRODUCT_BASED
    points_per_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_amount_cents: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    min_spend_cents: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # Tier thresholds
    silver_threshold: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    gold_threshold: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    platinum_threshold: Mapped[int] = mapped_column(Integer, default=5000, nullable=False)
