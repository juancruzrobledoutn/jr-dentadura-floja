"""
Waiter — billing feature router.

Endpoints:
    POST /sessions/{session_id}/check
    POST /payments/manual              [CRITICO governance — preserved verbatim]
    POST /sessions/{session_id}/discount

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
`register_manual_payment` is governance CRITICO — its body is preserved
verbatim.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from shared.config.logging import waiter_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    CHECK_PAID,
    CHECK_REQUESTED,
    PAYMENT_APPROVED,
    get_redis_client,
    publish_check_event,
)
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import (
    ManualPaymentRequest,
    ManualPaymentResponse,
    WaiterRequestCheckResponse,
)

from rest_api.models import TableSession
from rest_api.services.domain import BillingService
from rest_api.services.payments.allocation import allocate_payment_fifo
from rest_api.routers.waiter._event_helpers import _safe_publish_check_event
from rest_api.routers.waiter._schemas import (
    ApplyDiscountRequest,
    ApplyDiscountResponse,
)


router = APIRouter(tags=["waiter"])


# =============================================================================
# Request Check
# =============================================================================


@router.post("/sessions/{session_id}/check", response_model=WaiterRequestCheckResponse)
async def request_check_for_session(
    session_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> WaiterRequestCheckResponse:
    """
    HU-WAITER-MESA CA-05: Waiter requests the check for a session.

    REF-02: Uses BillingService for thin controller pattern.
    Creates or retrieves the check for the session, aggregating all
    submitted rounds into a single bill.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    # Find the session to verify access
    session = db.scalar(
        select(TableSession)
        .options(joinedload(TableSession.table))
        .where(
            TableSession.id == session_id,
            TableSession.tenant_id == tenant_id,
            TableSession.status.in_(["OPEN", "PAYING"]),
        )
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active session {session_id} not found",
        )

    # Verify branch access
    if session.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    billing_service = BillingService(db)

    try:
        check, items_count, is_new = billing_service.request_check(
            tenant_id=tenant_id,
            branch_id=session.branch_id,
            session_id=session_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Publish CHECK_REQUESTED event only for new checks
    if is_new:
        table = session.table
        await _safe_publish_check_event(
            event_type=CHECK_REQUESTED,
            tenant_id=tenant_id,
            branch_id=session.branch_id,
            table_id=table.id if table else 0,
            session_id=session_id,
            check_id=check.id,
            total_cents=check.total_cents,
            paid_cents=0,
            actor_user_id=waiter_id,
            actor_role="WAITER",
            sector_id=table.sector_id if table else None,
            log_message="Check requested by waiter",
            log_extra={
                "session_id": session_id,
                "check_id": check.id,
                "total_cents": check.total_cents,
                "waiter_id": waiter_id,
            },
        )

    return WaiterRequestCheckResponse(
        check_id=check.id,
        session_id=session_id,
        total_cents=check.total_cents,
        paid_cents=check.paid_cents,
        status=check.status,
        items_count=items_count,
    )


# =============================================================================
# Manual Payment  [CRITICO governance — preserved verbatim]
# =============================================================================


@router.post("/payments/manual", response_model=ManualPaymentResponse)
async def register_manual_payment(
    body: ManualPaymentRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ManualPaymentResponse:
    """
    HU-WAITER-MESA CA-06: Waiter registers a manual payment.

    REF-02: Uses BillingService for thin controller pattern.
    CRITICAL: This endpoint does NOT integrate with Mercado Pago or any
    digital payment provider. The waiter physically receives the payment
    (cash, physical card, or bank transfer) and registers it in the system.

    The payment is immediately marked as APPROVED since the waiter confirms
    having received it.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    billing_service = BillingService(db)

    # CheckNotFoundError is an AppException subclass — global handler converts to 404.
    try:
        payment, check = billing_service.record_manual_payment(
            check_id=body.check_id,
            amount_cents=body.amount_cents,
            manual_method=body.manual_method,
            waiter_id=waiter_id,
            branch_ids=branch_ids,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Allocate payment to charges (FIFO)
    try:
        allocate_payment_fifo(db, payment)
    except Exception as e:
        logger.warning("Payment allocation failed", payment_id=payment.id, error=str(e))

    # Get session/table info for events
    session = db.scalar(
        select(TableSession)
        .options(joinedload(TableSession.table))
        .where(TableSession.id == check.table_session_id)
    )
    table = session.table if session else None

    # Publish payment event
    try:
        redis = await get_redis_client()

        # Always publish PAYMENT_APPROVED
        await publish_check_event(
            redis_client=redis,
            event_type=PAYMENT_APPROVED,
            tenant_id=tenant_id,
            branch_id=check.branch_id,
            table_id=table.id if table else 0,
            session_id=session.id if session else 0,
            check_id=check.id,
            total_cents=check.total_cents,
            paid_cents=check.paid_cents,
            actor_user_id=waiter_id,
            actor_role="WAITER",
            sector_id=table.sector_id if table else None,
        )

        # If fully paid, also publish CHECK_PAID
        if check.status == "PAID":
            await publish_check_event(
                redis_client=redis,
                event_type=CHECK_PAID,
                tenant_id=tenant_id,
                branch_id=check.branch_id,
                table_id=table.id if table else 0,
                session_id=session.id if session else 0,
                check_id=check.id,
                total_cents=check.total_cents,
                paid_cents=check.paid_cents,
                actor_user_id=waiter_id,
                actor_role="WAITER",
                sector_id=table.sector_id if table else None,
            )

        logger.info(
            "Manual payment registered",
            check_id=check.id,
            payment_id=payment.id,
            amount_cents=body.amount_cents,
            method=body.manual_method,
            waiter_id=waiter_id,
            check_status=check.status,
        )
    except Exception as e:
        logger.error("Failed to publish payment event", error=str(e))

    return ManualPaymentResponse(
        payment_id=payment.id,
        check_id=check.id,
        amount_cents=payment.amount_cents,
        manual_method=body.manual_method,
        status=payment.status,
        payment_category=payment.payment_category,
        registered_by=payment.registered_by,
        registered_by_waiter_id=waiter_id,
        check_status=check.status,
        check_total_cents=check.total_cents,
        check_paid_cents=check.paid_cents,
        check_remaining_cents=check.total_cents - check.paid_cents,
    )


# =============================================================================
# Ad-hoc Discount
# =============================================================================


@router.post("/sessions/{session_id}/discount", response_model=ApplyDiscountResponse)
def apply_session_discount(
    session_id: int,
    body: ApplyDiscountRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ApplyDiscountResponse:
    """
    Apply an ad-hoc discount to a session's check.

    C8 PASS 3 REFACTOR: Thin controller — full pipeline (session find, branch
    check, check find, discount apply, refresh) delegated to OverrideService.
    Requires MANAGER or ADMIN role. Records discount as ManagerOverride for
    full audit trail.
    """
    from rest_api.services.domain.override_service import OverrideService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    user_email = ctx.get("email", "")
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = OverrideService(db)
    try:
        data = service.apply_discount_to_session_check(
            tenant_id=tenant_id,
            branch_ids=branch_ids,
            session_id=session_id,
            discount_type=body.discount_type,
            discount_value=body.value,
            reason=body.reason,
            manager_user_id=user_id,
            manager_email=user_email,
        )
    except _NotFoundError as e:
        # Preserve legacy distinct 404 messages.
        msg = str(e.detail) if hasattr(e, "detail") else str(e)
        if "Cuenta" in msg or "cuenta" in msg:
            detail = f"No se encontró cuenta para la sesión {session_id}"
        else:
            detail = f"Sesión activa {session_id} no encontrada"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
        )
    except _ForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta sucursal",
        )
    except _ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e.detail) if hasattr(e, "detail") else str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return ApplyDiscountResponse(
        success=True,
        session_id=session_id,
        check_id=data["check_id"],
        discount_type=body.discount_type,
        discount_value=body.value,
        discount_amount_cents=data["discount_amount_cents"],
        old_total_cents=data["old_total_cents"],
        new_total_cents=data["new_total_cents"],
        message=f"Descuento aplicado: {body.reason}",
    )
