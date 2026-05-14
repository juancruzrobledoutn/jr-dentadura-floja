"""Tip tracking and distribution models."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import AuditMixin, Base, BigIntPK

if TYPE_CHECKING:
    from .table import TableSession
    from .billing import Check
    from .user import User


class Tip(AuditMixin, Base):
    """
    A tip received during a table session.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "tip"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    table_session_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("table_session.id"), nullable=True, index=True
    )
    check_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("app_check.id"), nullable=True, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # CASH, CARD, MERCADOPAGO
    payment_method: Mapped[str] = mapped_column(Text, nullable=False)
    waiter_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=True, index=True
    )

    # Relationships
    distributions: Mapped[list["TipDistribution"]] = relationship(back_populates="tip")
    waiter: Mapped[Optional["User"]] = relationship(foreign_keys=[waiter_id])

    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="chk_tip_amount_positive"),
        Index("ix_tip_branch_waiter", "branch_id", "waiter_id"),
    )


class TipDistribution(AuditMixin, Base):
    """
    How a tip is split among staff.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "tip_distribution"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    tip_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tip.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # WAITER, KITCHEN, MANAGER
    role: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    tip: Mapped["Tip"] = relationship(back_populates="distributions")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="chk_tip_distribution_amount_positive"),
        Index("ix_tip_distribution_user", "user_id", "tip_id"),
    )


class TipPool(AuditMixin, Base):
    """
    Branch-level tip pool configuration.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "tip_pool"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)  # "Pool estándar"
    waiter_percent: Mapped[int] = mapped_column(Integer, nullable=False)  # e.g., 70
    kitchen_percent: Mapped[int] = mapped_column(Integer, nullable=False)  # e.g., 20
    other_percent: Mapped[int] = mapped_column(Integer, nullable=False)  # e.g., 10

    __table_args__ = (
        CheckConstraint(
            "waiter_percent + kitchen_percent + other_percent = 100",
            name="chk_tip_pool_percents_sum_100",
        ),
        CheckConstraint("waiter_percent >= 0", name="chk_tip_pool_waiter_non_negative"),
        CheckConstraint("kitchen_percent >= 0", name="chk_tip_pool_kitchen_non_negative"),
        CheckConstraint("other_percent >= 0", name="chk_tip_pool_other_non_negative"),
        Index("ix_tip_pool_branch", "branch_id", "tenant_id"),
    )
