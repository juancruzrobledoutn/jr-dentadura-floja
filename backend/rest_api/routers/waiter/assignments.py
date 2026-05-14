"""
Waiter — sector assignments feature router.

Endpoints:
    GET  /my-assignments
    GET  /verify-branch-assignment
    GET  /my-tables

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context, require_roles

from rest_api.routers.waiter._schemas import (
    BranchAssignmentVerifyOutput,
    MyAssignmentsOutput,
    SectorAssignmentOutput,
    ShiftType,
)


router = APIRouter(tags=["waiter"])


@router.get("/my-assignments", response_model=MyAssignmentsOutput)
def get_my_sector_assignments(
    assignment_date: date = Query(default=None, description="Date for assignments (defaults to today)"),
    # RTR-MED-05 FIX: Use ShiftType enum for validation instead of any string
    shift: ShiftType | None = Query(default=None, description="Filter by shift: MORNING, AFTERNOON, NIGHT"),
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> MyAssignmentsOutput:
    """
    Get the current waiter's sector assignments for today (or specified date).

    C8 PASS 2 REFACTOR: Thin controller — delegates to StaffService.
    """
    from rest_api.services.domain import StaffService

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    target_date = assignment_date or date.today()

    service = StaffService(db)
    assignments = service.get_waiter_sector_assignments(
        waiter_id=waiter_id,
        tenant_id=tenant_id,
        target_date=target_date,
        shift_value=shift.value if shift else None,
    )

    sectors = []
    sector_ids = []
    for assignment in assignments:
        sector = assignment.sector
        if sector and sector.is_active:
            sectors.append(
                SectorAssignmentOutput(
                    sector_id=sector.id,
                    sector_name=sector.name,
                    sector_prefix=sector.prefix,
                    branch_id=assignment.branch_id,
                    assignment_date=assignment.assignment_date,
                    shift=assignment.shift,
                )
            )
            if sector.id not in sector_ids:
                sector_ids.append(sector.id)

    return MyAssignmentsOutput(
        waiter_id=waiter_id,
        assignment_date=target_date,
        sectors=sectors,
        sector_ids=sector_ids,
    )


@router.get("/verify-branch-assignment", response_model=BranchAssignmentVerifyOutput)
def verify_branch_assignment(
    branch_id: int = Query(..., description="Branch ID to verify assignment for"),
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> BranchAssignmentVerifyOutput:
    """
    Verify if the current waiter is assigned to work at a specific branch today.

    C8 PASS 2 REFACTOR: Thin controller — delegates to StaffService.
    Used by pwaWaiter to validate branch selection before showing tables.
    """
    from rest_api.services.domain import StaffService

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    user_branch_ids = ctx.get("branch_ids", [])

    service = StaffService(db)
    result = service.verify_waiter_branch_assignment(
        waiter_id=waiter_id,
        tenant_id=tenant_id,
        branch_id=branch_id,
        user_branch_ids=user_branch_ids,
    )

    sectors = [
        SectorAssignmentOutput(
            sector_id=a.sector.id,
            sector_name=a.sector.name,
            sector_prefix=a.sector.prefix,
            branch_id=branch_id,
            assignment_date=result["assignment_date"],
            shift=a.shift,
        )
        for a in result["assignments"]
    ]

    return BranchAssignmentVerifyOutput(
        is_assigned=result["is_assigned"],
        branch_id=result["branch_id"],
        branch_name=result["branch_name"],
        assignment_date=result["assignment_date"],
        sectors=sectors,
        message=result["message"],
    )


@router.get("/my-tables", response_model=list[dict])
def get_my_assigned_tables(
    assignment_date: date = Query(default=None, description="Date for assignments (defaults to today)"),
    shift: Optional[str] = Query(default=None, description="Filter by shift"),
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> list[dict]:
    """
    Get all tables in the sectors the waiter is assigned to.

    C8 PASS 3 REFACTOR: Thin controller — delegates to TableService.
    Useful for filtering which tables to show in the waiter's UI.
    """
    from rest_api.services.domain import TableService

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    waiter_id = int(ctx["sub"])
    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])
    target_date = assignment_date or date.today()

    service = TableService(db)
    return service.list_assigned_to_waiter(
        waiter_id=waiter_id,
        tenant_id=tenant_id,
        branch_ids=branch_ids,
        target_date=target_date,
        shift=shift,
    )
