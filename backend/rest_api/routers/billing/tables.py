"""
Billing — table clearing endpoint.

C8 PASS 6 REFACTOR (billing): Split off from the monolithic `routes.py`. URLs,
status codes, detail strings and the sequence of operations are byte-identical
to the previous implementation.

Endpoints:
    POST   /api/billing/tables/{table_id}/clear  [CRITICO]  clear_table

GOVERNANCE NOTE — CRITICO:
    clear_table:
        1. Validates the table exists and the caller has branch access
        2. If no active session → marks table FREE and commits (early return)
        3. Else: requires the latest Check to be PAID, closes session, sets
           table FREE, writes TABLE_CLEARED to the outbox atomically, commits
        4. Writes a tamper-evident audit log entry (fire-and-forget)

    No logic has been changed. The audit-log block now calls `safe_audit_log`,
    which preserves the previous fire-and-forget semantics.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.config.logging import billing_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import TABLE_CLEARED
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import ClearTableResponse

from rest_api.models import Check, Table, TableSession
from rest_api.routers.billing._audit_helpers import safe_audit_log
from rest_api.services.events.outbox_service import write_billing_outbox_event

router = APIRouter()


@router.post("/tables/{table_id}/clear", response_model=ClearTableResponse)
async def clear_table(
    table_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ClearTableResponse:
    """
    Clear/liberate a table after payment is complete.

    Only works if the check is fully paid.
    Closes the session and marks the table as FREE.

    Requires WAITER, MANAGER, or ADMIN role.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    # Find the table
    table = db.scalar(
        select(Table).where(Table.id == table_id)
    )

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table {table_id} not found",
        )

    # Verify branch access
    branch_ids = ctx.get("branch_ids", [])
    if table.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    # Find active session
    session = db.scalar(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status.in_(["OPEN", "PAYING"]),
        )
    )

    if not session:
        # Table is already free
        table.status = "FREE"
        # QA-BACK-CRIT-01 FIX: Wrap commit in try-except
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Failed to commit table status update", table_id=table_id, error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update table status",
            )
        return ClearTableResponse(table_id=table_id, status="FREE")

    # Check if there's a check and if it's paid
    check = db.scalar(
        select(Check).where(
            Check.table_session_id == session.id,
        ).order_by(Check.created_at.desc())
    )

    if check and check.status != "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot clear table: check is not fully paid",
        )

    # Close session and free table
    session.status = "CLOSED"
    session.closed_at = datetime.now(timezone.utc)
    table.status = "FREE"

    # OUTBOX-PATTERN: Write TABLE_CLEARED event atomically with business data
    # Guarantees delivery even if Redis is temporarily down
    write_billing_outbox_event(
        db=db,
        tenant_id=table.tenant_id,
        event_type=TABLE_CLEARED,
        check_id=check.id if check else 0,
        branch_id=table.branch_id,
        session_id=session.id,
        table_id=table_id,
        extra_data={
            "table_code": table.code,
            "sector_id": table.sector_id,
        },
        actor_user_id=int(ctx["sub"]),
        actor_role="WAITER",
    )

    # AUDIT FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to commit table clear", table_id=table_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear table - please try again",
        )

    # Note: Event publishing is now handled by outbox processor (guaranteed delivery)

    # SEC-AUDIT-03: Log table clearing to tamper-evident audit chain
    await safe_audit_log(
        event_type="TABLE",
        action="TABLE_CLEARED",
        user_id=int(ctx["sub"]),
        user_email=ctx.get("email"),
        resource_type="table_session",
        resource_id=session.id,
        data={
            "table_id": table_id,
            "table_code": table.code,
            "session_id": session.id,
            "check_id": check.id if check else None,
            "check_total_cents": check.total_cents if check else None,
            "branch_id": table.branch_id,
        },
        failure_message="Failed to write audit log for table clear",
        failure_extra={"table_id": table_id},
    )

    return ClearTableResponse(table_id=table_id, status="FREE")


__all__ = ["router"]
