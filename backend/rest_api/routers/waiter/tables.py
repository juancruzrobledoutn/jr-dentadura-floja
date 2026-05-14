"""
Waiter — table lifecycle feature router (HU-WAITER-MESA).

Endpoints:
    POST /tables/{table_id}/activate
    POST /tables/{table_id}/close
    GET  /tables/{table_id}/session
    POST /tables/{table_id}/transfer
    POST /tables/{table_id}/move-to/{target_table_id}

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    TABLE_CLEARED,
    TABLE_SESSION_STARTED,
    TABLE_TRANSFERRED,
)
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import (
    WaiterActivateTableRequest,
    WaiterActivateTableResponse,
    WaiterCloseTableRequest,
    WaiterCloseTableResponse,
)

from rest_api.routers.waiter._event_helpers import _safe_publish_table_event
from rest_api.routers.waiter._exceptions import pick_detail
from rest_api.routers.waiter._schemas import (
    DinerDetailOutput,
    MoveTableResponse,
    RoundDetailOutput,
    RoundItemDetailOutput,
    TableSessionDetailOutput,
    TransferWaiterRequest,
    TransferWaiterResponse,
)


router = APIRouter(tags=["waiter"])


# =============================================================================
# Activate
# =============================================================================


@router.post("/tables/{table_id}/activate", response_model=WaiterActivateTableResponse)
async def activate_table(
    table_id: int,
    body: WaiterActivateTableRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> WaiterActivateTableResponse:
    """
    HU-WAITER-MESA CA-01: Waiter manually activates a table.

    This creates a new table session with opened_by="WAITER" to track
    that this is a waiter-managed flow (no pwaMenu usage by customers).

    S4.1 REFACTOR: Delegates persistence/validation to TableService.activate_for_waiter.
    Router keeps: permissions, event publication, response building.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    from rest_api.services.domain.table_service import TableService

    service = TableService(db)
    # Domain exceptions (NotFoundError/ForbiddenError/ConflictError) are handled
    # by the global AppException handler registered in S4.2.
    table, session = service.activate_for_waiter(
        table_id=table_id,
        tenant_id=tenant_id,
        branch_ids=branch_ids,
        waiter_id=waiter_id,
    )

    await _safe_publish_table_event(
        event_type=TABLE_SESSION_STARTED,
        tenant_id=tenant_id,
        branch_id=table.branch_id,
        table_id=table.id,
        session_id=session.id,
        table_code=table.code,
        table_status=table.status,
        actor_user_id=waiter_id,
        actor_role="WAITER",
        sector_id=table.sector_id,
        log_message="Table activated by waiter",
        log_extra={"table_id": table_id, "session_id": session.id, "waiter_id": waiter_id},
    )

    return WaiterActivateTableResponse(
        session_id=session.id,
        table_id=table.id,
        table_code=table.code,
        status=session.status,
        opened_at=session.opened_at,
        opened_by=session.opened_by,
        opened_by_waiter_id=waiter_id,
        diner_count=body.diner_count,
    )


# =============================================================================
# Close
# =============================================================================


@router.post("/tables/{table_id}/close", response_model=WaiterCloseTableResponse)
async def close_table(
    table_id: int,
    body: WaiterCloseTableRequest = WaiterCloseTableRequest(),
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> WaiterCloseTableResponse:
    """
    HU-WAITER-MESA CA-07: Waiter closes a table after payment is complete.

    S4.2 REFACTOR: Thin controller — delegates to TableService.close_table_after_payment.
    """
    from rest_api.services.domain import TableService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])
    user_roles = ctx.get("roles", [])

    service = TableService(db)
    try:
        table, session, total_cents, paid_cents, now = service.close_table_after_payment(
            tenant_id=tenant_id,
            table_id=table_id,
            branch_ids=branch_ids,
            user_roles=user_roles,
            force=body.force,
        )
    except _NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table {table_id} not found",
        )
    except _ForbiddenError as e:
        # Two paths raise ForbiddenError: branch access vs force-close-needs-ADMIN.
        # Preserve legacy detail strings.
        detail = pick_detail(
            e,
            {
                "ADMIN": "Force close requires ADMIN role",
                "Force": "Force close requires ADMIN role",
                "*": "No access to this branch",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )
    except _ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await _safe_publish_table_event(
        event_type=TABLE_CLEARED,
        tenant_id=tenant_id,
        branch_id=table.branch_id,
        table_id=table.id,
        session_id=session.id,
        table_code=table.code,
        table_status=table.status,
        actor_user_id=waiter_id,
        actor_role="WAITER",
        sector_id=table.sector_id,
        log_message="Table closed by waiter",
        log_extra={
            "table_id": table_id,
            "session_id": session.id,
            "waiter_id": waiter_id,
            "total_cents": total_cents,
            "paid_cents": paid_cents,
        },
    )

    return WaiterCloseTableResponse(
        table_id=table.id,
        table_code=table.code,
        table_status=table.status,
        session_id=session.id,
        session_status=session.status,
        total_cents=total_cents,
        paid_cents=paid_cents,
        closed_at=now,
    )


# =============================================================================
# Session Detail (Dashboard Integration)
# =============================================================================


@router.get("/tables/{table_id}/session", response_model=TableSessionDetailOutput)
def get_table_session_detail(
    table_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> TableSessionDetailOutput:
    """
    Get detailed session info for a table (Dashboard TableSessionModal).

    S4.2 REFACTOR: Thin controller — delegates fetch to TableService.get_table_session_detail.
    Response assembly stays in the router because it is router-owned schema.
    """
    from rest_api.services.domain import TableService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = TableService(db)
    try:
        table, session, check = service.get_table_session_detail(
            tenant_id=tenant_id,
            table_id=table_id,
            branch_ids=branch_ids,
        )
    except _NotFoundError as e:
        # Preserve legacy distinct 404 messages.
        detail = pick_detail(
            e,
            {
                "Sesión": f"No active session for table {table_id}",
                "sesión": f"No active session for table {table_id}",
                "*": f"Table {table_id} not found",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
        )
    except _ForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    # Build diner lookup for round items
    diner_lookup = {d.id: d for d in (session.diners or [])}

    # Build diners output
    diners_output = [
        DinerDetailOutput(
            id=d.id,
            session_id=d.session_id,
            name=d.name,
            color=d.color or "#666",
            local_id=d.local_id,
            joined_at=d.joined_at,
            device_id=d.device_id,
        )
        for d in (session.diners or [])
    ]

    # Build rounds output with items
    rounds_output = []
    total_cents = 0

    for round_obj in sorted(session.rounds or [], key=lambda r: r.round_number):
        items_output = []
        for item in (round_obj.items or []):
            diner = diner_lookup.get(item.diner_id) if item.diner_id else None
            product = item.product
            category = product.category if product else None

            items_output.append(
                RoundItemDetailOutput(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=product.name if product else "Unknown",
                    category_name=category.name if category else None,
                    qty=item.qty,
                    unit_price_cents=item.unit_price_cents,
                    notes=item.notes,
                    diner_id=item.diner_id,
                    diner_name=diner.name if diner else None,
                    diner_color=diner.color if diner else None,
                )
            )

            # Sum total from non-canceled rounds
            if round_obj.status not in ["DRAFT", "CANCELED"]:
                total_cents += item.unit_price_cents * item.qty

        rounds_output.append(
            RoundDetailOutput(
                id=round_obj.id,
                round_number=round_obj.round_number,
                status=round_obj.status,
                created_at=round_obj.created_at,
                submitted_at=round_obj.submitted_at,
                items=items_output,
            )
        )

    return TableSessionDetailOutput(
        session_id=session.id,
        table_id=table.id,
        table_code=table.code,
        status=session.status,
        opened_at=session.opened_at,
        diners=diners_output,
        rounds=rounds_output,
        check_status=check.status if check else None,
        total_cents=check.total_cents if check else total_cents,
        paid_cents=check.paid_cents if check else 0,
    )


# =============================================================================
# Shift Handoff (Transfer to another waiter)
# =============================================================================


@router.post("/tables/{table_id}/transfer", response_model=TransferWaiterResponse)
async def transfer_table_waiter(
    table_id: int,
    body: TransferWaiterRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> TransferWaiterResponse:
    """
    Transfer a table's active session to another waiter (shift handoff).

    C8 PASS 2 REFACTOR: Thin controller — delegates to TableService.transfer_waiter.
    Requires MANAGER or ADMIN role.
    Publishes TABLE_TRANSFERRED event to both old and new waiters.
    """
    from rest_api.services.domain import TableService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = TableService(db)
    try:
        table, session, previous_waiter_id = service.transfer_waiter(
            tenant_id=tenant_id,
            table_id=table_id,
            branch_ids=branch_ids,
            target_waiter_id=body.target_waiter_id,
        )
    except _NotFoundError as e:
        # Preserve legacy distinct 404 messages.
        detail = pick_detail(
            e,
            {
                "destino": f"Mozo destino {body.target_waiter_id} no encontrado",
                "Mozo": f"Mozo destino {body.target_waiter_id} no encontrado",
                "*": f"Mesa {table_id} no encontrada",
            },
        )
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

    await _safe_publish_table_event(
        event_type=TABLE_TRANSFERRED,
        tenant_id=tenant_id,
        branch_id=table.branch_id,
        table_id=table.id,
        session_id=session.id,
        table_code=table.code,
        table_status=table.status,
        actor_user_id=user_id,
        actor_role="MANAGER",
        sector_id=table.sector_id,
        log_message="Table waiter transferred",
        log_extra={
            "table_id": table_id,
            "session_id": session.id,
            "previous_waiter_id": previous_waiter_id,
            "new_waiter_id": body.target_waiter_id,
            "approved_by": user_id,
        },
    )

    return TransferWaiterResponse(
        success=True,
        table_id=table.id,
        table_code=table.code,
        session_id=session.id,
        previous_waiter_id=previous_waiter_id,
        new_waiter_id=body.target_waiter_id,
        message=f"Mesa {table.code} transferida al mozo #{body.target_waiter_id}",
    )


# =============================================================================
# Move (table-to-table session transfer)
# =============================================================================


@router.post("/tables/{table_id}/move-to/{target_table_id}", response_model=MoveTableResponse)
async def move_table_session(
    table_id: int,
    target_table_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> MoveTableResponse:
    """
    Move customers from one table to another.

    S4.2 REFACTOR: Thin controller — delegates to TableService.move_session_to_table.
    Transfers active session to the target table. Source becomes FREE, target inherits
    source's status. Requires WAITER, MANAGER, or ADMIN role.
    """
    from rest_api.services.domain import TableService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
        ValidationError as _ValidationError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = TableService(db)
    try:
        source_table, target_table, session = service.move_session_to_table(
            tenant_id=tenant_id,
            table_id=table_id,
            target_table_id=target_table_id,
            branch_ids=branch_ids,
        )
    except _NotFoundError as e:
        # Preserve the two distinct legacy 404 messages by detail introspection.
        detail = pick_detail(
            e,
            {
                "destino": f"Mesa destino {target_table_id} no encontrada en la misma sucursal",
                "*": f"Mesa origen {table_id} no encontrada",
            },
        )
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

    # Notify about the source table becoming free and the target being occupied.
    # Each publish is independently fault-tolerant via the helper.
    await _safe_publish_table_event(
        event_type=TABLE_TRANSFERRED,
        tenant_id=tenant_id,
        branch_id=source_table.branch_id,
        table_id=source_table.id,
        session_id=session.id,
        table_code=source_table.code,
        table_status=source_table.status,
        actor_user_id=user_id,
        actor_role="WAITER",
        sector_id=source_table.sector_id,
        log_message="Table session moved (source notified)",
        log_extra={
            "source_table_id": table_id,
            "target_table_id": target_table_id,
            "session_id": session.id,
            "moved_by": user_id,
        },
    )
    await _safe_publish_table_event(
        event_type=TABLE_TRANSFERRED,
        tenant_id=tenant_id,
        branch_id=target_table.branch_id,
        table_id=target_table.id,
        session_id=session.id,
        table_code=target_table.code,
        table_status=target_table.status,
        actor_user_id=user_id,
        actor_role="WAITER",
        sector_id=target_table.sector_id,
        log_message="Table session moved (target notified)",
        log_extra={
            "source_table_id": table_id,
            "target_table_id": target_table_id,
            "session_id": session.id,
            "moved_by": user_id,
        },
    )

    return MoveTableResponse(
        success=True,
        source_table_id=source_table.id,
        source_table_code=source_table.code,
        target_table_id=target_table.id,
        target_table_code=target_table.code,
        session_id=session.id,
        message=f"Clientes movidos de mesa {source_table.code} a {target_table.code}",
    )
