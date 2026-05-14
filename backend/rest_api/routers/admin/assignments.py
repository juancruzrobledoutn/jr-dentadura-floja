"""
Waiter-sector assignment endpoints for daily shift management.
"""

from datetime import date
from fastapi import APIRouter

from rest_api.routers.admin._base import (
    Depends, HTTPException, Session, select, or_,
    joinedload,
    get_db, current_user, User, Branch, BranchSector,
    UserBranchRole, WaiterSectorAssignment,
    soft_delete, set_created_by,
    get_user_email,
    require_admin_or_manager,
    is_admin, validate_branch_access,
)
from rest_api.services.domain import AssignmentService
from shared.utils.admin_schemas import (
    BranchAssignmentOverview, SectorWithWaiters,
    WaiterSectorBulkAssignment, WaiterSectorBulkResult,
    WaiterSectorAssignmentOutput,
)


router = APIRouter(tags=["admin-assignments"])


@router.get("/assignments", response_model=BranchAssignmentOverview)
async def get_branch_assignments(
    branch_id: int,
    assignment_date: date,
    shift: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> BranchAssignmentOverview:
    """
    Get all waiter-sector assignments for a branch on a given date.
    Returns sectors with their assigned waiters and unassigned waiters.

    MANAGER users can only see assignments for their assigned branches.
    """
    tenant_id = user["tenant_id"]

    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    # Get branch
    branch = db.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.tenant_id == tenant_id,
            Branch.is_active.is_(True),
        )
    )
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Get all sectors for this branch (global + branch-specific)
    sectors = db.execute(
        select(BranchSector).where(
            BranchSector.tenant_id == tenant_id,
            BranchSector.is_active.is_(True),
            or_(
                BranchSector.branch_id == branch_id,
                BranchSector.branch_id.is_(None),  # Global sectors
            ),
        ).order_by(BranchSector.display_order)
    ).scalars().all()

    # Get all waiters in this branch
    waiter_roles = db.execute(
        select(UserBranchRole).where(
            UserBranchRole.tenant_id == tenant_id,
            UserBranchRole.branch_id == branch_id,
            UserBranchRole.role == "WAITER",
        ).options(joinedload(UserBranchRole.user))
    ).scalars().unique().all()

    all_waiters = {
        role.user_id: {
            "id": role.user_id,
            "name": f"{role.user.first_name or ''} {role.user.last_name or ''}".strip(),
            "email": role.user.email,
        }
        for role in waiter_roles
        if role.user and role.user.is_active
    }

    # Get assignments for this date
    query = select(WaiterSectorAssignment).where(
        WaiterSectorAssignment.tenant_id == tenant_id,
        WaiterSectorAssignment.branch_id == branch_id,
        WaiterSectorAssignment.assignment_date == assignment_date,
        WaiterSectorAssignment.is_active.is_(True),
    )
    if shift:
        query = query.where(
            or_(
                WaiterSectorAssignment.shift == shift,
                WaiterSectorAssignment.shift.is_(None),  # All-day assignments
            )
        )

    assignments = db.execute(query).scalars().all()

    # Build sector-to-waiters mapping
    sector_waiters: dict[int, list[dict]] = {s.id: [] for s in sectors}
    assigned_waiter_ids: set[int] = set()

    for assignment in assignments:
        if assignment.sector_id in sector_waiters and assignment.waiter_id in all_waiters:
            sector_waiters[assignment.sector_id].append(all_waiters[assignment.waiter_id])
            assigned_waiter_ids.add(assignment.waiter_id)

    # Build response
    sectors_with_waiters = [
        SectorWithWaiters(
            sector_id=s.id,
            sector_name=s.name,
            sector_prefix=s.prefix,
            waiters=sector_waiters.get(s.id, []),
        )
        for s in sectors
    ]

    unassigned_waiters = [
        waiter for waiter_id, waiter in all_waiters.items()
        if waiter_id not in assigned_waiter_ids
    ]

    return BranchAssignmentOverview(
        branch_id=branch_id,
        branch_name=branch.name,
        assignment_date=assignment_date,
        shift=shift,
        sectors=sectors_with_waiters,
        unassigned_waiters=unassigned_waiters,
    )


