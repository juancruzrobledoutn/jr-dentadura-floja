"""
Billing — check (bill) lifecycle endpoints.

C8 PASS 6 REFACTOR (billing): Split off from the monolithic `routes.py`. URLs,
status codes, detail strings and the sequence of operations are byte-identical
to the previous implementation.

Endpoints:
    POST   /api/billing/check/request           [CRITICO]   request_check
    GET    /api/billing/check/{check_id}        [NORMAL]    get_check
    GET    /api/billing/check/{check_id}/balances [NORMAL]  get_check_balances

GOVERNANCE NOTE:
    `request_check` is CRITICO — it creates the Check record, computes the
    total from rounds, writes to the outbox atomically with business data,
    and commits. NO LOGIC HAS BEEN CHANGED. Only the import block and the
    file location are different.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from shared.config.logging import billing_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import CHECK_REQUESTED
from shared.security.auth import (
    current_table_context,
    current_user_context,
    require_roles,
)
from shared.security.rate_limit import limiter
from shared.utils.schemas import (
    BillingCheckGetOutput,
    RequestCheckResponse,
)

from rest_api.models import (
    Check,
    Payment,
    Round,
    RoundItem,
    Table,
    TableSession,
)
from rest_api.services.events.outbox_service import write_billing_outbox_event
from rest_api.services.payments.allocation import (
    create_charges_for_check,
    get_all_diner_balances,
)

router = APIRouter()


# CRIT-05 FIX: Rate limiting on billing endpoints
@router.post("/check/request", response_model=RequestCheckResponse)
@limiter.limit("10/minute")
async def request_check(
    request: Request,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> RequestCheckResponse:
    """
    Request the check/bill for a table session.

    Calculates the total from all rounds and creates a Check record.
    Changes table status to PAYING.
    Publishes CHECK_REQUESTED event for waiters.

    Called by diner using table token.
    """
    session_id = table_ctx["session_id"]
    table_id = table_ctx["table_id"]
    branch_id = table_ctx["branch_id"]
    tenant_id = table_ctx["tenant_id"]

    # Verify session is open
    session = db.scalar(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == "OPEN",
        )
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not active",
        )

    # HIGH-04 FIX: Check if there's already a check for this session (idempotency)
    # This prevents duplicate checks when network retries occur
    existing_check = db.scalar(
        select(Check).where(
            Check.table_session_id == session_id,
            Check.status.in_(["OPEN", "REQUESTED", "IN_PAYMENT"]),
        )
    )

    if existing_check:
        # HIGH-04 FIX: Return existing check instead of creating duplicate (idempotent response)
        return RequestCheckResponse(
            check_id=existing_check.id,
            total_cents=existing_check.total_cents,
            paid_cents=existing_check.paid_cents,
            status=existing_check.status,
        )

    # Calculate total from all non-canceled rounds
    total_cents = db.scalar(
        select(func.sum(RoundItem.unit_price_cents * RoundItem.qty))
        .join(Round, RoundItem.round_id == Round.id)
        .where(
            Round.table_session_id == session_id,
            Round.status != "CANCELED",
        )
    ) or 0

    # Create check
    check = Check(
        tenant_id=tenant_id,
        branch_id=branch_id,
        table_session_id=session_id,
        status="REQUESTED",
        total_cents=total_cents,
        paid_cents=0,
    )
    db.add(check)
    db.flush()  # Get check ID before creating charges

    # Phase 3: Create Charge records for each item
    create_charges_for_check(db, check)

    # Update table and session status
    table = db.scalar(select(Table).where(Table.id == table_id))
    if table:
        table.status = "PAYING"

    session.status = "PAYING"

    # OUTBOX-PATTERN: Write event atomically with business data
    # The outbox processor will publish to Redis, ensuring guaranteed delivery
    write_billing_outbox_event(
        db=db,
        tenant_id=tenant_id,
        event_type=CHECK_REQUESTED,
        check_id=check.id,
        branch_id=branch_id,
        session_id=session_id,
        table_id=table_id,
        extra_data={"total_cents": total_cents},
        actor_role="DINER",
    )

    # AUDIT FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
        db.refresh(check)
    except Exception as e:
        db.rollback()
        logger.error("Failed to commit check request", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create check - please try again",
        )

    # Note: Event publishing is now handled by outbox processor (guaranteed delivery)

    return RequestCheckResponse(
        check_id=check.id,
        total_cents=check.total_cents,
        paid_cents=check.paid_cents,
        status=check.status,
    )


@router.get("/check/{check_id}", response_model=BillingCheckGetOutput)
def get_check(
    check_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> dict[str, Any]:
    """
    Get details of a check.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    check = db.scalar(
        select(Check).where(Check.id == check_id)
    )

    if not check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check {check_id} not found",
        )

    branch_ids = ctx.get("branch_ids", [])
    if check.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    # Get payments
    payments = db.execute(
        select(Payment).where(Payment.check_id == check_id)
    ).scalars().all()

    return {
        "id": check.id,
        "session_id": check.table_session_id,
        "status": check.status,
        "total_cents": check.total_cents,
        "paid_cents": check.paid_cents,
        "remaining_cents": max(0, check.total_cents - check.paid_cents),
        "created_at": check.created_at.isoformat(),
        "payments": [
            {
                "id": p.id,
                "provider": p.provider,
                "status": p.status,
                "amount_cents": p.amount_cents,
                "created_at": p.created_at.isoformat(),
            }
            for p in payments
        ],
    }


# =============================================================================
# Diner Balances (Phase 3)
# =============================================================================


@router.get("/check/{check_id}/balances")
def get_check_balances(
    check_id: int,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> list[dict]:
    """
    Get the balance breakdown by diner for a check.

    Phase 3: Shows how much each diner owes and has paid.
    Used by frontend to display split payment breakdown.
    """
    session_id = table_ctx["session_id"]

    # Verify check belongs to this session
    check = db.scalar(
        select(Check).where(
            Check.id == check_id,
            Check.table_session_id == session_id,
        )
    )

    if not check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Check not found for this session",
        )

    return get_all_diner_balances(db, check_id)


__all__ = ["router"]
