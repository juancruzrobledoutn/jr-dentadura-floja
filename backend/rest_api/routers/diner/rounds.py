"""
Diner — rounds feature router.

Endpoints:
    POST   /rounds/submit
    GET    /session/{session_id}/rounds

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from sqlalchemy.orm import Session

from rest_api.routers.diner._event_helpers import (
    _bg_publish_cart_cleared,
    _bg_publish_round_event,
)
from rest_api.services.domain import RoundService
from rest_api.services.domain.round_service import (
    DuplicateRoundError,
    InsufficientStockError,
)
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.infrastructure.events import ROUND_PENDING
from shared.security.auth import current_table_context
from shared.security.rate_limit import limiter
from shared.utils.exceptions import ConflictError, ValidationError
from shared.utils.schemas import (
    RoundOutput,
    SubmitRoundRequest,
    SubmitRoundResponse,
)


router = APIRouter(tags=["diner"])


@router.post("/rounds/submit", response_model=SubmitRoundResponse)
@limiter.limit("10/minute")
def submit_round(
    request: Request,
    body: SubmitRoundRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
    x_idempotency_key: str | None = Header(None),
) -> SubmitRoundResponse:
    """
    Submit a new round of orders.

    REF-01: Uses RoundService for thin controller pattern.
    Creates a new round with the specified items and schedules a
    ROUND_PENDING event to be published in the background.

    Requires X-Table-Token header with valid table token.
    """
    session_id = table_ctx["session_id"]
    table_id = table_ctx["table_id"]
    branch_id = table_ctx["branch_id"]
    tenant_id = table_ctx["tenant_id"]

    service = RoundService(db)

    try:
        new_round, sector_id = service.submit_round(
            tenant_id=tenant_id,
            branch_id=branch_id,
            session_id=session_id,
            table_id=table_id,
            request=body,
            idempotency_key=x_idempotency_key,
        )
    except DuplicateRoundError as e:
        # Idempotent response - return existing round
        logger.info(
            "Idempotent round submission detected",
            session_id=session_id,
            round_id=e.round_id,
        )
        return SubmitRoundResponse(
            session_id=session_id,
            round_id=e.round_id,
            round_number=e.round_number,
            status=e.status,
        )
    except InsufficientStockError as e:
        # Special-cased: response body must include structured unavailable_items list
        # so the client can render per-product feedback.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Insufficient stock for one or more products",
                "unavailable_items": e.unavailable_items,
            },
        )
    except (ConflictError, ValidationError):
        # AppException subclasses (SessionNotActive → ConflictError, ProductNotAvailable
        # → ValidationError) propagate to the global handler, which preserves status
        # code and detail.
        raise
    except Exception as e:
        logger.error("Failed to submit round", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit order - please try again",
        )

    # Schedule event publication in background
    background_tasks.add_task(
        _bg_publish_round_event,
        event_type=ROUND_PENDING,
        tenant_id=tenant_id,
        branch_id=branch_id,
        table_id=table_id,
        session_id=session_id,
        round_id=new_round.id,
        round_number=new_round.round_number,
        actor_user_id=None,
        actor_role="DINER",
        sector_id=sector_id,
    )

    # SHARED-CART: Notify all diners that cart was cleared
    background_tasks.add_task(
        _bg_publish_cart_cleared,
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        entity={"cleared": True},
    )

    return SubmitRoundResponse(
        session_id=session_id,
        round_id=new_round.id,
        round_number=new_round.round_number,
        status=new_round.status,
    )


@router.get("/session/{session_id}/rounds", response_model=list[RoundOutput])
def get_session_rounds(
    session_id: int,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> list[RoundOutput]:
    """
    Get all rounds for a session.

    REF-01: Uses RoundService for thin controller pattern.
    Returns the history of orders with their current status.
    """
    # Verify session matches token
    if table_ctx["session_id"] != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not match token",
        )

    service = RoundService(db)
    return service.get_session_rounds(session_id)


__all__ = ["router"]
