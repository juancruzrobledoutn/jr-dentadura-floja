"""
Diner / shared cart — item mutations feature router.

Endpoints:
    POST   /add
    PATCH  /{item_id}
    DELETE /{item_id}

C8 PASS 7 REFACTOR: Split out of `cart.py` to keep modules <500 LoC.
Mounted under the parent `/api/diner/cart` prefix from the cart aggregator.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models import (
    BranchProduct,
    CartItem,
    Diner,
    Product,
    TableSession,
)
from rest_api.routers.diner._event_helpers import _bg_publish_cart_event
from rest_api.routers.diner._schemas import (
    AddToCartRequest,
    CartItemOutput,
    UpdateCartItemRequest,
)
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    CART_ITEM_ADDED,
    CART_ITEM_REMOVED,
    CART_ITEM_UPDATED,
)
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter


router = APIRouter(tags=["diner-cart"])


@router.post("/add", response_model=CartItemOutput)
@limiter.limit("30/minute")
def add_to_cart(
    request: Request,
    body: AddToCartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> CartItemOutput:
    """
    Add an item to the shared cart.

    If the same product already exists for this diner, the quantity is updated (UPSERT).
    Publishes CART_ITEM_ADDED or CART_ITEM_UPDATED event to all diners at the table.

    Requires X-Table-Token header.
    """
    session_id = table_ctx["session_id"]
    tenant_id = table_ctx["tenant_id"]
    branch_id = table_ctx["branch_id"]

    # Get session and validate it's open (PAYING sessions cannot modify cart)
    session = db.scalar(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == "OPEN",
        )
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is closed or paying — cart modifications are not allowed",
        )

    # Validate product exists and is available in this branch
    product = db.scalar(
        select(Product)
        .options(selectinload(Product.branch_products))
        .where(
            Product.id == body.product_id,
            Product.tenant_id == tenant_id,
            Product.is_active.is_(True),
        )
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    # Get branch price
    branch_product = next(
        (bp for bp in product.branch_products if bp.branch_id == branch_id and bp.is_active),
        None,
    )
    if not branch_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not available in this branch",
        )

    # Get diner (required for cart items)
    # If diner_id is provided, use it; otherwise fall back to most recent diner
    if body.diner_id:
        diner = db.scalar(
            select(Diner).where(
                Diner.id == body.diner_id,
                Diner.session_id == session_id,
                Diner.is_active.is_(True),
            )
        )
        if not diner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid diner_id for this session",
            )
    else:
        # Fallback: get most recent diner (for backward compatibility)
        diner = db.scalar(
            select(Diner).where(
                Diner.session_id == session_id,
                Diner.is_active.is_(True),
            ).order_by(Diner.joined_at.desc())
        )
        if not diner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No diner registered for this session. Please register first.",
            )

    # Check if item already exists (UPSERT)
    existing_item = db.scalar(
        select(CartItem).where(
            CartItem.session_id == session_id,
            CartItem.diner_id == diner.id,
            CartItem.product_id == body.product_id,
            CartItem.is_active.is_(True),
        )
    )

    if existing_item:
        # Update existing item
        existing_item.quantity = body.quantity
        if body.notes is not None:
            existing_item.notes = body.notes
        event_type = CART_ITEM_UPDATED
        cart_item = existing_item
    else:
        # Create new item
        cart_item = CartItem(
            tenant_id=tenant_id,
            branch_id=branch_id,
            session_id=session_id,
            diner_id=diner.id,
            product_id=body.product_id,
            quantity=body.quantity,
            notes=body.notes,
        )
        db.add(cart_item)
        event_type = CART_ITEM_ADDED

    # Increment cart version
    session.cart_version += 1

    # AUDIT-FIX: Wrap commit in try-except for consistent error handling
    try:
        db.commit()
        db.refresh(cart_item)
    except Exception as e:
        db.rollback()
        logger.error("Failed to add item to cart", product_id=body.product_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add to cart - please try again",
        )

    # Build output
    output = CartItemOutput(
        item_id=cart_item.id,
        product_id=product.id,
        product_name=product.name,
        product_image=product.image,
        price_cents=branch_product.price_cents,
        quantity=cart_item.quantity,
        notes=cart_item.notes,
        diner_id=diner.id,
        diner_name=diner.name,
        diner_color=diner.color,
    )

    # Publish event in background
    background_tasks.add_task(
        _bg_publish_cart_event,
        event_type=event_type,
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        entity=output.model_dump(),
        actor_diner_id=diner.id,
    )

    return output


@router.patch("/{item_id}", response_model=CartItemOutput)
@limiter.limit("30/minute")
def update_cart_item(
    request: Request,
    item_id: int,
    body: UpdateCartItemRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> CartItemOutput:
    """
    Update a cart item's quantity or notes.

    Only the diner who added the item can update it.
    Publishes CART_ITEM_UPDATED event to all diners at the table.

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

    # Get cart item with product
    cart_item = db.scalar(
        select(CartItem)
        .options(
            selectinload(CartItem.product).selectinload(Product.branch_products),
            selectinload(CartItem.diner),
        )
        .where(
            CartItem.id == item_id,
            CartItem.session_id == session_id,
            CartItem.is_active.is_(True),
        )
    )
    if not cart_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found",
        )

    # Update item
    cart_item.quantity = body.quantity
    if body.notes is not None:
        cart_item.notes = body.notes

    # Increment cart version (session already fetched in status guard above)
    session.cart_version += 1

    # AUDIT-FIX: Wrap commit in try-except for consistent error handling
    try:
        db.commit()
        db.refresh(cart_item)
    except Exception as e:
        db.rollback()
        logger.error("Failed to update cart item", item_id=item_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update cart - please try again",
        )

    # Get branch price
    branch_product = next(
        (bp for bp in cart_item.product.branch_products if bp.branch_id == branch_id and bp.is_active),
        None,
    )
    price_cents = branch_product.price_cents if branch_product else 0

    # Build output
    output = CartItemOutput(
        item_id=cart_item.id,
        product_id=cart_item.product.id,
        product_name=cart_item.product.name,
        product_image=cart_item.product.image,
        price_cents=price_cents,
        quantity=cart_item.quantity,
        notes=cart_item.notes,
        diner_id=cart_item.diner.id,
        diner_name=cart_item.diner.name,
        diner_color=cart_item.diner.color,
    )

    # Publish event in background
    background_tasks.add_task(
        _bg_publish_cart_event,
        event_type=CART_ITEM_UPDATED,
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        entity=output.model_dump(),
        actor_diner_id=cart_item.diner.id,
    )

    return output


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def remove_cart_item(
    request: Request,
    item_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
):
    """
    Remove an item from the cart.

    Only the diner who added the item can remove it.
    Publishes CART_ITEM_REMOVED event to all diners at the table.

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

    # Get cart item
    cart_item = db.scalar(
        select(CartItem)
        .options(selectinload(CartItem.diner))
        .where(
            CartItem.id == item_id,
            CartItem.session_id == session_id,
            CartItem.is_active.is_(True),
        )
    )
    if not cart_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found",
        )

    diner_id = cart_item.diner.id
    product_id = cart_item.product_id

    # Soft delete
    cart_item.is_active = False

    # Increment cart version (session already fetched in status guard above)
    session.cart_version += 1

    # AUDIT-FIX: Wrap commit in try-except for consistent error handling
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to remove cart item", item_id=item_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove from cart - please try again",
        )

    # Publish event in background
    background_tasks.add_task(
        _bg_publish_cart_event,
        event_type=CART_ITEM_REMOVED,
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        entity={
            "item_id": item_id,
            "product_id": product_id,
            "diner_id": diner_id,
        },
        actor_diner_id=diner_id,
    )
