"""
Waiter — rounds & round-items feature router.

Endpoints:
    POST   /sessions/{session_id}/rounds
    DELETE /rounds/{round_id}/items/{item_id}
    PATCH  /rounds/items/{item_id}/void
    GET    /sessions/{session_id}/summary

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from shared.config.logging import waiter_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    ROUND_SUBMITTED,
    get_redis_client,
)
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import (
    WaiterSessionSummaryOutput,
    WaiterSubmitRoundRequest,
    WaiterSubmitRoundResponse,
)

from rest_api.services.domain import BillingService, RoundService
from rest_api.routers.waiter._event_helpers import _safe_publish_round_event
from rest_api.routers.waiter._schemas import (
    DeleteRoundItemResponse,
    VoidRoundItemRequest,
    VoidRoundItemResponse,
)


router = APIRouter(tags=["waiter"])


# =============================================================================
# Submit Round
# =============================================================================


@router.post("/sessions/{session_id}/rounds", response_model=WaiterSubmitRoundResponse)
async def submit_round_for_session(
    session_id: int,
    body: WaiterSubmitRoundRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> WaiterSubmitRoundResponse:
    """
    HU-WAITER-MESA CA-03: Waiter submits a round of orders for a session.

    S4.2 REFACTOR: Thin controller — delegates to RoundService.submit_round_for_waiter.
    Status is PENDING (admin/manager advances to kitchen).
    """
    from rest_api.services.domain.round_service import InsufficientStockError
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = RoundService(db)
    try:
        new_round, total_cents, items_count, session = service.submit_round_for_waiter(
            tenant_id=tenant_id,
            branch_ids=branch_ids,
            session_id=session_id,
            waiter_id=waiter_id,
            request=body,
        )
    except _NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active session {session_id} not found",
        )
    except _ForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )
    except _ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except InsufficientStockError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Stock insuficiente para uno o más productos",
                "unavailable_items": e.unavailable_items,
            },
        )

    table = session.table
    await _safe_publish_round_event(
        event_type=ROUND_SUBMITTED,
        tenant_id=tenant_id,
        branch_id=session.branch_id,
        table_id=table.id if table else 0,
        session_id=session_id,
        round_id=new_round.id,
        round_number=new_round.round_number,
        actor_user_id=waiter_id,
        actor_role="WAITER",
        sector_id=table.sector_id if table else None,
        log_message="Round submitted by waiter",
        log_extra={
            "session_id": session_id,
            "round_id": new_round.id,
            "waiter_id": waiter_id,
            "items_count": items_count,
        },
    )

    return WaiterSubmitRoundResponse(
        session_id=session_id,
        round_id=new_round.id,
        round_number=new_round.round_number,
        status=new_round.status,
        submitted_by=new_round.submitted_by,
        submitted_by_waiter_id=waiter_id,
        items_count=items_count,
        total_cents=total_cents,
    )


# =============================================================================
# Delete Round Item
# =============================================================================


@router.delete("/rounds/{round_id}/items/{item_id}", response_model=DeleteRoundItemResponse)
async def delete_round_item(
    round_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> DeleteRoundItemResponse:
    """
    Delete an item from a round.

    C8 PASS 2 REFACTOR: Thin controller — delegates to RoundService.delete_round_item.
    Only allowed for rounds in PENDING or CONFIRMED status (before being sent to kitchen).
    If the round becomes empty after deletion, the entire round is deleted.
    """
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = RoundService(db)
    try:
        round_obj, deleted_product_id, remaining_items, round_deleted = service.delete_round_item(
            tenant_id=tenant_id,
            branch_ids=branch_ids,
            round_id=round_id,
            item_id=item_id,
        )
    except _NotFoundError as e:
        # Preserve legacy distinct 404 messages.
        msg = str(e.detail) if hasattr(e, "detail") else str(e)
        if "Item" in msg:
            detail = f"Item {item_id} no encontrado en la ronda {round_id}"
        else:
            detail = f"Ronda {round_id} no encontrada"
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

    # Publish event for real-time UI updates
    session = round_obj.session
    table = session.table if session else None
    sector_id = table.sector_id if table else None

    try:
        redis = await get_redis_client()
        from shared.infrastructure.events import publish_event, Event
        event = Event(
            type="ROUND_ITEM_DELETED",
            tenant_id=tenant_id,
            branch_id=round_obj.branch_id,
            table_id=table.id if table else 0,
            session_id=round_obj.table_session_id,
            round_id=round_id,
            item_id=item_id,
            product_id=deleted_product_id,  # SYNC FIX: For frontend cart sync
            round_deleted=round_deleted,
            actor_user_id=waiter_id,
            actor_role="WAITER",
            sector_id=sector_id,
        )
        from shared.infrastructure.events import channel_branch_admin, channel_branch_waiters, channel_table_session
        await publish_event(redis, channel_branch_admin(round_obj.branch_id), event)
        await publish_event(redis, channel_branch_waiters(round_obj.branch_id), event)
        # SYNC FIX: Also notify diners so their cart updates in real-time
        await publish_event(redis, channel_table_session(round_obj.table_session_id), event)
        logger.info(
            "Round item deleted",
            round_id=round_id,
            item_id=item_id,
            waiter_id=waiter_id,
            remaining_items=remaining_items,
            round_deleted=round_deleted,
        )
    except Exception as e:
        logger.error("Failed to publish ROUND_ITEM_DELETED event", error=str(e))

    message = "Ronda eliminada (sin items)" if round_deleted else "Item eliminado correctamente"

    return DeleteRoundItemResponse(
        success=True,
        round_id=round_id,
        item_id=item_id,
        remaining_items=remaining_items,
        round_deleted=round_deleted,
        message=message,
    )


# =============================================================================
# Session Summary
# =============================================================================


@router.get("/sessions/{session_id}/summary", response_model=WaiterSessionSummaryOutput)
def get_session_summary(
    session_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> WaiterSessionSummaryOutput:
    """
    HU-WAITER-MESA CA-09: Get summary of a session for waiter view.

    Returns session details including traceability info (who opened it,
    who submitted orders) and whether it's a hybrid flow.

    S4.1 REFACTOR: Delegates aggregation to BillingService.get_waiter_session_summary.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = BillingService(db)
    # Domain exceptions (NotFoundError/ForbiddenError) are handled by the
    # global AppException handler registered in S4.2.
    return service.get_waiter_session_summary(
        session_id=session_id,
        tenant_id=tenant_id,
        branch_ids=branch_ids,
    )


