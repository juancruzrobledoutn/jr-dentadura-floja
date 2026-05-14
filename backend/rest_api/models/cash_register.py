"""Cash register and daily closing models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime

from .base import AuditMixin, Base, BigIntPK

if TYPE_CHECKING:
    from .tenant import Branch
    from .user import User


class CashRegister(AuditMixin, Base):
    """
    A cash register/drawer at a branch.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "cash_register"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)  # "Caja Principal", "Caja Bar"
    is_open: Mapped[bool] = mapped_column(default=False, nullable=False)
    current_session_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("cash_session.id", use_alter=True), nullable=True
    )

    # Relationships
    sessions: Mapped[list["CashSession"]] = relationship(
        back_populates="cash_register",
        foreign_keys="CashSession.cash_register_id",
    )

    __table_args__ = (
        Index("ix_cash_register_branch", "branch_id", "tenant_id"),
    )


class CashSession(AuditMixin, Base):
    """
    A single opening-to-closing cash session.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "cash_session"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    cash_register_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cash_register.id"), nullable=False, index=True
    )

    # Who opened/closed
    opened_by_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False
    )
    closed_by_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=True
    )

    # Timestamps
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Amounts
    opening_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    difference_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Status: OPEN, CLOSING, CLOSED
    status: Mapped[str] = mapped_column(Text, default="OPEN", nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    cash_register: Mapped["CashRegister"] = relationship(
        back_populates="sessions",
        foreign_keys=[cash_register_id],
    )
    movements: Mapped[list["CashMovement"]] = relationship(back_populates="cash_session")
    opened_by: Mapped["User"] = relationship(foreign_keys=[opened_by_id])
    closed_by: Mapped[Optional["User"]] = relationship(foreign_keys=[closed_by_id])

    __table_args__ = (
        CheckConstraint("opening_amount_cents >= 0", name="chk_opening_amount_non_negative"),
        Index("ix_cash_session_branch_status", "branch_id", "status"),
    )


class CashMovement(AuditMixin, Base):
    """
    Every cash in/out during a session.
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "cash_movement"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    cash_session_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cash_session.id"), nullable=False, index=True
    )

    # SALE, REFUND, EXPENSE, DEPOSIT, WITHDRAWAL, TIP_IN
    movement_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    # Positive=in, negative=out
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # CASH, CARD, TRANSFER, MERCADOPAGO
    payment_method: Mapped[str] = mapped_column(Text, nullable=False)

    # Reference to source entity
    reference_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # "payment", "expense"
    reference_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    performed_by_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=True
    )

    # Relationships
    cash_session: Mapped["CashSession"] = relationship(back_populates="movements")
    performed_by: Mapped[Optional["User"]] = relationship(foreign_keys=[performed_by_id])

    __table_args__ = (
        Index("ix_cash_movement_session_type", "cash_session_id", "movement_type"),
    )
