"""
Floor Plan endpoints.

CLEAN-ARCH: Thin router that delegates to FloorPlanService.
Handles: floor plan CRUD, table positioning, live view, auto-generation.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain.floor_plan_service import FloorPlanService
from shared.utils.schemas import FloorPlanOutput, FloorPlanLiveOutput


router = APIRouter(tags=["admin-floor-plan"])


# =============================================================================
# Request Schemas
# =============================================================================


class FloorPlanCreate(BaseModel):
    branch_id: int
    name: str = Field(min_length=1)
    width: int = Field(default=800, ge=100, le=3000)
    height: int = Field(default=600, ge=100, le=3000)
    background_image: Optional[str] = None
    is_default: bool = False
    sector_id: Optional[int] = None


class FloorPlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    width: Optional[int] = Field(default=None, ge=100, le=3000)
    height: Optional[int] = Field(default=None, ge=100, le=3000)
    background_image: Optional[str] = None
    is_default: Optional[bool] = None
    sector_id: Optional[int] = None


class TablePosition(BaseModel):
    table_id: int
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(default=60, ge=10, le=300)
    height: float = Field(default=60, ge=10, le=300)
    rotation: float = Field(default=0, ge=0, lt=360)
    shape: str = Field(default="RECTANGLE", pattern="^(RECTANGLE|CIRCLE|SQUARE)$")
    label: Optional[str] = None


class BatchTablePositions(BaseModel):
    positions: list[TablePosition]


# =============================================================================
# Floor Plan CRUD
# =============================================================================


@router.get("/floor-plans", response_model=list[FloorPlanOutput])
def list_floor_plans(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List floor plans for a branch."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = FloorPlanService(db)
    return service.list_plans(branch_id=branch_id, tenant_id=ctx.tenant_id)


@router.get("/floor-plans/{plan_id}", response_model=FloorPlanOutput)
def get_floor_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a floor plan with table positions."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    return service.get_plan(plan_id, ctx.tenant_id)


@router.post("/floor-plans", status_code=201, response_model=FloorPlanOutput)
def create_floor_plan(
    body: FloorPlanCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a new floor plan."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = FloorPlanService(db)
    return service.create_plan(
        branch_id=body.branch_id,
        name=body.name,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
        width=body.width,
        height=body.height,
        background_image=body.background_image,
        is_default=body.is_default,
        sector_id=body.sector_id,
    )


@router.patch("/floor-plans/{plan_id}", response_model=FloorPlanOutput)
def update_floor_plan(
    plan_id: int,
    body: FloorPlanUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update floor plan metadata."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    return service.update_plan(
        plan_id=plan_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.delete("/floor-plans/{plan_id}", status_code=204)
def delete_floor_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a floor plan."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    service.delete_plan(
        plan_id=plan_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Table Positioning
# =============================================================================


@router.put("/floor-plans/{plan_id}/tables", response_model=FloorPlanOutput)
def update_table_positions(
    plan_id: int,
    body: BatchTablePositions,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Batch update all table positions on a floor plan."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    return service.update_table_positions(
        plan_id=plan_id,
        positions=[p.model_dump() for p in body.positions],
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Live View
# =============================================================================


@router.get("/floor-plans/{plan_id}/live", response_model=FloorPlanLiveOutput)
def get_live_floor_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Floor plan with real-time table statuses."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    return service.get_plan_with_status(plan_id, ctx.tenant_id)


# =============================================================================
# Auto-Generate
# =============================================================================


@router.post("/floor-plans/{plan_id}/auto-generate", response_model=FloorPlanOutput)
def auto_generate_layout(
    plan_id: int,
    sector_id: int | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Auto-generate grid layout from existing tables."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FloorPlanService(db)
    return service.auto_generate(
        plan_id=plan_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
        sector_id=sector_id,
    )
