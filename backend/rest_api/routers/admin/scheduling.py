"""
Employee Scheduling endpoints.

CLEAN-ARCH: Thin router that delegates to SchedulingService.
Handles: shift CRUD, templates, attendance (clock-in/out), schedule views, labor cost.
"""

from datetime import date, time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain import SchedulingService
from shared.utils.schemas import (
    ShiftOutput,
    ShiftTemplateOutput,
    AttendanceLogOutput,
    WeeklyScheduleOutput,
    LaborCostReportOutput,
)


router = APIRouter(tags=["admin-scheduling"])


# =============================================================================
# Request Schemas
# =============================================================================


class ShiftCreate(BaseModel):
    user_id: int
    branch_id: int
    shift_date: date
    start_time: time
    end_time: time
    role: str = Field(pattern="^(WAITER|KITCHEN|MANAGER)$")
    notes: Optional[str] = None


class ShiftUpdate(BaseModel):
    shift_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    role: Optional[str] = Field(default=None, pattern="^(WAITER|KITCHEN|MANAGER)$")
    status: Optional[str] = Field(
        default=None, pattern="^(SCHEDULED|CONFIRMED|IN_PROGRESS|COMPLETED|ABSENT)$"
    )
    notes: Optional[str] = None


class ShiftTemplateItemCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    role: str = Field(pattern="^(WAITER|KITCHEN|MANAGER)$")
    min_staff: int = Field(default=1, ge=1)


class ShiftTemplateCreate(BaseModel):
    name: str = Field(min_length=1)
    branch_id: int
    items: list[ShiftTemplateItemCreate]


class ApplyTemplateRequest(BaseModel):
    template_id: int
    week_start_date: date
    user_assignments: dict[str, list[int]]  # role -> [user_ids]


class ClockInRequest(BaseModel):
    user_id: int
    branch_id: int


class ClockOutRequest(BaseModel):
    user_id: int


# =============================================================================
# Shift CRUD
# =============================================================================


@router.get("/shifts", response_model=list[ShiftOutput])
def list_shifts(
    branch_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List shifts for a branch with optional date and user filters."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = SchedulingService(db)
    return service.list_shifts(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        limit=limit,
        offset=offset,
    )


@router.post("/shifts", status_code=201, response_model=ShiftOutput)
def create_shift(
    body: ShiftCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a single shift for an employee."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = SchedulingService(db)
    return service.create_shift(
        user_id=body.user_id,
        branch_id=body.branch_id,
        shift_date=body.shift_date,
        start_time=body.start_time,
        end_time=body.end_time,
        role=body.role,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
        notes=body.notes,
    )


@router.patch("/shifts/{shift_id}", response_model=ShiftOutput)
def update_shift(
    shift_id: int,
    body: ShiftUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update a shift."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    return service.update_shift(
        shift_id=shift_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.delete("/shifts/{shift_id}", status_code=204)
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a shift."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    service.delete_shift(
        shift_id=shift_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Template Operations
# =============================================================================


@router.get("/shift-templates", response_model=list[ShiftTemplateOutput])
def list_templates(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List shift templates for a branch."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = SchedulingService(db)
    return service.list_templates(ctx.tenant_id, branch_id)


@router.get("/shift-templates/{template_id}", response_model=ShiftTemplateOutput)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a specific shift template with items."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    return service.get_template(template_id, ctx.tenant_id)


@router.post("/shift-templates", status_code=201, response_model=ShiftTemplateOutput)
def create_template(
    body: ShiftTemplateCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a shift template with items."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = SchedulingService(db)
    return service.create_template(
        name=body.name,
        branch_id=body.branch_id,
        tenant_id=ctx.tenant_id,
        items=[item.model_dump() for item in body.items],
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.delete("/shift-templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a shift template."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    service.delete_template(
        template_id=template_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.post("/shifts/apply-template", status_code=201, response_model=list[ShiftOutput])
def apply_template(
    body: ApplyTemplateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Generate shifts for a week from a template."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    return service.apply_template(
        template_id=body.template_id,
        week_start_date=body.week_start_date,
        user_assignments=body.user_assignments,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Attendance
# =============================================================================


@router.post("/attendance/clock-in", status_code=201, response_model=AttendanceLogOutput)
def clock_in(
    body: ClockInRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Record clock-in for an employee."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = SchedulingService(db)
    return service.clock_in(
        user_id=body.user_id,
        branch_id=body.branch_id,
        tenant_id=ctx.tenant_id,
    )


@router.post("/attendance/clock-out", response_model=AttendanceLogOutput)
def clock_out(
    body: ClockOutRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Record clock-out for an employee. Calculates hours and overtime."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = SchedulingService(db)
    return service.clock_out(
        user_id=body.user_id,
        tenant_id=ctx.tenant_id,
    )


@router.get("/attendance", response_model=list[AttendanceLogOutput])
def list_attendance(
    branch_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List attendance logs for a branch."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = SchedulingService(db)
    return service.list_attendance(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        limit=limit,
        offset=offset,
    )


# =============================================================================
# Schedule Views & Reports
# =============================================================================


@router.get("/scheduling/weekly", response_model=WeeklyScheduleOutput)
def get_weekly_schedule(
    branch_id: int,
    week_start: date,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get weekly schedule view for a branch."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = SchedulingService(db)
    return service.get_weekly_schedule(
        branch_id=branch_id,
        week_start=week_start,
        tenant_id=ctx.tenant_id,
    )


@router.get("/scheduling/labor-cost", response_model=LaborCostReportOutput)
def get_labor_cost_report(
    branch_id: int,
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Labor cost report: total hours, overtime, by role."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = SchedulingService(db)
    return service.get_labor_cost_report(
        branch_id=branch_id,
        date_from=date_from,
        date_to=date_to,
        tenant_id=ctx.tenant_id,
    )
