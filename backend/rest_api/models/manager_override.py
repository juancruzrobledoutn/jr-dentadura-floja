"""Manager Override model for approved operations (voids, discounts, adjustments)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, AuditMixin, BigIntPK


class ManagerOverride(AuditMixin, Base):
    """Records manager-approved operations like voids, discounts, and payment reversals.

    Each override captures who requested, who approved, and the before/after state
    of the affected entity for full audit trail.
    """
    __tablename__ = "manager_override"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )

    # Override classification
    override_type: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # ITEM_VOID, DISCOUNT, PAYMENT_REVERSAL, ROUND_CANCEL

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # Who approved and who requested
    approved_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False, index=True
    )
    requested_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False, index=True
    )

    # What was affected
    entity_type: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # round_item, check, payment
    entity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Snapshots (JSON strings)
    old_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status (immediate approval for now, future: PENDING/REJECTED)
    status: Mapped[str] = mapped_column(Text, default="APPROVED", nullable=False)

    # Affected monetary amount in cents
    amount_cents: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        Index("ix_manager_override_branch_type", "branch_id", "override_type"),
        Index("ix_manager_override_entity", "entity_type", "entity_id"),
    )
