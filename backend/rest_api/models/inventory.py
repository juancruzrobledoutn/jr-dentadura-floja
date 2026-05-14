"""
Inventory Management Models: stock tracking, movements, alerts, suppliers, purchases, waste, and cost calculation.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import AuditMixin, Base, BigIntPK

if TYPE_CHECKING:
    from .ingredient import Ingredient
    from .recipe import Recipe
    from .catalog import Product


class StockItem(AuditMixin, Base):
    """Current stock level for an ingredient at a branch."""

    __tablename__ = "stock_item"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ingredient.id"), nullable=False, index=True
    )

    current_qty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit: Mapped[str] = mapped_column(Text, nullable=False)  # kg, lt, units, g, ml
    min_level: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_level: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost_per_unit_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # walk-in, dry storage, etc.
    last_restock_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    ingredient: Mapped["Ingredient"] = relationship()
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="stock_item", cascade="all, delete-orphan")
    alerts: Mapped[list["StockAlert"]] = relationship(back_populates="stock_item", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("branch_id", "ingredient_id", name="uq_stock_item_branch_ingredient"),
        Index("ix_stock_item_branch_qty", "branch_id", "current_qty"),
        CheckConstraint("current_qty >= 0", name="chk_stock_item_qty_positive"),
        CheckConstraint("min_level >= 0", name="chk_stock_item_min_level_positive"),
        CheckConstraint("cost_per_unit_cents >= 0", name="chk_stock_item_cost_positive"),
    )


class StockMovement(AuditMixin, Base):
    """Every stock change is recorded as a movement for auditability."""

    __tablename__ = "stock_movement"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    stock_item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stock_item.id"), nullable=False, index=True
    )

    movement_type: Mapped[str] = mapped_column(Text, nullable=False)  # PURCHASE, ORDER_DEDUCTION, ADJUSTMENT, WASTE, TRANSFER
    qty_change: Mapped[float] = mapped_column(Float, nullable=False)  # Positive = addition, negative = deduction
    qty_before: Mapped[float] = mapped_column(Float, nullable=False)
    qty_after: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # "round", "purchase_order", "waste_log"
    reference_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cost_per_unit_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Cost at time of movement
    performed_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=True)

    # Relationships
    stock_item: Mapped["StockItem"] = relationship(back_populates="movements")

    __table_args__ = (
        Index("ix_stock_movement_branch_type", "branch_id", "movement_type"),
        Index("ix_stock_movement_reference", "reference_type", "reference_id"),
    )


class StockAlert(AuditMixin, Base):
    """Alert generated when stock falls below minimum level."""

    __tablename__ = "stock_alert"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    stock_item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stock_item.id"), nullable=False, index=True
    )

    alert_type: Mapped[str] = mapped_column(Text, nullable=False)  # LOW_STOCK, OUT_OF_STOCK, EXPIRING
    current_qty: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_qty: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="ACTIVE")  # ACTIVE, ACKNOWLEDGED, RESOLVED
    acknowledged_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    stock_item: Mapped["StockItem"] = relationship(back_populates="alerts")

    __table_args__ = (
        Index("ix_stock_alert_branch_status", "branch_id", "status"),
    )


class Supplier(AuditMixin, Base):
    """Supplier/vendor for ingredients."""

    __tablename__ = "supplier"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="supplier")

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_supplier_tenant_name"),
    )


class PurchaseOrder(AuditMixin, Base):
    """Order to a supplier for ingredients."""

    __tablename__ = "purchase_order"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("supplier.id"), nullable=False, index=True
    )

    status: Mapped[str] = mapped_column(Text, nullable=False, default="DRAFT")  # DRAFT, SENT, PARTIALLY_RECEIVED, RECEIVED, CANCELED
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    supplier: Mapped["Supplier"] = relationship(back_populates="purchase_orders")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(back_populates="purchase_order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_purchase_order_branch_status", "branch_id", "status"),
        CheckConstraint("total_cents >= 0", name="chk_purchase_order_total_positive"),
    )


class PurchaseOrderItem(AuditMixin, Base):
    """Line item in a purchase order."""

    __tablename__ = "purchase_order_item"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    purchase_order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("purchase_order.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ingredient.id"), nullable=False, index=True
    )

    qty_ordered: Mapped[float] = mapped_column(Float, nullable=False)
    qty_received: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    unit_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="items")
    ingredient: Mapped["Ingredient"] = relationship()

    __table_args__ = (
        CheckConstraint("qty_ordered > 0", name="chk_po_item_qty_positive"),
        CheckConstraint("unit_cost_cents >= 0", name="chk_po_item_cost_positive"),
    )


class WasteLog(AuditMixin, Base):
    """Record of wasted/spoiled ingredients."""

    __tablename__ = "waste_log"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    stock_item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stock_item.id"), nullable=False, index=True
    )

    qty: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # EXPIRED, DAMAGED, OVERPRODUCTION, PREPARATION_WASTE
    cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # Calculated: qty * cost_per_unit
    logged_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=True)
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    # Relationships
    stock_item: Mapped["StockItem"] = relationship()

    __table_args__ = (
        Index("ix_waste_log_branch", "branch_id"),
        CheckConstraint("qty > 0", name="chk_waste_log_qty_positive"),
        CheckConstraint("cost_cents >= 0", name="chk_waste_log_cost_positive"),
    )


class RecipeCost(AuditMixin, Base):
    """Cost calculation snapshot for a recipe based on current ingredient prices."""

    __tablename__ = "recipe_cost"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    recipe_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("recipe.id"), nullable=False, index=True
    )
    product_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("product.id"), nullable=True, index=True
    )

    total_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    food_cost_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    # Relationships
    recipe: Mapped["Recipe"] = relationship()
    product: Mapped[Optional["Product"]] = relationship()

    __table_args__ = (
        Index("ix_recipe_cost_recipe", "recipe_id"),
        CheckConstraint("total_cost_cents >= 0", name="chk_recipe_cost_total_positive"),
        CheckConstraint("food_cost_percent >= 0", name="chk_recipe_cost_percent_positive"),
    )
