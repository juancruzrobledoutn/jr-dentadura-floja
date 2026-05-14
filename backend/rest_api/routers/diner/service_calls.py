"""
Diner — service call feature router.

Endpoints:
    POST   /service-call

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.models import ServiceCall, Table, TableSession
from rest_api.routers.diner._event_helpers import (
    _bg_publish_service_call_event,
)
from rest_api.services.events.outbox_service import (
    write_service_call_outbox_event,
)
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import SERVICE_CALL_CREATED
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter
from shared.utils.schemas import CreateServiceCallRequest, ServiceCallOutput


router = APIRouter(tags=["diner"])


@router.post("/service-call", response_model=ServiceCallOutput)
@limiter.limit("10/minute")
def create_service_call(
    request: Request,
    body: CreateServiceCallRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> ServiceCallOutput:
    """
    Create a service call (call waiter or request payment help).

    Publishes a SERVICE_CALL_CREATED event for waiters in background.
    """
    session_id = table_ctx["session_id"]
    table_id = table_ctx["table_id"]
    branch_id = table_ctx["branch_id"]
    tenant_id = table_ctx["tenant_id"]

    # Verify session is active
    session = db.scalar(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status.in_(["OPEN", "PAYING"]),
        )
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not active",
        )

    # SECTOR-DISPATCH FIX: Get table's sector_id
    table = db.scalar(select(Table).where(Table.id == table_id))
    sector_id = table.sector_id if table else None

    # HIGH-04 FIX: Check for existing open call (idempotency)
    existing_call = db.scalar(
        select(ServiceCall).where(
            ServiceCall.table_session_id == session_id,
            ServiceCall.type == body.type,
            ServiceCall.status == "OPEN",
        )
    )

    if existing_call:
        # QA-FIX: Still publish event for existing call (reminder notification)
        # This ensures waiter gets sound/notification even for repeated calls
        # without creating duplicate records in the database
        background_tasks.add_task(
            _bg_publish_service_call_event,
            event_type=SERVICE_CALL_CREATED,
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_id=table_id,
            session_id=session_id,
            call_id=existing_call.id,
            call_type=body.type,
            actor_user_id=None,
            actor_role="DINER",
            sector_id=sector_id,
        )
        logger.info(
            "Service call reminder sent (existing call)",
            call_id=existing_call.id,
            session_id=session_id,
        )
        return ServiceCallOutput(
            id=existing_call.id,
            type=existing_call.type,
            status=existing_call.status,
            created_at=existing_call.created_at,
            acked_by_user_id=existing_call.acked_by_user_id,
            table_id=table_id,
            table_code=table.code if table else None,
            session_id=session_id,
        )

    # Create new service call
    service_call = ServiceCall(
        tenant_id=tenant_id,
        branch_id=branch_id,
        table_session_id=session_id,
        type=body.type,
        status="OPEN",
    )
    db.add(service_call)
    db.flush()  # Get ID before writing outbox event

    # OUTBOX-PATTERN: Write event atomically with business data (guaranteed delivery)
    write_service_call_outbox_event(
        db=db,
        tenant_id=tenant_id,
        event_type=SERVICE_CALL_CREATED,
        call_id=service_call.id,
        branch_id=branch_id,
        session_id=session_id,
        table_id=table_id,
        call_type=body.type,
        sector_id=sector_id,
        actor_role="DINER",
    )

    # AUDIT FIX: Wrap commit in try-except
    try:
        db.commit()
        db.refresh(service_call)
    except Exception as e:
        db.rollback()
        logger.error("Failed to create service call", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create service call - please try again",
        )

    # Note: Event publishing is now handled by outbox processor (guaranteed delivery)

    return ServiceCallOutput(
        id=service_call.id,
        type=service_call.type,
        status=service_call.status,
        created_at=service_call.created_at,
        acked_by_user_id=service_call.acked_by_user_id,
        table_id=table_id,
        table_code=table.code if table else None,
        session_id=session_id,
    )


__all__ = ["router"]
