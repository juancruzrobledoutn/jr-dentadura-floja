"""
Shared Cart Router — aggregator + bulk actions.

Handles real-time cart synchronization between diners at a table.
Uses table token authentication (X-Table-Token header).

C8 PASS 7 REFACTOR: This file is now a thin aggregator. Item mutations
(POST /add, PATCH /{item_id}, DELETE /{item_id}) live in `cart_items.py`.

The two bulk-action endpoints (GET "" and DELETE "") stay defined here on
the aggregator router because FastAPI does not allow including a child
router whose routes use an empty path (`""`) — the parent prefix + empty
child path collapses to an empty operation path and raises FastAPIError.
Keeping them here also keeps the aggregator self-contained and matches the
URL contract `GET/DELETE /api/diner/cart` byte-for-byte.

All endpoints share the `/api/diner/cart` prefix and the `diner-cart`
OpenAPI tag.

Public surface: the `router` symbol exported here is what `main.py` and
`diner/__init__.py` import. URLs and contracts are byte-identical to the
pre-split monolith.

Feature modules:
    - cart_items.py    → POST /add, PATCH /{item_id}, DELETE /{item_id}

Schemas and helpers (shared with the rest of the diner package):
    - _schemas.py       → AddToCartRequest, UpdateCartItemRequest,
                          CartItemOutput, CartOutput
    - _event_helpers.py → _bg_publish_cart_event (generic CART_* publisher)
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models import CartItem, Product, TableSession
from rest_api.routers.diner import cart_items
from rest_api.routers.diner._event_helpers import _bg_publish_cart_event
from rest_api.routers.diner._schemas import CartItemOutput, CartOutput
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import CART_CLEARED
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter


router = APIRouter(prefix="/api/diner/cart", tags=["diner-cart"])

# Item mutation endpoints (POST /add, PATCH/DELETE /{item_id})
router.include_router(cart_items.router)


@router.get("", response_model=CartOutput)
@limiter.limit("60/minute")
def get_cart(
    request: Request,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> CartOutput:
    """
    Get the full shared cart for reconnection/sync.

    Returns all active cart items for the session with current version.

    Requires X-Table-Token header.
    """
    session_id = table_ctx["session_id"]
    branch_id = table_ctx["branch_id"]

    # Get session with cart version
    session = db.get(TableSession, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get all active cart items
    cart_items_rows = db.scalars(
        select(CartItem)
        .options(
            selectinload(CartItem.product).selectinload(Product.branch_products),
            selectinload(CartItem.diner),
        )
        .where(
            CartItem.session_id == session_id,
            CartItem.is_active.is_(True),
        )
        .order_by(CartItem.created_at)
    ).all()

    # Build output
    items = []
    for item in cart_items_rows:
        branch_product = next(
            (bp for bp in item.product.branch_products if bp.branch_id == branch_id and bp.is_active),
            None,
        )
        price_cents = branch_product.price_cents if branch_product else 0

        items.append(
            CartItemOutput(
                item_id=item.id,
                product_id=item.product.id,
                product_name=item.product.name,
                product_image=item.product.image,
                price_cents=price_cents,
                quantity=item.quantity,
                notes=item.notes,
                diner_id=item.diner.id,
                diner_name=item.diner.name,
                diner_color=item.diner.color,
            )
        )

    return CartOutput(items=items, version=session.cart_version)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def clear_cart(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
):
    """
    Clear all items from the cart.

    Called after round submission to reset the cart.
    Publishes CART_CLEARED event to all diners at the table.

    Requires X-Table-Token header.
    """
    session_id = table_ctx["session_id"]
    tenant_id = table_ctx["tenant_id"]
    branch_id = table_ctx["branch_id"]

    # Block cart modifications when check has been requested
    session = db.get(TableSession, session_id)
    if not session or session.status != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is closed or paying — cart modifications are not allowed",
        )

    # Soft delete all cart items
    cart_items_rows = db.scalars(
        select(CartItem).where(
            CartItem.session_id == session_id,
            CartItem.is_active.is_(True),
        )
    ).all()

    for item in cart_items_rows:
        item.is_active = False

    # Increment cart version (session already fetched in status guard above)
    session.cart_version += 1

    # AUDIT-FIX: Wrap commit in try-except for consistent error handling
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to clear cart", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear cart - please try again",
        )

    # Publish event in background
    background_tasks.add_task(
        _bg_publish_cart_event,
        event_type=CART_CLEARED,
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        entity={"cleared": True},
        actor_diner_id=None,
    )


__all__ = ["router"]
