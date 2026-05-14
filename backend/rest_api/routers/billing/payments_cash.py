"""
Billing — cash payment endpoint.

C8 PASS 6 REFACTOR (billing): Split off from the monolithic `routes.py`. URLs,
status codes, detail strings and the sequence of operations are byte-identical
to the previous implementation.

Endpoints:
    POST   /api/billing/cash/pay                [CRITICO]   record_cash_payment

GOVERNANCE NOTE — CRITICO:
    This endpoint:
        1. Acquires a row-level lock on Check (SELECT FOR UPDATE)
        2. Validates branch access, paid status, and amount bounds
        3. Creates a Payment with provider=CASH, status=APPROVED
        4. Allocates the payment FIFO against open Charges
        5. Updates Check.paid_cents / status
        6. Writes PAYMENT_APPROVED (and possibly CHECK_PAID) to the outbox
           atomically with the business data
        7. Commits, then writes a tamper-evident audit log entry

    The order of operations is load-bearing. No logic has been changed: only
    the file location and import block differ. The audit-log block now calls
    `safe_audit_log` (`_audit_helpers.py`), which is a byte-for-byte
    encapsulation of the previous inline try/except/warning pattern — it
    preserves the fire-and-forget semantics (audit failure does NOT roll back
    the payment).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.config.logging import billing_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    CHECK_PAID,
    PAYMENT_APPROVED,
)
from shared.security.auth import current_user_context, require_roles
from shared.security.rate_limit import limiter
from shared.utils.schemas import CashPaymentRequest, PaymentResponse

from rest_api.models import Check, Payment, TableSession
from rest_api.routers.billing._audit_helpers import safe_audit_log
from rest_api.services.events.outbox_service import write_billing_outbox_event
from rest_api.services.payments.allocation import allocate_payment_fifo

router = APIRouter()


@router.post("/cash/pay", response_model=PaymentResponse)
@limiter.limit("20/minute")
async def record_cash_payment(
    request: Request,
    body: CashPaymentRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> PaymentResponse:
    """
    Record a cash payment for a check.

    Called by waiter after receiving cash from customer.
    If the payment completes the check, marks it as PAID.

    Requires WAITER, MANAGER, or ADMIN role.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    # AUDIT FIX: Use SELECT FOR UPDATE to prevent race condition
    # This locks the check row until the transaction completes
    check = db.scalar(
        select(Check).where(Check.id == body.check_id).with_for_update()
    )

    if not check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check {body.check_id} not found",
        )

    # Verify branch access
    branch_ids = ctx.get("branch_ids", [])
    if check.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    if check.status == "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Check is already paid",
        )

    # HIGH-VALID-02 FIX: Validate payment amount is positive
    if body.amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be positive",
        )

    # AUDIT FIX: Validate payment amount doesn't exceed remaining
    remaining = check.total_cents - check.paid_cents
    if body.amount_cents > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount ({body.amount_cents}) exceeds remaining ({remaining})",
        )

    # Create payment record
    payment = Payment(
        tenant_id=check.tenant_id,
        branch_id=check.branch_id,
        check_id=check.id,
        provider="CASH",
        status="APPROVED",
        amount_cents=body.amount_cents,
        payer_diner_id=body.diner_id,  # Track which diner made the payment
    )
    db.add(payment)
    db.flush()  # Get payment ID before allocating

    # Phase 3: Allocate payment to charges using FIFO
    allocate_payment_fifo(db, payment)

    # Update check
    check.paid_cents += body.amount_cents
    check.status = "IN_PAYMENT"

    # Check if fully paid
    if check.paid_cents >= check.total_cents:
        check.status = "PAID"

    # Get session for event (before commit for table_id)
    session = db.scalar(
        select(TableSession).where(TableSession.id == check.table_session_id)
    )
    table_id = session.table_id if session else None

    # OUTBOX-PATTERN: Write events atomically with business data
    # Payment approved event
    write_billing_outbox_event(
        db=db,
        tenant_id=check.tenant_id,
        event_type=PAYMENT_APPROVED,
        check_id=check.id,
        branch_id=check.branch_id,
        session_id=check.table_session_id,
        table_id=table_id,
        extra_data={
            "payment_id": payment.id,
            "amount_cents": body.amount_cents,
            "provider": "CASH",
        },
        actor_user_id=int(ctx["sub"]),
        actor_role="WAITER",
    )

    # If check is fully paid, also queue CHECK_PAID event
    if check.status == "PAID":
        write_billing_outbox_event(
            db=db,
            tenant_id=check.tenant_id,
            event_type=CHECK_PAID,
            check_id=check.id,
            branch_id=check.branch_id,
            session_id=check.table_session_id,
            table_id=table_id,
            extra_data={"total_cents": check.total_cents},
            actor_user_id=int(ctx["sub"]),
            actor_role="WAITER",
        )

    # AUDIT FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
        db.refresh(payment)
        db.refresh(check)
    except Exception as e:
        db.rollback()
        logger.error("Failed to commit cash payment", check_id=check.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record payment - please try again",
        )

    # SEC-AUDIT-03: Log payment to tamper-evident audit chain
    await safe_audit_log(
        event_type="PAYMENT",
        action="CASH_PAYMENT_APPROVED",
        user_id=int(ctx["sub"]),
        user_email=ctx.get("email"),
        ip_address=request.client.host if request.client else None,
        resource_type="payment",
        resource_id=payment.id,
        data={
            "check_id": check.id,
            "amount_cents": body.amount_cents,
            "provider": "CASH",
            "check_status": check.status,
            "check_paid_cents": check.paid_cents,
            "check_total_cents": check.total_cents,
            "diner_id": body.diner_id,
        },
        failure_message="Failed to write audit log for payment",
        failure_extra={"payment_id": payment.id},
    )

    # Note: Event publishing is now handled by outbox processor (guaranteed delivery)

    return PaymentResponse(
        payment_id=payment.id,
        check_id=check.id,
        amount_cents=payment.amount_cents,
        provider=payment.provider,
        status=payment.status,
        check_status=check.status,
        check_paid_cents=check.paid_cents,
        check_total_cents=check.total_cents,
    )


__all__ = ["router"]
