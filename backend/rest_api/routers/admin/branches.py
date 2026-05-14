"""
Branch management endpoints.

PERF-BGTASK-01: Uses FastAPI BackgroundTasks for event publishing.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from rest_api.routers.admin._base import (
    Depends, Session, select,
    get_db, current_user, Branch,
    get_user_id, get_user_email, publish_entity_deleted,
    require_admin, require_admin_or_manager,
    is_admin, validate_branch_access,
)
from shared.utils.admin_schemas import BranchOutput, BranchCreate, BranchUpdate
from rest_api.services.domain.branch_service import BranchService


router = APIRouter(tags=["admin-branches"])


@router.get("/branches", response_model=list[BranchOutput])
def list_branches(
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[BranchOutput]:
    """List all branches for the user's tenant.

    MANAGER users only see branches they have access to.
    ADMIN users see all branches in the tenant.
    """
    query = select(Branch).where(Branch.tenant_id == user["tenant_id"])

    # MANAGER branch isolation: only see assigned branches
    if not is_admin(user):
        user_branch_ids = user.get("branch_ids", [])
        if not user_branch_ids:
            return []
        query = query.where(Branch.id.in_(user_branch_ids))

    if not include_deleted:
        query = query.where(Branch.is_active.is_(True))

    branches = db.execute(query.order_by(Branch.name)).scalars().all()
    return [BranchOutput.model_validate(b) for b in branches]


@router.get("/branches/{branch_id}", response_model=BranchOutput)
def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> BranchOutput:
    """Get a specific branch.

    MANAGER users can only access branches they have access to.
    """
    # MANAGER branch isolation
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    branch = db.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.tenant_id == user["tenant_id"],
            Branch.is_active.is_(True),
        )
    )
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )
    return BranchOutput.model_validate(branch)


@router.post("/branches", response_model=BranchOutput, status_code=status.HTTP_201_CREATED)
def create_branch(
    body: BranchCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin),
) -> BranchOutput:
    """Create a new branch. Requires ADMIN role.

    Delegates to BranchService.create() for end-to-end handling
    (slug uniqueness validation, persistence, audit-friendly commit,
    and lifecycle hooks).
    """
    service = BranchService(db)
    return service.create(
        data=body.model_dump(),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.patch("/branches/{branch_id}", response_model=BranchOutput)
def update_branch(
    branch_id: int,
    body: BranchUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> BranchOutput:
    """Update a branch. Requires ADMIN or MANAGER role.

    MANAGER users can only update branches they have access to.

    Delegates to BranchService.update() for end-to-end handling
    (existence + slug uniqueness validation, persistence, audit-friendly
    commit, and lifecycle hooks).
    """
    # MANAGER branch isolation (router-level RBAC, not service concern)
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    service = BranchService(db)
    return service.update(
        entity_id=branch_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(
    branch_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin),
) -> None:
    """Soft delete a branch. Requires ADMIN role.

    PERF-BGTASK-01: Uses BackgroundTasks for async event publishing.

    Note: kept inline (not delegated to BranchService.delete()) because the
    service's _after_delete hook publishes the event synchronously, while
    this endpoint must use BackgroundTasks for proper lifecycle management.
    Refactoring this requires extending the service to accept a
    BackgroundTasks-aware publisher; tracked separately.
    """
    from rest_api.services.crud.soft_delete import soft_delete

    branch = db.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.tenant_id == user["tenant_id"],
            Branch.is_active.is_(True),
        )
    )
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    branch_name = branch.name
    tenant_id = branch.tenant_id

    soft_delete(db, branch, get_user_id(user), get_user_email(user))

    # PERF-BGTASK-01: Pass BackgroundTasks for proper lifecycle management
    publish_entity_deleted(
        tenant_id=tenant_id,
        entity_type="branch",
        entity_id=branch_id,
        entity_name=branch_name,
        actor_user_id=get_user_id(user),
        background_tasks=background_tasks,
    )