@router.post("/assignments/bulk", response_model=WaiterSectorBulkResult)
async def create_bulk_assignments(
    data: WaiterSectorBulkAssignment,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> WaiterSectorBulkResult:
    """
    Create multiple waiter-sector assignments at once.
    Skips duplicates (same waiter+sector+date+shift).

    MANAGER users can only create assignments for their assigned branches.

    Expected format:
    {
        "branch_id": 1,
        "assignment_date": "2026-01-10",
        "shift": null,
        "assignments": [
            {"sector_id": 1, "waiter_ids": [1, 2, 3]},
            {"sector_id": 2, "waiter_ids": [4, 5]}
        ]
    }
    """
    tenant_id = user["tenant_id"]
    user_id = int(user["sub"])
    user_email = get_user_email(user)

    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, data.branch_id)

    # CLEAN-ARCH: atomic bulk create delegated to AssignmentService.
    # All staging happens in-memory; single safe_commit() at the end with
    # rollback-on-failure. NotFoundError (unknown branch) maps to 404 via
    # global handler; the router stays thin.
    service = AssignmentService(db)
    result = service.create_bulk(
        branch_id=data.branch_id,
        assignment_date=data.assignment_date,
        shift=data.shift,
        assignments=data.assignments,
        tenant_id=tenant_id,
        user_id=user_id,
        user_email=user_email,
    )

    created = result["created"]
    skipped = result["skipped_count"]
    sector_map = result["sector_map"]
    waiter_map = result["waiter_map"]

    # Build output DTO from refreshed entities + pre-resolved maps
    outputs = []
    for a in created:
        sector = sector_map.get(a.sector_id)
        waiter = waiter_map.get(a.waiter_id)
        if sector and waiter:
            outputs.append(WaiterSectorAssignmentOutput(
                id=a.id,
                tenant_id=a.tenant_id,
                branch_id=a.branch_id,
                sector_id=a.sector_id,
                sector_name=sector.name,
                sector_prefix=sector.prefix,
                waiter_id=a.waiter_id,
                waiter_name=f"{waiter.first_name or ''} {waiter.last_name or ''}".strip(),
                waiter_email=waiter.email,
                assignment_date=a.assignment_date,
                shift=a.shift,
                is_active=a.is_active,
            ))

    return WaiterSectorBulkResult(
        created_count=len(created),
        skipped_count=skipped,
        assignments=outputs,
    )


@router.delete("/assignments-bulk")
async def delete_bulk_assignments(
    branch_id: int,
    assignment_date: date,
    shift: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> dict:
    """
    Delete all assignments for a branch on a given date (and optionally shift).
    Useful for clearing a day's assignments before reassigning.

    MANAGER users can only delete assignments for their assigned branches.
    """
    tenant_id = user["tenant_id"]
    user_id = int(user["sub"])
    user_email = get_user_email(user)

    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    query = select(WaiterSectorAssignment).where(
        WaiterSectorAssignment.tenant_id == tenant_id,
        WaiterSectorAssignment.branch_id == branch_id,
        WaiterSectorAssignment.assignment_date == assignment_date,
        WaiterSectorAssignment.is_active.is_(True),
    )
    if shift:
        query = query.where(WaiterSectorAssignment.shift == shift)

    assignments = db.execute(query).scalars().all()

    for a in assignments:
        soft_delete(db, a, user_id, user_email)

    db.commit()

    return {"message": f"Deleted {len(assignments)} assignments", "deleted_count": len(assignments)}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> dict:
    """Delete a single waiter-sector assignment.

    MANAGER users can only delete assignments from their assigned branches.
    """
    tenant_id = user["tenant_id"]

    assignment = db.scalar(
        select(WaiterSectorAssignment).where(
            WaiterSectorAssignment.id == assignment_id,
            WaiterSectorAssignment.tenant_id == tenant_id,
            WaiterSectorAssignment.is_active.is_(True),
        )
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, assignment.branch_id)

    soft_delete(db, assignment, int(user["sub"]), get_user_email(user))
    db.commit()

    return {"message": "Assignment deleted", "id": assignment_id}


@router.post("/assignments/copy")
async def copy_assignments(
    branch_id: int,
    from_date: date,
    to_date: date,
    shift: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> WaiterSectorBulkResult:
    """
    Copy all assignments from one date to another.
    Useful for repeating yesterday's assignments.

    MANAGER users can only copy assignments for their assigned branches.
    """
    tenant_id = user["tenant_id"]
    user_id = int(user["sub"])
    user_email = get_user_email(user)

    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    # CLEAN-ARCH: atomic copy-from-previous-day delegated to AssignmentService.
    service = AssignmentService(db)
    result = service.copy_from_previous(
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
        shift=shift,
        tenant_id=tenant_id,
        user_id=user_id,
        user_email=user_email,
    )

    created = result["created"]
    skipped = result["skipped_count"]
    sector_map = result["sector_map"]
    waiter_map = result["waiter_map"]

    if not created and skipped == 0:
        return WaiterSectorBulkResult(created_count=0, skipped_count=0, assignments=[])

    outputs = []
    for a in created:
        sector = sector_map.get(a.sector_id)
        waiter = waiter_map.get(a.waiter_id)
        if sector and waiter:
            outputs.append(WaiterSectorAssignmentOutput(
                id=a.id,
                tenant_id=a.tenant_id,
                branch_id=a.branch_id,
                sector_id=a.sector_id,
                sector_name=sector.name,
                sector_prefix=sector.prefix,
                waiter_id=a.waiter_id,
                waiter_name=f"{waiter.first_name or ''} {waiter.last_name or ''}".strip(),
                waiter_email=waiter.email,
                assignment_date=a.assignment_date,
                shift=a.shift,
                is_active=a.is_active,
            ))

    return WaiterSectorBulkResult(
        created_count=len(created),
        skipped_count=skipped,
        assignments=outputs,
    )
