"""
Delivery and Takeout order management endpoints.

CLEAN-ARCH: Thin router that delegates to DeliveryService.
Handles: order CRUD, status transitions, delivery assignment.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain.delivery_service import DeliveryService
from shared.utils.admin_schemas import (
    DeliveryOrderCreate,
    DeliveryOrderUpdate,
    DeliveryOrderStatusUpdate,
    DeliveryAssignInfo,
)
from shared.utils.schemas import DeliveryOrderOutput


router = APIRouter(tags=["admin-delivery"])


# =============================================================================
# List / Get
# =============================================================================


@router.get("/delivery/orders", response_model=list[DeliveryOrderOutput])
def list_delivery_orders(
    branch_id: int = Query(...),
    status: str | None = None,
    order_type: str | None = Query(default=None, alias="type"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List delivery/takeout orders for a branch with optional filters."""
    ctx = PermissionContext(user)
    ctx.require_branch_access(branch_id)

    service = DeliveryService(db)
    return service.list_by_branch(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        status=status,
        order_type=order_type,
        limit=limit,
        offset=offset,
    )


@router.get("/delivery/orders/{order_id}", response_model=DeliveryOrderOutput)
def get_delivery_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a single delivery order."""
    ctx = PermissionContext(user)
    service = DeliveryService(db)
    return service.get_order(order_id, ctx.tenant_id)


# =============================================================================
# Create
# =============================================================================


@router.post("/delivery/orders", status_code=201, response_model=DeliveryOrderOutput)
def create_delivery_order(
    body: DeliveryOrderCreate,
    branch_id: int = Query(...),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a new delivery/takeout order with items."""
    ctx = PermissionContext(user)
    ctx.require_branch_access(branch_id)

    service = DeliveryService(db)
    return service.create_order(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        data=body.model_dump(),
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


# =============================================================================
# Update
# =============================================================================


@router.put("/delivery/orders/{order_id}", response_model=DeliveryOrderOutput)
def update_delivery_order(
    order_id: int,
    body: DeliveryOrderUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update order details (customer info, notes, delivery info)."""
    ctx = PermissionContext(user)
    service = DeliveryService(db)
    return service.update_order(
        order_id=order_id,
        tenant_id=ctx.tenant_id,
        data=body.model_dump(exclude_unset=True),
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.patch("/delivery/orders/{order_id}/status", response_model=DeliveryOrderOutput)
def update_delivery_order_status(
    order_id: int,
    body: DeliveryOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Change order status with transition validation."""
    ctx = PermissionContext(user)
    service = DeliveryService(db)
    return service.update_status(
        order_id=order_id,
        tenant_id=ctx.tenant_id,
        new_status=body.status,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.patch("/delivery/orders/{order_id}/assign", response_model=DeliveryOrderOutput)
def assign_delivery_info(
    order_id: int,
    body: DeliveryAssignInfo,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Assign or update delivery address/phone on an order."""
    ctx = PermissionContext(user)
    service = DeliveryService(db)
    return service.assign_delivery(
        order_id=order_id,
        tenant_id=ctx.tenant_id,
        delivery_info=body.model_dump(exclude_unset=True),
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


# =============================================================================
# Delete
# =============================================================================


@router.delete("/delivery/orders/{order_id}", status_code=204)
def delete_delivery_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a delivery order."""
    ctx = PermissionContext(user)
    service = DeliveryService(db)
    service.delete_order(
        order_id=order_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )
