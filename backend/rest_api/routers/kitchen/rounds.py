"""
Kitchen router.
Handles operations for kitchen staff.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import select

from shared.infrastructure.db import get_db
from rest_api.models import (
    Round,
    RoundItem,
    Product,
    Table,
    TableSession,
)
from shared.security.auth import current_user_context, require_roles
from shared.utils.schemas import (
    RoundOutput,
    RoundItemOutput,
    UpdateRoundStatusRequest,
)
from shared.config.logging import kitchen_logger as logger
from shared.config.constants import (
    validate_round_transition,
    get_allowed_round_transitions,
    ROUND_TRANSITION_ROLES,
)
from shared.infrastructure.events import (
    get_redis_client,
    publish_round_event,
    ROUND_CONFIRMED,
    ROUND_SUBMITTED,
    ROUND_IN_KITCHEN,
    ROUND_READY,
    ROUND_SERVED,
)
from rest_api.services.events.outbox_service import write_round_outbox_event


router = APIRouter(prefix="/api/kitchen", tags=["kitchen"])


@router.get("/rounds", response_model=list[RoundOutput])
def get_pending_rounds(
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> list[RoundOutput]:
    """
    Get all active rounds for the kitchen.

    Returns rounds with status SUBMITTED or IN_KITCHEN,
    ordered by submission time (oldest first).

    Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
    - PENDING: Diner created order (waiter must verify)
    - CONFIRMED: Waiter verified at table (admin can now send to kitchen)
    - SUBMITTED: Admin sent to kitchen (visible in "Nuevos" column)
    - IN_KITCHEN: Cook is preparing (visible in "En Cocina" column)
    - READY/SERVED: Handled by Dashboard, not kitchen view

    Requires KITCHEN, MANAGER, or ADMIN role.
    """
    require_roles(ctx, ["KITCHEN", "MANAGER", "ADMIN"])

    branch_ids = ctx.get("branch_ids", [])
    if not branch_ids:
        return []

    # Get active rounds with eager loading to avoid N+1 queries
    # - selectinload for items (one-to-many collection)
    # - joinedload for session->table chain (many-to-one)
    # Kitchen only sees SUBMITTED and IN_KITCHEN (2 columns: Nuevos, En Cocina)
    # PENDING and CONFIRMED are handled by waiter/admin, not kitchen
    rounds = db.execute(
        select(Round)
        .options(
            selectinload(Round.items).joinedload(RoundItem.product),
            joinedload(Round.session).joinedload(TableSession.table),
        )
        .where(
            Round.branch_id.in_(branch_ids),
            Round.status.in_(["SUBMITTED", "IN_KITCHEN"]),
        )
        .order_by(Round.submitted_at.asc())
    ).scalars().unique().all()

    result = []
    for round_obj in rounds:
        # Access pre-loaded relationships (no additional queries)
        session = round_obj.session
        table = session.table if session else None

        item_outputs = [
            RoundItemOutput(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name,
                qty=item.qty,
                unit_price_cents=item.unit_price_cents,
                notes=item.notes,
            )
            for item in round_obj.items
        ]

        result.append(
            RoundOutput(
                id=round_obj.id,
                round_number=round_obj.round_number,
                status=round_obj.status,
                items=item_outputs,
                created_at=round_obj.created_at,
                table_id=table.id if table else None,
                table_code=table.code if table else None,
                submitted_at=round_obj.submitted_at,
            )
        )

    return result


@router.post("/rounds/{round_id}/status", response_model=RoundOutput)
async def update_round_status(
    round_id: int,
    body: UpdateRoundStatusRequest,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> RoundOutput:
    """
    Update the status of a round.

    Valid transitions (role-restricted):
    - PENDING -> CONFIRMED (WAITER/ADMIN/MANAGER - verifies order at table)
    - CONFIRMED -> SUBMITTED (ADMIN/MANAGER only - sends to kitchen)
    - SUBMITTED -> IN_KITCHEN (KITCHEN/ADMIN/MANAGER - starts preparing)
    - IN_KITCHEN -> READY (KITCHEN only - kitchen finished)
    - READY -> SERVED (ADMIN/MANAGER/WAITER - confirms delivery)

    Publishes corresponding events for real-time updates.
    """
    require_roles(ctx, ["KITCHEN", "WAITER", "MANAGER", "ADMIN"])

    # Find the round with eager loading for items, session, and table
    round_obj = db.scalar(
        select(Round)
        .options(
            selectinload(Round.items).joinedload(RoundItem.product),
            joinedload(Round.session).joinedload(TableSession.table),
        )
        .where(Round.id == round_id)
    )

    if not round_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Round {round_id} not found",
        )

    # Verify branch access
    branch_ids = ctx.get("branch_ids", [])
    if round_obj.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    # Validate status transition using centralized FSM from constants.py
    current_status = round_obj.status
    new_status = body.status
    user_roles = ctx.get("roles", [])

    if not validate_round_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition from {current_status} to {new_status}",
        )

    # Role-based transition restrictions from centralized ROUND_TRANSITION_ROLES
    transition_key = (current_status, new_status)
    allowed_roles = ROUND_TRANSITION_ROLES.get(transition_key)
    if allowed_roles and not any(role in allowed_roles for role in user_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this transition",
        )

    # Update status
    # ROUTER-HIGH-02 FIX: Add error handling for commit
    round_obj.status = new_status
    # Set confirmed_by_user_id when waiter confirms the order
    if new_status == "CONFIRMED":
        round_obj.confirmed_by_user_id = int(ctx["sub"])
    # Set submitted_at when sending to kitchen
    if new_status == "SUBMITTED" and round_obj.submitted_at is None:
        round_obj.submitted_at = datetime.now(timezone.utc)
    # HIGH-KITCHEN-01 FIX: Store session/table info before commit since we'll re-query after
    # This avoids the need for db.refresh() which invalidates relationships
    pre_commit_session = round_obj.session
    pre_commit_table = pre_commit_session.table if pre_commit_session else None
    pre_commit_sector_id = pre_commit_table.sector_id if pre_commit_table else None
    pre_commit_table_id = pre_commit_table.id if pre_commit_table else None

    # OUTBOX-PATTERN: For SUBMITTED and READY, use outbox for guaranteed delivery
    # Other status changes use direct Redis publishing (acceptable latency vs reliability tradeoff)
    use_outbox = new_status in ["SUBMITTED", "READY"]

    if use_outbox:
        # Write outbox event BEFORE commit (atomic with business data)
        event_type_map = {
            "SUBMITTED": ROUND_SUBMITTED,
            "READY": ROUND_READY,
        }
        write_round_outbox_event(
            db=db,
            tenant_id=round_obj.tenant_id,
            event_type=event_type_map[new_status],
            round_id=round_obj.id,
            branch_id=round_obj.branch_id,
            session_id=round_obj.table_session_id,
            table_id=pre_commit_table_id,
            round_number=round_obj.round_number,
            sector_id=pre_commit_sector_id,
            actor_user_id=int(ctx["sub"]),
            actor_role=ctx["roles"][0] if ctx.get("roles") else "UNKNOWN",
        )

    try:
        db.commit()
        # Note: Skip db.refresh() - we'll do a single eager-loaded query below for response
    except Exception as e:
        db.rollback()
        logger.error("Failed to update round status", round_id=round_id, new_status=new_status, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update round status - please try again",
        )

    # Use pre-commit session for event publishing (avoids extra query)
    session = pre_commit_session

    # SECTOR-DISPATCH FIX: Get sector_id from table for targeted waiter notifications
    # HIGH-KITCHEN-01 FIX: Use pre-commit data instead of re-querying
    sector_id = pre_commit_sector_id

    # For non-outbox events, publish directly to Redis (CONFIRMED, IN_KITCHEN, SERVED)
    if not use_outbox:
        event_type_map = {
            "CONFIRMED": ROUND_CONFIRMED,
            "IN_KITCHEN": ROUND_IN_KITCHEN,
            "SERVED": ROUND_SERVED,
        }

        redis = None
        try:
            redis = await get_redis_client()
            await publish_round_event(
                redis_client=redis,
                event_type=event_type_map[new_status],
                tenant_id=round_obj.tenant_id,
                branch_id=round_obj.branch_id,
                table_id=session.table_id if session else None,
                session_id=round_obj.table_session_id,
                round_id=round_obj.id,
                round_number=round_obj.round_number,
                actor_user_id=int(ctx["sub"]),
                actor_role=ctx["roles"][0] if ctx.get("roles") else "UNKNOWN",
                sector_id=sector_id,  # SECTOR-DISPATCH FIX
            )
        except Exception as e:
            logger.error("Failed to publish round status event", round_id=round_id, new_status=new_status, error=str(e))
        # Note: Don't close pooled Redis connection - pool manages lifecycle
    # Note: SUBMITTED and READY events are handled by outbox processor (guaranteed delivery)

    # Build response using pre-loaded relationships (no additional queries)
    # Note: After db.refresh(), relationships need to be re-queried
    # so we do a single efficient query with eager loading
    round_obj = db.scalar(
        select(Round)
        .options(
            selectinload(Round.items).joinedload(RoundItem.product),
            joinedload(Round.session).joinedload(TableSession.table),
        )
        .where(Round.id == round_id)
    )

    session = round_obj.session
    table = session.table if session else None

    item_outputs = [
        RoundItemOutput(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name,
            qty=item.qty,
            unit_price_cents=item.unit_price_cents,
            notes=item.notes,
        )
        for item in round_obj.items
    ]

    return RoundOutput(
        id=round_obj.id,
        round_number=round_obj.round_number,
        status=round_obj.status,
        items=item_outputs,
        created_at=round_obj.created_at,
        table_id=table.id if table else None,
        table_code=table.code if table else None,
        submitted_at=round_obj.submitted_at,
    )


@router.get("/rounds/{round_id}", response_model=RoundOutput)
def get_round(
    round_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> RoundOutput:
    """
    Get details of a specific round.
    """
    require_roles(ctx, ["KITCHEN", "WAITER", "MANAGER", "ADMIN"])

    # Eager load items with products, and session with table
    round_obj = db.scalar(
        select(Round)
        .options(
            selectinload(Round.items).joinedload(RoundItem.product),
            joinedload(Round.session).joinedload(TableSession.table),
        )
        .where(Round.id == round_id)
    )

    if not round_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Round {round_id} not found",
        )

    branch_ids = ctx.get("branch_ids", [])
    if round_obj.branch_id not in branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    # Access pre-loaded relationships (no additional queries)
    session = round_obj.session
    table = session.table if session else None

    item_outputs = [
        RoundItemOutput(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name,
            qty=item.qty,
            unit_price_cents=item.unit_price_cents,
            notes=item.notes,
        )
        for item in round_obj.items
    ]

    return RoundOutput(
        id=round_obj.id,
        round_number=round_obj.round_number,
        status=round_obj.status,
        items=item_outputs,
        created_at=round_obj.created_at,
        table_id=table.id if table else None,
        table_code=table.code if table else None,
        submitted_at=round_obj.submitted_at,
    )


# =============================================================================
# Wait Time Estimator
# =============================================================================

from pydantic import BaseModel as PydanticBaseModel


class EstimatedWaitResponse(PydanticBaseModel):
    """Response for estimated wait time."""
    estimated_minutes: int
    queue_size: int


@router.get("/estimated-wait", response_model=EstimatedWaitResponse)
def get_estimated_wait(
    branch_id: int,
    db: Session = Depends(get_db),
) -> EstimatedWaitResponse:
    """
    Get estimated wait time for a branch based on current kitchen queue.

    No auth required - accessible by diners via pwaMenu.
    Logic: count rounds in SUBMITTED + IN_KITCHEN status.
    Estimate ~10 minutes per queued round (simple heuristic), or
    calculate from recently completed rounds if available.
    """
    from sqlalchemy import func as sa_func

    # Count active rounds in the queue
    queue_size = db.scalar(
        select(sa_func.count(Round.id)).where(
            Round.branch_id == branch_id,
            Round.status.in_(["SUBMITTED", "IN_KITCHEN"]),
        )
    ) or 0

    # Calculate average prep time from recently completed rounds (last 20)
    avg_minutes = 10  # Default: 10 min per round
    recent_completed = db.execute(
        select(Round.submitted_at, Round.updated_at)
        .where(
            Round.branch_id == branch_id,
            Round.status.in_(["READY", "SERVED"]),
            Round.submitted_at.isnot(None),
        )
        .order_by(Round.updated_at.desc())
        .limit(20)
    ).all()

    if len(recent_completed) >= 3:
        total_minutes = 0
        valid_count = 0
        for submitted_at, updated_at in recent_completed:
            if submitted_at and updated_at:
                delta = (updated_at - submitted_at).total_seconds() / 60
                if 0 < delta < 120:  # Sanity check: 0-120 min
                    total_minutes += delta
                    valid_count += 1
        if valid_count > 0:
            avg_minutes = int(total_minutes / valid_count)

    estimated = max(1, queue_size * avg_minutes) if queue_size > 0 else 0

    return EstimatedWaitResponse(
        estimated_minutes=estimated,
        queue_size=queue_size,
    )
