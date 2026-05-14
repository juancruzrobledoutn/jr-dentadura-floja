"""Delivery and takeout order models."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Text, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, AuditMixin, BigIntPK


class DeliveryOrder(AuditMixin, Base):
    """Order for takeout or delivery (no physical table)."""
    __tablename__ = "delivery_order"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenant.id"), index=True)
    branch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("branch.id"), index=True)

    # Order type
    order_type: Mapped[str] = mapped_column(Text)  # TAKEOUT | DELIVERY

    # Customer info
    customer_name: Mapped[str] = mapped_column(Text)
    customer_phone: Mapped[str] = mapped_column(Text)
    customer_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Delivery address (only for DELIVERY type)
    delivery_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_lat: Mapped[Optional[float]] = mapped_column(nullable=True)
    delivery_lng: Mapped[Optional[float]] = mapped_column(nullable=True)

    # Timing
    estimated_ready_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    estimated_delivery_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Status: RECEIVED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, PICKED_UP, CANCELED
    status: Mapped[str] = mapped_column(Text, default="RECEIVED", index=True)

    # Payment
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    payment_method: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # CASH, CARD, MP, TRANSFER
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)

    # Notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    items: Mapped[list["DeliveryOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_delivery_order_branch_status", "branch_id", "status"),
    )


class DeliveryOrderItem(AuditMixin, Base):
    """Single item in a delivery/takeout order."""
    __tablename__ = "delivery_order_item"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenant.id"))
    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("delivery_order.id"), index=True
    )
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("product.id"))

    qty: Mapped[int] = mapped_column(Integer)
    unit_price_cents: Mapped[int] = mapped_column(Integer)  # Snapshot at order time
    product_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Snapshot
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    order: Mapped["DeliveryOrder"] = relationship(back_populates="items")