# =============================================================================
# Void Round Item
# =============================================================================


@router.patch("/rounds/items/{item_id}/void", response_model=VoidRoundItemResponse)
async def void_round_item(
    item_id: int,
    body: VoidRoundItemRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> VoidRoundItemResponse:
    """
    Void a single item from a submitted round.

    C8 PASS 3 REFACTOR: Branch access check pushed into RoundService.void_item.
    Allowed for rounds in SUBMITTED, IN_KITCHEN, or READY status.
    If all items in the round become voided, the round is auto-canceled.

    Requires WAITER, MANAGER, or ADMIN role.
    """
    from shared.utils.exceptions import ForbiddenError as _ForbiddenError

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = RoundService(db)

    # NotFoundError / ConflictError (from void_item) are AppException subclasses;
    # the global exception handler converts them to 404 / 409 responses.
    # ForbiddenError needs legacy detail string preservation.
    try:
        item, round_obj, round_canceled = service.void_item(
            tenant_id=tenant_id,
            round_item_id=item_id,
            reason=body.reason,
            user_id=user_id,
            branch_ids=branch_ids,
        )
    except _ForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta sucursal",
        )

    # Publish ROUND_ITEM_VOIDED event
    session = round_obj.session
    table = session.table if session else None
    sector_id = table.sector_id if table else None

    try:
        redis = await get_redis_client()
        from shared.infrastructure.events import publish_event, Event, ROUND_ITEM_VOIDED
        from shared.infrastructure.events import channel_branch_admin, channel_branch_waiters, channel_branch_kitchen

        event = Event(
            type=ROUND_ITEM_VOIDED,
            tenant_id=tenant_id,
            branch_id=round_obj.branch_id,
            table_id=table.id if table else 0,
            session_id=round_obj.table_session_id,
            entity={
                "round_id": round_obj.id,
                "item_id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "void_reason": body.reason,
                "round_canceled": round_canceled,
                "round_status": round_obj.status,
            },
            actor={
                "user_id": user_id,
                "role": "STAFF",
            },
            sector_id=sector_id,
        )
        await publish_event(redis, channel_branch_admin(round_obj.branch_id), event)
        await publish_event(redis, channel_branch_waiters(round_obj.branch_id), event)
        await publish_event(redis, channel_branch_kitchen(round_obj.branch_id), event)

        logger.info(
            "ROUND_ITEM_VOIDED event published",
            item_id=item.id,
            round_id=round_obj.id,
            round_canceled=round_canceled,
        )
    except Exception as e:
        logger.error("Failed to publish ROUND_ITEM_VOIDED event", error=str(e))

    message = (
        "Ronda cancelada (todos los items anulados)"
        if round_canceled
        else "Item anulado correctamente"
    )

    return VoidRoundItemResponse(
        success=True,
        item_id=item.id,
        round_id=round_obj.id,
        is_voided=True,
        void_reason=body.reason,
        round_canceled=round_canceled,
        message=message,
    )
