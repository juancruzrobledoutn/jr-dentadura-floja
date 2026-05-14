"""
Diner — registration feature router.

Endpoints:
    POST   /register
    GET    /session/{session_id}/diners

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.models import Diner, TableSession
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter
from shared.utils.schemas import (
    DinerOutput,
    RegisterDinerRequest,
)


router = APIRouter(tags=["diner"])


@router.post("/register", response_model=DinerOutput)
@limiter.limit("20/minute")
def register_diner(
    request: Request,
    body: RegisterDinerRequest,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> DinerOutput:
    """
    Register a diner at a table session.

    Creates a persistent Diner entity that can be linked to orders and payments.
    If a diner with the same local_id already exists for this session, returns the existing diner.

    Requires X-Table-Token header with valid table token.
    """
    session_id = table_ctx["session_id"]
    branch_id = table_ctx["branch_id"]
    tenant_id = table_ctx["tenant_id"]

    # Verify session exists and is open
    session = db.scalar(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status.in_(["OPEN", "PAYING"]),
        )
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not active or does not exist",
        )

    # Check if diner with same local_id already exists (idempotency)
    if body.local_id:
        existing_diner = db.scalar(
            select(Diner).where(
                Diner.session_id == session_id,
                Diner.local_id == body.local_id,
            )
        )
        if existing_diner:
            # FASE 1: Update device_id if provided and not already set
            # HIGH-DINER-03 FIX: Added error handling for commit
            if body.device_id and not existing_diner.device_id:
                existing_diner.device_id = body.device_id
                existing_diner.device_fingerprint = body.device_fingerprint
                try:
                    db.commit()
                    db.refresh(existing_diner)
                except Exception as e:
                    db.rollback()
                    logger.error("Failed to update device_id", error=str(e))
                    # Continue anyway - diner exists, just device_id update failed
            return DinerOutput(
                id=existing_diner.id,
                session_id=existing_diner.session_id,
                name=existing_diner.name,
                color=existing_diner.color,
                local_id=existing_diner.local_id,
                joined_at=existing_diner.joined_at,
                device_id=existing_diner.device_id,
            )

    # Create new diner
    # FASE 1: Include device tracking fields for cross-session recognition
    new_diner = Diner(
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        name=body.name,
        color=body.color,
        local_id=body.local_id,
        device_id=body.device_id,
        device_fingerprint=body.device_fingerprint,
    )
    db.add(new_diner)

    # AUDIT FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
        db.refresh(new_diner)
    except Exception as e:
        db.rollback()
        logger.error("Failed to register diner", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register diner - please try again",
        )

    return DinerOutput(
        id=new_diner.id,
        session_id=new_diner.session_id,
        name=new_diner.name,
        color=new_diner.color,
        local_id=new_diner.local_id,
        joined_at=new_diner.joined_at,
        device_id=new_diner.device_id,
    )


@router.get("/session/{session_id}/diners", response_model=list[DinerOutput])
def get_session_diners(
    session_id: int,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> list[DinerOutput]:
    """
    Get all diners for a session.

    Returns the list of registered diners with their backend IDs.
    """
    # Verify session matches token
    if table_ctx["session_id"] != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not match token",
        )

    diners = db.execute(
        select(Diner)
        .where(Diner.session_id == session_id)
        .order_by(Diner.joined_at)
    ).scalars().all()

    return [
        DinerOutput(
            id=diner.id,
            session_id=diner.session_id,
            name=diner.name,
            color=diner.color,
            local_id=diner.local_id,
            joined_at=diner.joined_at,
            device_id=diner.device_id,
        )
        for diner in diners
    ]


__all__ = ["router"]
