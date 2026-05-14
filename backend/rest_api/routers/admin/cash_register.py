"""
Cash register management endpoints.

Provides cash session lifecycle: open, record movements, close with reconciliation.
"""

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
from rest_api.services.domain.cash_service import CashService
from shared.config.logging import rest_api_logger as logger
from shared.utils.schemas import (
    CashSessionOpenOutput,
    CashMovementOutput,
    CashSessionCloseOutput,
    CashCurrentSessionOutput,
    CashSessionHistoryItem,
)
# S4.2: NotFoundError/ValidationError are raised by the service layer and
# converted to HTTP 404/400 by global exception handlers (no router-side try/except).


router = APIRouter(tags=["admin-cash"])


# -------------------------------------------------------------------------
# Schemas
# -------------------------------------------------------------------------

class OpenSessionRequest(BaseModel):
    branch_id: int
    opening_amount_cents: int
    register_name: str = "Caja Principal"


class RecordMovementRequest(BaseModel):
    session_id: int
    movement_type: str  # SALE, REFUND, EXPENSE, DEPOSIT, WITHDRAWAL, TIP_IN
    amount_cents: int
    payment_method: str  # CASH, CARD, TRANSFER, MERCADOPAGO
    description: Optional[str] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None


class CloseSessionRequest(BaseModel):
    session_id: int
    actual_amount_cents: int
    notes: Optional[str] = None


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------

@router.post("/cash/open", status_code=status.HTTP_201_CREATED, response_model=CashSessionOpenOutput)
def open_cash_session(
    body: OpenSessionRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Open a new cash session for a branch."""
    tenant_id = user["tenant_id"]
    user_id = get_user_id(user)
    validate_branch_access(user, body.branch_id)

    service = CashService(db)

    # S4.2: ValidationError -> 400, NotFoundError -> 404 handled by global handlers.
    register = service.get_or_create_register(
        tenant_id=tenant_id,
        branch_id=body.branch_id,
        name=body.register_name,
    )
    session = service.open_session(
        register_id=register.id,
        opening_amount_cents=body.opening_amount_cents,
        user_id=user_id,
        tenant_id=tenant_id,
        branch_id=body.branch_id,
    )

    return {
        "id": session.id,
        "cash_register_id": session.cash_register_id,
        "status": session.status,
        "opened_at": session.opened_at.isoformat(),
        "opening_amount_cents": session.opening_amount_cents,
    }


@router.post("/cash/movement", status_code=status.HTTP_201_CREATED, response_model=CashMovementOutput)
def record_cash_movement(
    body: RecordMovementRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Record a cash movement in the current session."""
    tenant_id = user["tenant_id"]
    user_id = get_user_id(user)

    service = CashService(db)

    # S4.2: ValidationError -> 400, NotFoundError -> 404 handled by global handlers.
    movement = service.record_movement(
        session_id=body.session_id,
        movement_type=body.movement_type,
        amount_cents=body.amount_cents,
        payment_method=body.payment_method,
        tenant_id=tenant_id,
        description=body.description,
        user_id=user_id,
        reference_type=body.reference_type,
        reference_id=body.reference_id,
    )

    return {
        "id": movement.id,
        "movement_type": movement.movement_type,
        "amount_cents": movement.amount_cents,
        "payment_method": movement.payment_method,
        "description": movement.description,
        "created_at": movement.created_at.isoformat() if movement.created_at else None,
    }


@router.post("/cash/close", response_model=CashSessionCloseOutput)
def close_cash_session(
    body: CloseSessionRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Close a cash session with actual cash count."""
    tenant_id = user["tenant_id"]
    user_id = get_user_id(user)

    service = CashService(db)

    # S4.2: ValidationError -> 400, NotFoundError -> 404 handled by global handlers.
    session = service.close_session(
        session_id=body.session_id,
        actual_amount_cents=body.actual_amount_cents,
        user_id=user_id,
        tenant_id=tenant_id,
        notes=body.notes,
    )

    return {
        "id": session.id,
        "status": session.status,
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "opening_amount_cents": session.opening_amount_cents,
        "expected_amount_cents": session.expected_amount_cents,
        "actual_amount_cents": session.actual_amount_cents,
        "difference_cents": session.difference_cents,
        "notes": session.notes,
    }


@router.get("/cash/current", response_model=CashCurrentSessionOutput)
def get_current_session(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Get the currently open cash session for a branch."""
    tenant_id = user["tenant_id"]
    validate_branch_access(user, branch_id)

    service = CashService(db)
    session = service.get_current_session(tenant_id=tenant_id, branch_id=branch_id)

    if not session:
        return {"session": None}

    return {
        "session": {
            "id": session.id,
            "cash_register_id": session.cash_register_id,
            "status": session.status,
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
            "opening_amount_cents": session.opening_amount_cents,
            "opened_by_id": session.opened_by_id,
        }
    }


@router.get("/cash/sessions", response_model=list[CashSessionHistoryItem])
def list_cash_sessions(
    branch_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """List cash session history for a branch."""
    tenant_id = user["tenant_id"]
    validate_branch_access(user, branch_id)

    service = CashService(db)
    sessions = service.list_sessions(
        tenant_id=tenant_id,
        branch_id=branch_id,
        limit=limit,
        offset=offset,
    )

    return [
        {
            "id": s.id,
            "status": s.status,
            "opened_at": s.opened_at.isoformat() if s.opened_at else None,
            "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            "opening_amount_cents": s.opening_amount_cents,
            "expected_amount_cents": s.expected_amount_cents,
            "actual_amount_cents": s.actual_amount_cents,
            "difference_cents": s.difference_cents,
        }
        for s in sessions
    ]


@router.get("/cash/sessions/{session_id}/summary")
def get_session_summary(
    session_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
):
    """Get detailed summary for a cash session."""
    tenant_id = user["tenant_id"]

    service = CashService(db)

    # S4.2: NotFoundError -> 404 handled by global handlers.
    return service.get_session_summary(session_id=session_id, tenant_id=tenant_id)
