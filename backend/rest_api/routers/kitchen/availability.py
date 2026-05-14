"""
Kitchen product availability router.
Allows kitchen staff to mark products as temporarily unavailable.
"""

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.config.logging import kitchen_logger as logger
from shared.infrastructure.db import get_db, safe_commit
from shared.infrastructure.events import (
    get_redis_pool,
    publish_product_availability_event,
)
from shared.infrastructure.cache.menu_cache import invalidate_all_menu_caches
from shared.security.auth import current_user_context, require_roles
from rest_api.models import BranchProduct


router = APIRouter(prefix="/api/kitchen", tags=["kitchen"])


class ToggleAvailabilityRequest(BaseModel):
    """Request body for toggling product availability."""
    is_available: bool


class ToggleAvailabilityResponse(BaseModel):
    """Response for product availability toggle."""
    product_id: int
    branch_id: int
    is_available: bool


async def _publish_availability_event(
    tenant_id: int,
    branch_id: int,
    product_id: int,
    is_available: bool,
    user_id: int,
    user_role: str,
) -> None:
    """Background task to publish availability change event."""
    try:
        redis = await get_redis_pool()
        await publish_product_availability_event(
            redis_client=redis,
            tenant_id=tenant_id,
            branch_id=branch_id,
            product_id=product_id,
            is_available=is_available,
            actor_user_id=user_id,
            actor_role=user_role,
        )
    except Exception as e:
        logger.error(
            "Failed to publish product availability event",
            product_id=product_id,
            error=str(e),
        )


@router.patch(
    "/products/{product_id}/availability",
    response_model=ToggleAvailabilityResponse,
)
async def toggle_product_availability(
    product_id: int,
    body: ToggleAvailabilityRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ToggleAvailabilityResponse:
    """
    Toggle product availability for a branch.

    Kitchen marks a product as temporarily unavailable (e.g., ran out of ingredient).
    This is different from is_active (admin removes product from menu entirely).

    Allowed roles: KITCHEN, MANAGER, ADMIN.
    """
    require_roles(ctx, ["KITCHEN", "MANAGER", "ADMIN"])

    branch_ids = ctx.get("branch_ids", [])
    if not branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No branch access",
        )

    # Find BranchProduct for this product in one of the user's branches
    branch_product = db.scalar(
        select(BranchProduct).where(
            BranchProduct.product_id == product_id,
            BranchProduct.branch_id.in_(branch_ids),
            BranchProduct.is_active.is_(True),
        )
    )

    if not branch_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product {product_id} not found in your branches",
        )

    branch_product.is_available = body.is_available
    safe_commit(db)

    # Invalidate menu cache since product availability affects the public menu
    invalidate_all_menu_caches()

    logger.info(
        "Product availability toggled",
        product_id=product_id,
        branch_id=branch_product.branch_id,
        is_available=body.is_available,
        user_id=int(ctx["sub"]),
    )

    # Publish event in background to avoid blocking the response
    background_tasks.add_task(
        _publish_availability_event,
        tenant_id=branch_product.tenant_id,
        branch_id=branch_product.branch_id,
        product_id=product_id,
        is_available=body.is_available,
        user_id=int(ctx["sub"]),
        user_role=ctx["roles"][0] if ctx.get("roles") else "UNKNOWN",
    )

    return ToggleAvailabilityResponse(
        product_id=product_id,
        branch_id=branch_product.branch_id,
        is_available=body.is_available,
    )
