"""
Billing — Mercado Pago integration endpoints.

C8 PASS 6 REFACTOR (billing): Split off from the monolithic `routes.py`. URLs,
status codes, detail strings and the sequence of operations are byte-identical
to the previous implementation.

Endpoints:
    POST   /api/billing/mercadopago/preference  [CRITICO]  create_mercadopago_preference
    POST   /api/billing/mercadopago/webhook     [CRITICO]  mercadopago_webhook

GOVERNANCE NOTE — CRITICO:
    Both endpoints touch real payment flows:
        - The preference endpoint creates a pending Payment record after the MP
          gateway returns a redirect URL.
        - The webhook endpoint receives async notifications from MP, verifies
          signature, fetches payment via circuit-breaker-protected gateway,
          acquires row-level locks on Check + Payment, allocates FIFO, updates
          totals, writes PAYMENT_APPROVED / CHECK_PAID / PAYMENT_REJECTED to
          the outbox atomically, and commits.

    The order of operations is load-bearing. NO LOGIC HAS BEEN CHANGED — only
    file location, import block, and the audit-log fire-and-forget block which
    now delegates to `safe_audit_log` (same try/except pattern).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.config.logging import billing_logger as logger
from shared.config.settings import settings
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    CHECK_PAID,
    PAYMENT_APPROVED,
    PAYMENT_REJECTED,
)
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter
from shared.utils.schemas import (
    MercadoPagoPreferenceRequest,
    MercadoPagoPreferenceResponse,
)

from rest_api.models import Check, Payment, Table, TableSession
from rest_api.routers.billing._audit_helpers import safe_audit_log
from rest_api.routers.billing._deps import get_payment_gateway
from rest_api.services.events.outbox_service import write_billing_outbox_event
from rest_api.services.payments.allocation import allocate_payment_fifo
from rest_api.services.payments.circuit_breaker import (
    CircuitBreakerError,
    mercadopago_breaker,
)
from rest_api.services.payments.gateway import PaymentPreference
from rest_api.services.payments.webhook_retry import webhook_retry_queue

router = APIRouter()


@router.post("/mercadopago/preference", response_model=MercadoPagoPreferenceResponse)
@limiter.limit("5/minute")
async def create_mercadopago_preference(
    request: Request,
    body: MercadoPagoPreferenceRequest,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> MercadoPagoPreferenceResponse:
    """
    Create a Mercado Pago preference for a check.

    Returns the checkout URL where the diner will be redirected to pay.
    Called by diner when they choose to pay with Mercado Pago.
    """
    if not settings.mercadopago_access_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercado Pago is not configured",
        )

    session_id = table_ctx["session_id"]

    # Verify check belongs to this session
    check = db.scalar(
        select(Check).where(
            Check.id == body.check_id,
            Check.table_session_id == session_id,
        )
    )

    if not check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Check not found for this session",
        )

    if check.status == "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Check is already paid",
        )

    # Calculate remaining amount
    remaining_cents = max(0, check.total_cents - check.paid_cents)
    if remaining_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to pay",
        )

    # HIGH-BILLING-01 FIX: Get table for description with proper null checks
    session = db.scalar(
        select(TableSession).where(TableSession.id == session_id)
    )
    # HIGH-BILLING-01 FIX: Validate session exists before accessing table_id
    table = None
    if session and session.table_id:
        table = db.scalar(
            select(Table).where(Table.id == session.table_id)
        )

    table_code = table.code if table else f"Mesa #{session_id}"

    # Build preference using gateway abstraction
    gateway = get_payment_gateway()
    preference = PaymentPreference(
        title=f"Cuenta {table_code}",
        amount_cents=remaining_cents,
        currency="ARS",
        external_reference=f"check_{check.id}",
        back_urls={
            "success": f"{settings.base_url}/payment/success?check_id={check.id}",
            "failure": f"{settings.base_url}/payment/failure?check_id={check.id}",
            "pending": f"{settings.base_url}/payment/pending?check_id={check.id}",
        },
        notification_url=settings.mercadopago_notification_url or f"{settings.base_url}/api/billing/mercadopago/webhook",
    )

    # REC-01 FIX: Use circuit breaker to prevent cascading failures.
    # CircuitBreakerError is an ExternalServiceError subclass — the global
    # exception handler returns 503 with Retry-After automatically.
    async with mercadopago_breaker.call():
        result = await gateway.create_preference(preference)

        if not result.success:
            logger.error("Payment preference creation failed", error=result.error_message)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to create payment preference",
            )

    # Create pending payment record
    payment = Payment(
        tenant_id=check.tenant_id,
        branch_id=check.branch_id,
        check_id=check.id,
        provider="MERCADO_PAGO",
        status="PENDING",
        amount_cents=remaining_cents,
        external_id=result.external_id,
    )
    db.add(payment)

    # AUDIT FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to create MP payment record", check_id=check.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create payment record - please try again",
        )

    return MercadoPagoPreferenceResponse(
        preference_id=result.external_id or "",
        init_point=result.redirect_url or "",
        sandbox_init_point=result.redirect_url or "",
    )


@router.post("/mercadopago/webhook")
async def mercadopago_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_signature: str | None = Header(None),
    x_request_id: str | None = Header(None),
) -> dict[str, str]:
    """
    Webhook endpoint for Mercado Pago notifications.

    Called by Mercado Pago when a payment status changes.
    Verifies signature via PaymentGateway, updates payment and check status.
    """
    gateway = get_payment_gateway()

    # Get webhook data
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # BACK-CRIT-05 FIX: Verify webhook signature via gateway abstraction
    data_id = str(body.get("data", {}).get("id", ""))
    if not settings.mercadopago_webhook_secret:
        # If secret not configured, skip verification (development mode)
        logger.warn("MP webhook signature verification skipped - no secret configured")
    elif not gateway.verify_webhook_signature(x_signature or "", x_request_id or "", data_id):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Log webhook for debugging
    logger.info("Mercado Pago webhook received", webhook_type=body.get("type"), data_id=data_id)

    # Handle only payment notifications
    if body.get("type") != "payment":
        return {"status": "ignored", "reason": "not a payment notification"}

    payment_id = body.get("data", {}).get("id")
    if not payment_id:
        return {"status": "ignored", "reason": "no payment id"}

    # Fetch payment details via gateway with circuit breaker
    if not settings.mercadopago_access_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercado Pago is not configured",
        )

    # REC-01 FIX: Use circuit breaker for fetching payment details via gateway
    # REC-02 FIX: Queue for retry on failure
    try:
        async with mercadopago_breaker.call():
            verify_result = await gateway.verify_payment(str(payment_id))

            if verify_result.status == "unknown" and verify_result.error_message:
                logger.error("Failed to fetch MP payment", payment_id=payment_id, error=verify_result.error_message)
                # REC-02 FIX: Queue for retry instead of failing immediately
                await webhook_retry_queue.enqueue(
                    webhook_type="mercadopago",
                    payload=body,
                    error=f"Failed to fetch payment: {verify_result.error_message}",
                )
                return {"status": "queued_for_retry", "reason": "failed to fetch payment details"}

    except CircuitBreakerError as e:
        logger.warning("MP webhook: circuit breaker open, queueing for retry", retry_after=e.retry_after)
        # REC-02 FIX: Queue webhook for retry when circuit is open
        await webhook_retry_queue.enqueue(
            webhook_type="mercadopago",
            payload=body,
            error=f"Circuit breaker open: {e}",
        )
        return {"status": "queued_for_retry", "reason": "service temporarily unavailable"}
    except Exception as e:
        logger.error("MP webhook: unexpected error fetching payment", error=str(e))
        # REC-02 FIX: Queue for retry on any failure
        await webhook_retry_queue.enqueue(
            webhook_type="mercadopago",
            payload=body,
            error=str(e),
        )
        return {"status": "queued_for_retry", "reason": "unexpected error"}

    # Extract check_id from external_reference returned by gateway
    mp_status = verify_result.status
    external_ref = verify_result.external_reference or ""
    if not external_ref.startswith("check_"):
        return {"status": "ignored", "reason": "unknown external reference"}

    try:
        check_id = int(external_ref.replace("check_", ""))
    except ValueError:
        return {"status": "ignored", "reason": "invalid check id"}

    # CRIT-01 FIX: Use SELECT FOR UPDATE to prevent race condition on concurrent webhooks
    check = db.scalar(select(Check).where(Check.id == check_id).with_for_update())
    if not check:
        return {"status": "ignored", "reason": "check not found"}

    # Find or create payment record
    # CRIT-01 FIX: Also lock the payment record to prevent double processing
    payment = db.scalar(
        select(Payment).where(
            Payment.check_id == check_id,
            Payment.provider == "MERCADO_PAGO",
            Payment.external_id == str(verify_result.external_id or ""),
        ).with_for_update()
    )

    if not payment:
        # Create new payment record
        payment = Payment(
            tenant_id=check.tenant_id,
            branch_id=check.branch_id,
            check_id=check.id,
            provider="MERCADO_PAGO",
            status="PENDING",
            amount_cents=verify_result.amount_cents or 0,
            external_id=str(payment_id),
        )
        db.add(payment)

    # Update payment status based on gateway result
    if mp_status == "approved":
        payment.status = "APPROVED"
        payment.amount_cents = verify_result.amount_cents or 0

        # Flush to get payment ID before allocating
        db.flush()

        # Allocate payment to charges using FIFO (same as cash payments)
        allocate_payment_fifo(db, payment)

        # Update check
        check.paid_cents += payment.amount_cents
        if check.paid_cents >= check.total_cents:
            check.status = "PAID"
        else:
            check.status = "IN_PAYMENT"

    elif mp_status in ["rejected", "cancelled"]:
        payment.status = "REJECTED"

    # Get session for events (before commit for table_id)
    session = db.scalar(
        select(TableSession).where(TableSession.id == check.table_session_id)
    )
    table_id = session.table_id if session else None

    # OUTBOX-PATTERN: Write events atomically with business data
    if mp_status == "approved":
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
                "amount_cents": payment.amount_cents,
                "provider": "MERCADO_PAGO",
            },
            actor_role="SYSTEM",
        )

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
                actor_role="SYSTEM",
            )

    elif mp_status in ["rejected", "cancelled"]:
        write_billing_outbox_event(
            db=db,
            tenant_id=check.tenant_id,
            event_type=PAYMENT_REJECTED,
            check_id=check.id,
            branch_id=check.branch_id,
            session_id=check.table_session_id,
            table_id=table_id,
            extra_data={
                "payment_id": payment.id,
                "reason": verify_result.status_detail or "unknown",
            },
            actor_role="SYSTEM",
        )

    # CRIT-01 FIX: Wrap commit in try-except to handle DB errors
    try:
        db.commit()
        db.refresh(payment)
        db.refresh(check)
    except Exception as e:
        db.rollback()
        logger.error("Failed to commit MP payment update", check_id=check.id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to process payment - please try again",
        )

    # SEC-AUDIT-03: Log Mercado Pago payment to tamper-evident audit chain
    action = "MP_PAYMENT_APPROVED" if mp_status == "approved" else "MP_PAYMENT_REJECTED"
    await safe_audit_log(
        event_type="PAYMENT",
        action=action,
        ip_address=request.client.host if request.client else None,
        resource_type="payment",
        resource_id=payment.id,
        data={
            "check_id": check.id,
            "amount_cents": payment.amount_cents,
            "provider": "MERCADO_PAGO",
            "mp_status": mp_status,
            "mp_status_detail": verify_result.status_detail,
            "mp_payment_id": payment_id,
            "check_status": check.status,
            "check_paid_cents": check.paid_cents,
            "check_total_cents": check.total_cents,
        },
        failure_message="Failed to write audit log for MP payment",
        failure_extra={"payment_id": payment.id},
    )

    # Note: Event publishing is now handled by outbox processor (guaranteed delivery)

    return {"status": "processed", "payment_status": mp_status}


__all__ = ["router"]
