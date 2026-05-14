"""
Manager Override endpoints.

CLEAN-ARCH: Thin router that delegates to OverrideService.
Handles: item voids, discounts, override audit log.

Requires MANAGER or ADMIN role for all operations.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain.override_service import OverrideService
from shared.utils.schemas import ManagerOverrideOutput


router = APIRouter(prefix="/overrides", tags=["admin-overrides"])


# =============================================================================
# Request Schemas
# =============================================================================


class VoidItemRequest(BaseModel):
    branch_id: int
    round_item_id: int
    reason: str = Field(min_length=1)
    requester_user_id: Optional[int] = None  # Defaults to current user if not provided


class DiscountRequest(BaseModel):
    branch_id: int
    check_id: int
    discount_type: str = Field(pattern="^(PERCENT|AMOUNT)$")
    discount_value: int = Field(ge=1)
    reason: str = Field(min_length=1)


# =============================================================================
# Override Operations
# =============================================================================


@router.post("/void-item", status_code=201, response_model=ManagerOverrideOutput)
def void_item(
    body: VoidItemRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Void a single round item. Requires MANAGER/ADMIN role.

    Records the void as a manager override with full audit trail.
    Adjusts the check total if one exists.
    """
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = OverrideService(db)
    return service.void_round_item(
        tenant_id=ctx.tenant_id,
        branch_id=body.branch_id,
        round_item_id=body.round_item_id,
        reason=body.reason,
        manager_user_id=ctx.user_id,
        requester_user_id=body.requester_user_id or ctx.user_id,
        manager_email=ctx.user_email,
    )


@router.post("/discount", status_code=201, response_model=ManagerOverrideOutput)
def apply_discount(
    body: DiscountRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Apply an ad-hoc discount to a check. Requires MANAGER/ADMIN role.

    Supports percentage (1-100) or fixed amount (in cents) discounts.
    """
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = OverrideService(db)
    return service.apply_discount(
        tenant_id=ctx.tenant_id,
        branch_id=body.branch_id,
        check_id=body.check_id,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        reason=body.reason,
        manager_user_id=ctx.user_id,
        manager_email=ctx.user_email,
    )


@router.get("", response_model=list[ManagerOverrideOutput])
def list_overrides(
    branch_id: int | None = None,
    override_date: date | None = Query(default=None, alias="date"),
    override_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List manager overrides for audit. Requires MANAGER/ADMIN role.

    Filterable by branch, date, and override type.
    """
    ctx = PermissionContext(user)
    ctx.require_management()
    if branch_id:
        ctx.require_branch_access(branch_id)

    service = OverrideService(db)
    return service.list_overrides(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        override_date=override_date,
        override_type=override_type,
        limit=limit,
        offset=offset,
    )
