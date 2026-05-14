"""
Waiter — service calls feature router.

Endpoints:
    GET    /service-calls
    POST   /service-calls/{call_id}/acknowledge
    POST   /service-calls/{call_id}/resolve

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from shared.config.logging import waiter_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import (
    SERVICE_CALL_ACKED,
    SERVICE_CALL_CLOSED,
)
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import ServiceCallOutput

from rest_api.services.domain import ServiceCallService
from rest_api.routers.waiter._event_helpers import (
    _safe_publish_service_call_event,
)


router = APIRouter(tags=["waiter"])


@router.get("/service-calls", response_model=list[ServiceCallOutput])
def get_pending_service_calls(
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> list[ServiceCallOutput]:
    """
    Get all pending service calls for the waiter's branches.

    C8 PASS 3 REFACTOR: Thin controller — DTO mapping delegated to
    ServiceCallService.get_pending_calls_dto.
    Returns service calls with status OPEN or ACKED. PWAW-A003.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    branch_ids = ctx.get("branch_ids", [])
    if not branch_ids:
        return []

    service = ServiceCallService(db)
    return [ServiceCallOutput(**d) for d in service.get_pending_calls_dto(branch_ids)]


@router.post("/service-calls/{call_id}/acknowledge", response_model=ServiceCallOutput)
async def acknowledge_service_call(
    call_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ServiceCallOutput:
    """
    Acknowledge a service call.

    C8 PASS 3 REFACTOR: Thin controller — delegates call mutation + table
    lookup to ServiceCallService.acknowledge_with_table_info, and response
    mapping to ServiceCallService.to_output_dict.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    branch_ids = ctx.get("branch_ids", [])

    service = ServiceCallService(db)

    # NotFoundError (from service.acknowledge) is an AppException — global handler
    # converts it to 404 automatically. ValueError still maps to 400 manually.
    try:
        call, table, sector_id = service.acknowledge_with_table_info(
            call_id, user_id, branch_ids
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to acknowledge service call", call_id=call_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to acknowledge service call - please try again",
        )

    await _safe_publish_service_call_event(
        event_type=SERVICE_CALL_ACKED,
        tenant_id=call.tenant_id,
        branch_id=call.branch_id,
        table_id=table.id if table else 0,
        session_id=call.table_session_id,
        call_id=call.id,
        call_type=call.type,
        actor_user_id=user_id,
        actor_role="WAITER",
        sector_id=sector_id,
        log_message="Service call acknowledged",
        log_extra={"call_id": call_id, "user_id": user_id, "sector_id": sector_id},
    )

    return ServiceCallOutput(**service.to_output_dict(call, table))


@router.post("/service-calls/{call_id}/resolve", response_model=ServiceCallOutput)
async def resolve_service_call(
    call_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> ServiceCallOutput:
    """
    Resolve a service call.

    C8 PASS 3 REFACTOR: Thin controller — delegates to
    ServiceCallService.resolve_with_table_info + to_output_dict.
    """
    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    user_id = int(ctx["sub"])
    branch_ids = ctx.get("branch_ids", [])

    service = ServiceCallService(db)

    # NotFoundError (from service.resolve) is an AppException — global handler
    # converts it to 404 automatically. ValueError still maps to 400 manually.
    try:
        call, table, sector_id = service.resolve_with_table_info(
            call_id, user_id, branch_ids
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to resolve service call", call_id=call_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resolve service call - please try again",
        )

    await _safe_publish_service_call_event(
        event_type=SERVICE_CALL_CLOSED,
        tenant_id=call.tenant_id,
        branch_id=call.branch_id,
        table_id=table.id if table else 0,
        session_id=call.table_session_id,
        call_id=call.id,
        call_type=call.type,
        actor_user_id=user_id,
        actor_role="WAITER",
        sector_id=sector_id,
        log_message="Service call resolved",
        log_extra={"call_id": call_id, "user_id": user_id, "sector_id": sector_id},
    )

    return ServiceCallOutput(**service.to_output_dict(call, table))
