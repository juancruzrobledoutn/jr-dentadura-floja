"""
Reservation management endpoints.

CLEAN-ARCH: Thin router that delegates to ReservationService.
"""

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user

from shared.utils.admin_schemas import (
    ReservationOutput,
    ReservationCreate,
    ReservationUpdate,
    ReservationStatusUpdate,
)
from rest_api.routers._common.pagination import Pagination, get_pagination
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain import ReservationService


router = APIRouter(tags=["admin-reservations"])


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/reservations", response_model=list[ReservationOutput])
def list_reservations(
    branch_id: int | None = None,
    filter_date: date | None = Query(None, alias="date"),
    status: str | None = None,
    include_deleted: bool = False,
    pagination: Pagination = Depends(get_pagination),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[ReservationOutput]:
    """List reservations, optionally filtered by branch, date, and status."""
    ctx = PermissionContext(user)
    service = ReservationService(db)

    if branch_id:
        ctx.require_branch_access(branch_id)
        return service.list_by_branch_filtered(
            tenant_id=ctx.tenant_id,
            branch_id=branch_id,
            filter_date=filter_date,
            filter_status=status,
            include_inactive=include_deleted,
            limit=pagination.limit,
            offset=pagination.offset,
        )

    if not ctx.is_admin:
        if ctx.branch_ids:
            return service.list_by_branches(
                tenant_id=ctx.tenant_id,
                branch_ids=ctx.branch_ids,
                include_inactive=include_deleted,
                limit=pagination.limit,
                offset=pagination.offset,
            )
        return []

    return service.list_all(
        tenant_id=ctx.tenant_id,
        include_inactive=include_deleted,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/reservations/{reservation_id}", response_model=ReservationOutput)
def get_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> ReservationOutput:
    """Get a specific reservation."""
    ctx = PermissionContext(user)
    service = ReservationService(db)

    output = service.get_by_id(reservation_id, ctx.tenant_id)

    entity = service.get_entity(reservation_id, ctx.tenant_id)
    if entity:
        ctx.require_branch_access(entity.branch_id)

    return output


@router.post("/reservations", response_model=ReservationOutput, status_code=201)
def create_reservation(
    body: ReservationCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> ReservationOutput:
    """Create a new reservation. Requires ADMIN or MANAGER role."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = ReservationService(db)

    return service.create(
        data=body.model_dump(),
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.patch("/reservations/{reservation_id}", response_model=ReservationOutput)
def update_reservation(
    reservation_id: int,
    body: ReservationUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> ReservationOutput:
    """Update a reservation. Requires ADMIN or MANAGER role."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = ReservationService(db)

    entity = service.get_entity(reservation_id, ctx.tenant_id)
    if entity:
        service.validate_branch_access(entity, ctx.branch_ids if not ctx.is_admin else None)

    return service.update(
        entity_id=reservation_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.patch(
    "/reservations/{reservation_id}/status",
    response_model=ReservationOutput,
)
def update_reservation_status(
    reservation_id: int,
    body: ReservationStatusUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> ReservationOutput:
    """Change reservation status following the FSM."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = ReservationService(db)

    entity = service.get_entity(reservation_id, ctx.tenant_id)
    if entity:
        service.validate_branch_access(entity, ctx.branch_ids if not ctx.is_admin else None)

    return service.update_status(
        tenant_id=ctx.tenant_id,
        reservation_id=reservation_id,
        new_status=body.status,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.delete("/reservations/{reservation_id}", status_code=204)
def delete_reservation(
    reservation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> None:
    """Soft delete a reservation. Requires ADMIN or MANAGER role.

    PERF-BGTASK-01: BackgroundTasks propagated to publish_entity_deleted via
    ReservationService._after_delete (FastAPI manages async task lifecycle).
    """
    ctx = PermissionContext(user)
    ctx.require_management()

    service = ReservationService(db)

    entity = service.get_entity(reservation_id, ctx.tenant_id)
    if entity:
        service.validate_branch_access(entity, ctx.branch_ids if not ctx.is_admin else None)

    service.delete(
        entity_id=reservation_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
        background_tasks=background_tasks,
    )
