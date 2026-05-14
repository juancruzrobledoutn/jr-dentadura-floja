"""
Delivery/Takeout Service - Clean Architecture Implementation.

CLEAN-ARCH: Handles delivery and takeout order management including:
- Order CRUD with items
- Status flow: RECEIVED → PREPARING → READY → (PICKED_UP | OUT_FOR_DELIVERY → DELIVERED) / CANCELED
- Delivery info assignment
- Filtering by status and order type
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models.delivery import DeliveryOrder, DeliveryOrderItem
from rest_api.models.catalog import Product, BranchProduct
from rest_api.services.crud.soft_delete import soft_delete, set_created_by, set_updated_by
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError, ValidationError

logger = get_logger(__name__)

# Valid order types
ORDER_TYPES = {"TAKEOUT", "DELIVERY"}

# Valid statuses
STATUSES = {
    "RECEIVED", "PREPARING", "READY",
    "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "CANCELED",
}

# Valid status transitions
STATUS_TRANSITIONS: dict[str, set[str]] = {
    "RECEIVED": {"PREPARING", "CANCELED"},
    "PREPARING": {"READY", "CANCELED"},
    "READY": {"PICKED_UP", "OUT_FOR_DELIVERY", "CANCELED"},
    "OUT_FOR_DELIVERY": {"DELIVERED", "CANCELED"},
    # Terminal states
    "PICKED_UP": set(),
    "DELIVERED": set(),
    "CANCELED": set(),
}

PAYMENT_METHODS = {"CASH", "CARD", "MP", "TRANSFER"}


class DeliveryService:
    """Service for delivery and takeout order management."""

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Query Methods
    # =========================================================================

    def list_by_branch(
        self,
        tenant_id: int,
        branch_id: int,
        *,
        status: str | None = None,
        order_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List delivery/takeout orders for a branch with optional filters."""
        limit = min(max(1, limit), 200)
        offset = max(0, offset)

        query = (
            select(DeliveryOrder)
            .options(selectinload(DeliveryOrder.items))
            .where(
                DeliveryOrder.tenant_id == tenant_id,
                DeliveryOrder.branch_id == branch_id,
                DeliveryOrder.is_active.is_(True),
            )
        )

        if status:
            if status not in STATUSES:
                raise ValidationError(f"Estado inválido: {status}", field="status")
            query = query.where(DeliveryOrder.status == status)

        if order_type:
            if order_type not in ORDER_TYPES:
                raise ValidationError(f"Tipo de orden inválido: {order_type}", field="order_type")
            query = query.where(DeliveryOrder.order_type == order_type)

        query = query.order_by(DeliveryOrder.created_at.desc()).offset(offset).limit(limit)
        orders = self._db.execute(query).scalars().unique().all()

        return [self._order_to_dict(o) for o in orders]

    def get_order(
        self,
        order_id: int,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Get a single delivery order by ID."""
        order = self._find_order(order_id, tenant_id)
        return self._order_to_dict(order)

    # =========================================================================
    # Create
    # =========================================================================

    def create_order(
        self,
        tenant_id: int,
        branch_id: int,
        data: dict[str, Any],
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """
        Create a new delivery/takeout order with items.

        Args:
            data: Must include order_type, customer_name, customer_phone, items[].
                  For DELIVERY, delivery_address is required.
        """
        order_type = data.get("order_type")
        if order_type not in ORDER_TYPES:
            raise ValidationError(
                f"order_type debe ser TAKEOUT o DELIVERY, recibido: {order_type}",
                field="order_type",
            )

        customer_name = data.get("customer_name", "").strip()
        if not customer_name:
            raise ValidationError("customer_name es requerido", field="customer_name")

        customer_phone = data.get("customer_phone", "").strip()
        if not customer_phone:
            raise ValidationError("customer_phone es requerido", field="customer_phone")

        items_data = data.get("items", [])
        if not items_data:
            raise ValidationError("Se requiere al menos un item", field="items")

        # For DELIVERY, address is required
        delivery_address = data.get("delivery_address")
        if order_type == "DELIVERY" and not delivery_address:
            raise ValidationError(
                "delivery_address es requerido para pedidos de delivery",
                field="delivery_address",
            )

        # Validate payment method if provided
        payment_method = data.get("payment_method")
        if payment_method and payment_method not in PAYMENT_METHODS:
            raise ValidationError(
                f"Método de pago inválido: {payment_method}",
                field="payment_method",
            )

        # Create order
        order = DeliveryOrder(
            tenant_id=tenant_id,
            branch_id=branch_id,
            order_type=order_type,
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_email=data.get("customer_email"),
            delivery_address=delivery_address,
            delivery_instructions=data.get("delivery_instructions"),
            delivery_lat=data.get("delivery_lat"),
            delivery_lng=data.get("delivery_lng"),
            estimated_ready_at=data.get("estimated_ready_at"),
            estimated_delivery_at=data.get("estimated_delivery_at"),
            status="RECEIVED",
            payment_method=payment_method,
            notes=data.get("notes"),
            total_cents=0,
        )
        set_created_by(order, user_id, user_email)
        self._db.add(order)
        self._db.flush()

        # Create items and calculate total
        total_cents = 0
        for item_data in items_data:
            product_id = item_data.get("product_id")
            qty = item_data.get("qty", 1)

            if not product_id:
                raise ValidationError("product_id es requerido en cada item", field="items")
            if qty < 1:
                raise ValidationError("qty debe ser >= 1", field="items")

            # Get product price snapshot
            product_name, unit_price_cents = self._get_product_info(
                product_id, branch_id, tenant_id
            )

            item = DeliveryOrderItem(
                tenant_id=tenant_id,
                order_id=order.id,
                product_id=product_id,
                qty=qty,
                unit_price_cents=unit_price_cents,
                product_name=product_name,
                notes=item_data.get("notes"),
            )
            set_created_by(item, user_id, user_email)
            self._db.add(item)
            total_cents += unit_price_cents * qty

        order.total_cents = total_cents
        safe_commit(self._db)
        self._db.refresh(order)

        logger.info(
            "Delivery order created",
            order_id=order.id,
            order_type=order_type,
            branch_id=branch_id,
            total_cents=total_cents,
        )

        return self._order_to_dict(order)

    # =========================================================================
    # Update
    # =========================================================================

    def update_order(
        self,
        order_id: int,
        tenant_id: int,
        data: dict[str, Any],
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """Update order details (customer info, notes, delivery info)."""
        order = self._find_order(order_id, tenant_id)

        # Cannot update terminal orders
        if order.status in ("PICKED_UP", "DELIVERED", "CANCELED"):
            raise ValidationError(
                f"No se puede modificar un pedido en estado {order.status}",
                field="status",
            )

        # Update allowed fields
        updatable = {
            "customer_name", "customer_phone", "customer_email",
            "delivery_address", "delivery_instructions",
            "delivery_lat", "delivery_lng",
            "estimated_ready_at", "estimated_delivery_at",
            "payment_method", "is_paid", "notes",
        }

        for field, value in data.items():
            if field in updatable and hasattr(order, field):
                setattr(order, field, value)

        set_updated_by(order, user_id, user_email)
        safe_commit(self._db)
        self._db.refresh(order)

        return self._order_to_dict(order)

    def update_status(
        self,
        order_id: int,
        tenant_id: int,
        new_status: str,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """
        Update order status with transition validation.

        Status flow:
            RECEIVED → PREPARING → READY → PICKED_UP (takeout)
            RECEIVED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED (delivery)
            Any non-terminal → CANCELED
        """
        if new_status not in STATUSES:
            raise ValidationError(f"Estado inválido: {new_status}", field="status")

        order = self._find_order(order_id, tenant_id)
        current = order.status

        allowed = STATUS_TRANSITIONS.get(current, set())
        if new_status not in allowed:
            raise ValidationError(
                f"Transición inválida: {current} → {new_status}. "
                f"Transiciones válidas: {', '.join(sorted(allowed)) or 'ninguna (estado terminal)'}",
                field="status",
            )

        order.status = new_status
        set_updated_by(order, user_id, user_email)
        safe_commit(self._db)
        self._db.refresh(order)

        logger.info(
            "Delivery order status updated",
            order_id=order_id,
            from_status=current,
            to_status=new_status,
        )

        return self._order_to_dict(order)

    def assign_delivery(
        self,
        order_id: int,
        tenant_id: int,
        delivery_info: dict[str, Any],
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """Add or update delivery address and phone on an existing order."""
        order = self._find_order(order_id, tenant_id)

        if order.order_type != "DELIVERY":
            raise ValidationError(
                "Solo se puede asignar info de delivery a pedidos tipo DELIVERY",
                field="order_type",
            )

        if delivery_info.get("delivery_address"):
            order.delivery_address = delivery_info["delivery_address"]
        if delivery_info.get("delivery_instructions"):
            order.delivery_instructions = delivery_info["delivery_instructions"]
        if delivery_info.get("delivery_lat") is not None:
            order.delivery_lat = delivery_info["delivery_lat"]
        if delivery_info.get("delivery_lng") is not None:
            order.delivery_lng = delivery_info["delivery_lng"]
        if delivery_info.get("customer_phone"):
            order.customer_phone = delivery_info["customer_phone"]

        set_updated_by(order, user_id, user_email)
        safe_commit(self._db)
        self._db.refresh(order)

        return self._order_to_dict(order)

    # =========================================================================
    # Delete
    # =========================================================================

    def delete_order(
        self,
        order_id: int,
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> None:
        """Soft delete a delivery order."""
        order = self._find_order(order_id, tenant_id)
        soft_delete(self._db, order, user_id, user_email)

    # =========================================================================
    # Private helpers
    # =========================================================================

    def _find_order(self, order_id: int, tenant_id: int) -> DeliveryOrder:
        """Find an active order or raise NotFoundError."""
        order = self._db.scalar(
            select(DeliveryOrder)
            .options(selectinload(DeliveryOrder.items))
            .where(
                DeliveryOrder.id == order_id,
                DeliveryOrder.tenant_id == tenant_id,
                DeliveryOrder.is_active.is_(True),
            )
        )
        if not order:
            raise NotFoundError("Pedido Delivery", order_id, tenant_id=tenant_id)
        return order

    def _get_product_info(
        self, product_id: int, branch_id: int, tenant_id: int
    ) -> tuple[str, int]:
        """Get product name and branch price for snapshot."""
        product = self._db.scalar(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == tenant_id,
                Product.is_active.is_(True),
            )
        )
        if not product:
            raise ValidationError(f"Producto no encontrado: {product_id}", field="items")

        # Get branch-specific price
        bp = self._db.scalar(
            select(BranchProduct).where(
                BranchProduct.product_id == product_id,
                BranchProduct.branch_id == branch_id,
            )
        )
        price_cents = bp.price_cents if bp else 0

        return product.name, price_cents

    def _order_to_dict(self, order: DeliveryOrder) -> dict[str, Any]:
        """Convert order entity to output dict."""
        items = []
        for item in (order.items or []):
            items.append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "qty": item.qty,
                "unit_price_cents": item.unit_price_cents,
                "subtotal_cents": item.qty * item.unit_price_cents,
                "notes": item.notes,
            })

        return {
            "id": order.id,
            "tenant_id": order.tenant_id,
            "branch_id": order.branch_id,
            "order_type": order.order_type,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "customer_email": order.customer_email,
            "delivery_address": order.delivery_address,
            "delivery_instructions": order.delivery_instructions,
            "delivery_lat": order.delivery_lat,
            "delivery_lng": order.delivery_lng,
            "estimated_ready_at": order.estimated_ready_at.isoformat() if order.estimated_ready_at else None,
            "estimated_delivery_at": order.estimated_delivery_at.isoformat() if order.estimated_delivery_at else None,
            "status": order.status,
            "total_cents": order.total_cents,
            "payment_method": order.payment_method,
            "is_paid": order.is_paid,
            "notes": order.notes,
            "items": items,
            "is_active": order.is_active,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        }
