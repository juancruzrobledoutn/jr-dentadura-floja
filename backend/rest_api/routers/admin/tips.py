"""
Tip management endpoints.

Provides tip recording, distribution, reporting, and pool configuration.
"""

from datetime import date
from pydantic import BaseModel
from typing import Optional

from fastapi import APIRouter, status

from rest_api.routers.admin._base import (
    Depends, Session,
    get_db, current_user,
    get_user_id, get_user_email,
    require_admin_or_manager,
    validate_branch_access,
)
from rest_api.services.domain.tip_service import TipService
from shared.config.logging import rest_api_logger as logger
from shared.utils.schemas import (
    TipRecordOutput,
    TipListItemOutput,
    TipDistributionOutput,
    TipReportOutput,
    TipPoolOutput,
)
# S4.2: NotFoundError/ValidationError raised by service layer are converted to
# HTTP 404/400 by global exception handlers (no router-side try/except needed).


router = APIRouter(tags=["admin-tips"])


# -------------------------------------------------------------------------
# Schemas
# -------------------------------------------------------------------------

class RecordTipRequest(BaseModel):
    branch_id: int
    amount_cents: int
    payment_method: str  # CASH, CARD, MERCADOPAGO
    waiter_id: Optional[int] = None
    table_session_id: Optional[int] = None
    check_id: Optional[int] = None


class DistributeTipRequest(BaseModel):
    tip_id: int
    pool_id: int


class TipPoolCreate(BaseModel):
    branch_id: int
    name: str
    waiter_percent: int
    kitchen_percent: int
    other_percent: int


class TipPoolUpdate(BaseModel):
    name: Optional[str] = None
    waiter_percent: Optional[int] = None
    kitchen_percent: Optional[int] = None
    other_percent: Optional[int] = None


# -------------------------------------------------------------------------
# Tip endpoints
# -------------------------------------------------------------------------

@router.post("/tips", status_code=status.HTTP_201_CREATED, response_model=TipRecordOutput)
def record_tip(
    body: RecordTipRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Record a new tip."""
    tenant_id = user["tenant_id"]
    validate_branch_access(user, body.branch_id)

    service = TipService(db)

    # S4.2: ValidationError -> 400 handled by global handler.
    tip = service.record_tip(
        tenant_id=tenant_id,
        branch_id=body.branch_id,
        amount_cents=body.amount_cents,
        payment_method=body.payment_method,
        waiter_id=body.waiter_id,
        table_session_id=body.table_session_id,
        check_id=body.check_id,
    )

    return {
        "id": tip.id,
        "amount_cents": tip.amount_cents,
        "payment_method": tip.payment_method,
        "waiter_id": tip.waiter_id,
        "created_at": tip.created_at.isoformat() if tip.created_at else None,
    }


@router.post("/tips/distribute", response_model=list[TipDistributionOutput])
def distribute_tip(
    body: DistributeTipRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Distribute a tip according to a pool configuration."""
    tenant_id = user["tenant_id"]

    service = TipService(db)

    # S4.2: ValidationError -> 400, NotFoundError -> 404 handled by global handlers.
    distributions = service.distribute_tip(
        tip_id=body.tip_id,
        pool_id=body.pool_id,
        tenant_id=tenant_id,
    )

    return [
        {
            "id": d.id,
            "role": d.role,
            "amount_cents": d.amount_cents,
            "user_id": d.user_id,
        }
        for d in distributions
    ]


@router.get("/tips", response_model=list[TipListItemOutput])
def list_tips(
    branch_id: Optional[int] = None,
    waiter_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """List tips with optional filters."""
    tenant_id = user["tenant_id"]

    if branch_id:
        validate_branch_access(user, branch_id)

    service = TipService(db)
    tips = service.list_tips(
        tenant_id=tenant_id,
        branch_id=branch_id,
        waiter_id=waiter_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )

    return [
        {
            "id": t.id,
            "branch_id": t.branch_id,
            "amount_cents": t.amount_cents,
            "payment_method": t.payment_method,
            "waiter_id": t.waiter_id,
            "table_session_id": t.table_session_id,
            "check_id": t.check_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tips
    ]


@router.get("/tips/report", response_model=TipReportOutput)
def get_tip_report(
    branch_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Get aggregated tip report for a branch."""
    tenant_id = user["tenant_id"]
    validate_branch_access(user, branch_id)

    service = TipService(db)
    return service.get_branch_tip_report(
        branch_id=branch_id,
        tenant_id=tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


# -------------------------------------------------------------------------
# Tip Pool CRUD
# -------------------------------------------------------------------------

@router.get("/tip-pools", response_model=list[TipPoolOutput])
def list_tip_pools(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """List tip pool configurations."""
    tenant_id = user["tenant_id"]

    if branch_id:
        validate_branch_access(user, branch_id)

    service = TipService(db)
    pools = service.list_pools(tenant_id=tenant_id, branch_id=branch_id)

    return [
        {
            "id": p.id,
            "branch_id": p.branch_id,
            "name": p.name,
            "waiter_percent": p.waiter_percent,
            "kitchen_percent": p.kitchen_percent,
            "other_percent": p.other_percent,
            "is_active": p.is_active,
        }
        for p in pools
    ]


@router.post("/tip-pools", status_code=status.HTTP_201_CREATED, response_model=TipPoolOutput)
def create_tip_pool(
    body: TipPoolCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Create a tip pool configuration."""
    tenant_id = user["tenant_id"]
    validate_branch_access(user, body.branch_id)

    service = TipService(db)

    # S4.2: ValidationError -> 400 handled by global handler.
    pool = service.create_pool(
        tenant_id=tenant_id,
        branch_id=body.branch_id,
        name=body.name,
        waiter_percent=body.waiter_percent,
        kitchen_percent=body.kitchen_percent,
        other_percent=body.other_percent,
    )

    return {
        "id": pool.id,
        "branch_id": pool.branch_id,
        "name": pool.name,
        "waiter_percent": pool.waiter_percent,
        "kitchen_percent": pool.kitchen_percent,
        "other_percent": pool.other_percent,
    }


@router.put("/tip-pools/{pool_id}", response_model=TipPoolOutput)
def update_tip_pool(
    pool_id: int,
    body: TipPoolUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Update a tip pool configuration."""
    tenant_id = user["tenant_id"]

    service = TipService(db)

    # S4.2: ValidationError -> 400, NotFoundError -> 404 handled by global handlers.
    pool = service.update_pool(
        pool_id=pool_id,
        tenant_id=tenant_id,
        name=body.name,
        waiter_percent=body.waiter_percent,
        kitchen_percent=body.kitchen_percent,
        other_percent=body.other_percent,
    )

    return {
        "id": pool.id,
        "branch_id": pool.branch_id,
        "name": pool.name,
        "waiter_percent": pool.waiter_percent,
        "kitchen_percent": pool.kitchen_percent,
        "other_percent": pool.other_percent,
    }


@router.delete("/tip-pools/{pool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tip_pool(
    pool_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Soft delete a tip pool."""
    tenant_id = user["tenant_id"]
    user_id = get_user_id(user)
    email = get_user_email(user)

    service = TipService(db)

    # S4.2: NotFoundError -> 404 handled by global handler.
    service.delete_pool(
        pool_id=pool_id,
        tenant_id=tenant_id,
        user_id=user_id,
        user_email=email,
    )
