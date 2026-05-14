"""
Diner — billing feature router.

Endpoints:
    GET    /session/{session_id}/total
    GET    /check

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from rest_api.services.domain import BillingService
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.utils.exceptions import CheckNotFoundError
from shared.utils.schemas import CheckDetailOutput


router = APIRouter(tags=["diner"])


@router.get("/session/{session_id}/total")
def get_session_total(
    session_id: int,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> dict[str, Any]:
    """
    Get the total amount for a session.

    REF-01: Uses BillingService for thin controller pattern.
    Calculates total from all rounds (excluding CANCELED).
    """
    if table_ctx["session_id"] != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not match token",
        )

    service = BillingService(db)
    return service.get_session_total(session_id)


@router.get("/check", response_model=CheckDetailOutput)
def get_diner_check(
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> CheckDetailOutput:
    """
    Get the current check detail for the diner's session.

    REF-01: Uses BillingService for thin controller pattern.
    Returns full breakdown of items and payments.
    Used by diner to see their bill before/during payment.
    """
    session_id = table_ctx["session_id"]
    table_id = table_ctx["table_id"]

    service = BillingService(db)

    try:
        return service.get_check_detail(session_id=session_id, table_id=table_id)
    except CheckNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No check found for this session. Request check first.",
        )


__all__ = ["router"]
