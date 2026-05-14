"""
Scheduling Service - Employee Shifts and Attendance.

CLEAN-ARCH: Handles shift scheduling, template application,
clock-in/clock-out, and labor cost reporting.
"""

from __future__ import annotations

from datetime import date, time, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, selectinload

from rest_api.models import Shift, ShiftTemplate, ShiftTemplateItem, AttendanceLog, User
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError, ValidationError

logger = get_logger(__name__)

# Standard shift duration for overtime calculation
STANDARD_SHIFT_HOURS = 8.0


class SchedulingService:
    """Employee scheduling, attendance, and labor cost management."""

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Shift CRUD
    # =========================================================================

    def create_shift(
        self,
        user_id: int,
        branch_id: int,
        shift_date: date,
        start_time: time,
        end_time: time,
        role: str,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Create a single shift for an employee."""
        # Validate user exists
        user = self._db.scalar(select(User).where(User.id == user_id))
        if not user:
            raise NotFoundError("Usuario", user_id)

        # Check for overlapping shifts
        self._check_shift_overlap(user_id, shift_date, start_time, end_time)

        shift = Shift(
            tenant_id=tenant_id,
            branch_id=branch_id,
            user_id=user_id,
            shift_date=shift_date,
            start_time=start_time,
            end_time=end_time,
            role=role,
            notes=notes,
            status="SCHEDULED",
        )
        shift.set_created_by(actor_user_id, actor_email)
        self._db.add(shift)
        safe_commit(self._db)
        self._db.refresh(shift)

        logger.info(
            "Shift created",
            extra={"shift_id": shift.id, "user_id": user_id, "date": str(shift_date)},
        )
        return self._shift_to_dict(shift)

    def update_shift(
        self,
        shift_id: int,
        data: dict[str, Any],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Update a shift."""
        shift = self._db.scalar(
            select(Shift).where(
                Shift.id == shift_id,
                Shift.tenant_id == tenant_id,
                Shift.is_active.is_(True),
            )
        )
        if not shift:
            raise NotFoundError("Turno", shift_id, tenant_id=tenant_id)

        for key, value in data.items():
            if hasattr(shift, key) and key not in ("id", "tenant_id", "branch_id", "user_id"):
                setattr(shift, key, value)

        shift.set_updated_by(actor_user_id, actor_email)
        safe_commit(self._db)
        self._db.refresh(shift)
        return self._shift_to_dict(shift)

    def delete_shift(
        self,
        shift_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> None:
        """Soft delete a shift."""
        shift = self._db.scalar(
            select(Shift).where(
                Shift.id == shift_id,
                Shift.tenant_id == tenant_id,
                Shift.is_active.is_(True),
            )
        )
        if not shift:
            raise NotFoundError("Turno", shift_id, tenant_id=tenant_id)

        shift.soft_delete(actor_user_id, actor_email)
        safe_commit(self._db)

    def list_shifts(
        self,
        tenant_id: int,
        branch_id: int,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        user_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List shifts with optional filters."""
        stmt = select(Shift).where(
            Shift.tenant_id == tenant_id,
            Shift.branch_id == branch_id,
            Shift.is_active.is_(True),
        )
        if date_from:
            stmt = stmt.where(Shift.shift_date >= date_from)
        if date_to:
            stmt = stmt.where(Shift.shift_date <= date_to)
        if user_id:
            stmt = stmt.where(Shift.user_id == user_id)

        stmt = stmt.order_by(Shift.shift_date, Shift.start_time)
        stmt = stmt.offset(offset).limit(limit)

        shifts = self._db.scalars(stmt).all()
        return [self._shift_to_dict(s) for s in shifts]

    # =========================================================================
    # Template Operations
    # =========================================================================

    def create_template(
        self,
        name: str,
        branch_id: int,
        tenant_id: int,
        items: list[dict[str, Any]],
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Create a shift template with items."""
        template = ShiftTemplate(
            tenant_id=tenant_id,
            branch_id=branch_id,
            name=name,
        )
        template.set_created_by(actor_user_id, actor_email)
        self._db.add(template)
        self._db.flush()  # Get template ID

        for item_data in items:
            item = ShiftTemplateItem(
                template_id=template.id,
                day_of_week=item_data["day_of_week"],
                start_time=item_data["start_time"],
                end_time=item_data["end_time"],
                role=item_data["role"],
                min_staff=item_data.get("min_staff", 1),
            )
            item.set_created_by(actor_user_id, actor_email)
            self._db.add(item)

        safe_commit(self._db)
        self._db.refresh(template)

        logger.info(
            "Shift template created",
            extra={"template_id": template.id, "items_count": len(items)},
        )
        return self._template_to_dict(template)

    def list_templates(
        self,
        tenant_id: int,
        branch_id: int,
    ) -> list[dict[str, Any]]:
        """List shift templates for a branch."""
        stmt = (
            select(ShiftTemplate)
            .where(
                ShiftTemplate.tenant_id == tenant_id,
                ShiftTemplate.branch_id == branch_id,
                ShiftTemplate.is_active.is_(True),
            )
            .options(selectinload(ShiftTemplate.items))
        )
        templates = self._db.scalars(stmt).all()
        return [self._template_to_dict(t) for t in templates]

    def get_template(self, template_id: int, tenant_id: int) -> dict[str, Any]:
        """Get a specific template with items."""
        template = self._db.scalar(
            select(ShiftTemplate)
            .where(
                ShiftTemplate.id == template_id,
                ShiftTemplate.tenant_id == tenant_id,
                ShiftTemplate.is_active.is_(True),
            )
            .options(selectinload(ShiftTemplate.items))
        )
        if not template:
            raise NotFoundError("Plantilla de turno", template_id, tenant_id=tenant_id)
        return self._template_to_dict(template)

    def delete_template(
        self,
        template_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> None:
        """Soft delete a template."""
        template = self._db.scalar(
            select(ShiftTemplate).where(
                ShiftTemplate.id == template_id,
                ShiftTemplate.tenant_id == tenant_id,
                ShiftTemplate.is_active.is_(True),
            )
        )
        if not template:
            raise NotFoundError("Plantilla de turno", template_id, tenant_id=tenant_id)
        template.soft_delete(actor_user_id, actor_email)
        safe_commit(self._db)

    def apply_template(
        self,
        template_id: int,
        week_start_date: date,
        user_assignments: dict[str, list[int]],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> list[dict[str, Any]]:
        """Create shifts for a week based on template.

        Args:
            template_id: Template to apply.
            week_start_date: Monday of the target week.
            user_assignments: Mapping of role -> list of user_ids.
                e.g. {"WAITER": [1, 2], "KITCHEN": [3]}
            tenant_id: Tenant ID.
            actor_user_id: Acting user ID.
            actor_email: Acting user email.

        Returns:
            List of created shifts.
        """
        template = self._db.scalar(
            select(ShiftTemplate)
            .where(
                ShiftTemplate.id == template_id,
                ShiftTemplate.tenant_id == tenant_id,
                ShiftTemplate.is_active.is_(True),
            )
            .options(selectinload(ShiftTemplate.items))
        )
        if not template:
            raise NotFoundError("Plantilla de turno", template_id, tenant_id=tenant_id)

        # Ensure week_start_date is a Monday
        if week_start_date.weekday() != 0:
            raise ValidationError(
                "La fecha de inicio debe ser un lunes.",
                field="week_start_date",
            )

        created_shifts = []
        for item in template.items:
            if not item.is_active:
                continue

            target_date = week_start_date + timedelta(days=item.day_of_week)
            assigned_users = user_assignments.get(item.role, [])

            for uid in assigned_users:
                shift = Shift(
                    tenant_id=tenant_id,
                    branch_id=template.branch_id,
                    user_id=uid,
                    shift_date=target_date,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    role=item.role,
                    status="SCHEDULED",
                )
                shift.set_created_by(actor_user_id, actor_email)
                self._db.add(shift)
                created_shifts.append(shift)

        safe_commit(self._db)
        for s in created_shifts:
            self._db.refresh(s)

        logger.info(
            "Template applied",
            extra={
                "template_id": template_id,
                "week_start": str(week_start_date),
                "shifts_created": len(created_shifts),
            },
        )
        return [self._shift_to_dict(s) for s in created_shifts]

    # =========================================================================
    # Attendance Operations
    # =========================================================================

    def clock_in(
        self,
        user_id: int,
        branch_id: int,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Record clock-in for an employee.

        Automatically links to a matching scheduled shift if one exists.
        """
        # Check not already clocked in
        existing = self._db.scalar(
            select(AttendanceLog).where(
                AttendanceLog.user_id == user_id,
                AttendanceLog.tenant_id == tenant_id,
                AttendanceLog.status == "CLOCKED_IN",
                AttendanceLog.is_active.is_(True),
            )
        )
        if existing:
            raise ValidationError(
                "El empleado ya tiene un registro de entrada activo.",
                field="user_id",
            )

        now = datetime.now(timezone.utc)

        # Try to find matching scheduled shift
        today = now.date()
        matching_shift = self._db.scalar(
            select(Shift).where(
                Shift.user_id == user_id,
                Shift.branch_id == branch_id,
                Shift.shift_date == today,
                Shift.is_active.is_(True),
                Shift.status.in_(["SCHEDULED", "CONFIRMED"]),
            )
        )

        log = AttendanceLog(
            tenant_id=tenant_id,
            branch_id=branch_id,
            user_id=user_id,
            shift_id=matching_shift.id if matching_shift else None,
            clock_in=now,
            status="CLOCKED_IN",
        )
        log.set_created_by(user_id, "")
        self._db.add(log)

        # Update shift status
        if matching_shift:
            matching_shift.status = "IN_PROGRESS"

        safe_commit(self._db)
        self._db.refresh(log)

        logger.info(
            "Clock-in recorded",
            extra={"user_id": user_id, "attendance_id": log.id},
        )
        return self._attendance_to_dict(log)

    def clock_out(
        self,
        user_id: int,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Record clock-out and calculate hours worked + overtime."""
        log = self._db.scalar(
            select(AttendanceLog).where(
                AttendanceLog.user_id == user_id,
                AttendanceLog.tenant_id == tenant_id,
                AttendanceLog.status == "CLOCKED_IN",
                AttendanceLog.is_active.is_(True),
            )
        )
        if not log:
            raise ValidationError(
                "No hay registro de entrada activo para este empleado.",
                field="user_id",
            )

        now = datetime.now(timezone.utc)
        log.clock_out = now
        log.status = "CLOCKED_OUT"

        # Calculate hours worked
        delta = now - log.clock_in
        hours = delta.total_seconds() / 3600
        log.hours_worked = round(hours, 2)

        # Calculate overtime (hours beyond standard shift)
        if hours > STANDARD_SHIFT_HOURS:
            log.overtime_hours = round(hours - STANDARD_SHIFT_HOURS, 2)
        else:
            log.overtime_hours = 0.0

        log.set_updated_by(user_id, "")

        # Update linked shift status
        if log.shift_id:
            shift = self._db.scalar(select(Shift).where(Shift.id == log.shift_id))
            if shift:
                shift.status = "COMPLETED"

        safe_commit(self._db)
        self._db.refresh(log)

        logger.info(
            "Clock-out recorded",
            extra={
                "user_id": user_id,
                "attendance_id": log.id,
                "hours_worked": log.hours_worked,
                "overtime": log.overtime_hours,
            },
        )
        return self._attendance_to_dict(log)

    def list_attendance(
        self,
        tenant_id: int,
        branch_id: int,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        user_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List attendance logs with optional filters."""
        stmt = select(AttendanceLog).where(
            AttendanceLog.tenant_id == tenant_id,
            AttendanceLog.branch_id == branch_id,
            AttendanceLog.is_active.is_(True),
        )
        if date_from:
            stmt = stmt.where(func.date(AttendanceLog.clock_in) >= date_from)
        if date_to:
            stmt = stmt.where(func.date(AttendanceLog.clock_in) <= date_to)
        if user_id:
            stmt = stmt.where(AttendanceLog.user_id == user_id)

        stmt = stmt.order_by(AttendanceLog.clock_in.desc())
        stmt = stmt.offset(offset).limit(limit)

        logs = self._db.scalars(stmt).all()
        return [self._attendance_to_dict(l) for l in logs]

    # =========================================================================
    # Schedule Views
    # =========================================================================

    def get_weekly_schedule(
        self,
        branch_id: int,
        week_start: date,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Get weekly schedule view for a branch.

        Returns shifts grouped by date and user.
        """
        week_end = week_start + timedelta(days=6)

        stmt = (
            select(Shift)
            .where(
                Shift.tenant_id == tenant_id,
                Shift.branch_id == branch_id,
                Shift.shift_date >= week_start,
                Shift.shift_date <= week_end,
                Shift.is_active.is_(True),
            )
            .order_by(Shift.shift_date, Shift.start_time)
        )
        shifts = self._db.scalars(stmt).all()

        # Group by date
        schedule_by_date: dict[str, list[dict[str, Any]]] = {}
        for s in shifts:
            date_key = s.shift_date.isoformat()
            if date_key not in schedule_by_date:
                schedule_by_date[date_key] = []
            schedule_by_date[date_key].append(self._shift_to_dict(s))

        return {
            "branch_id": branch_id,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "schedule": schedule_by_date,
            "total_shifts": len(shifts),
        }

    # =========================================================================
    # Reports
    # =========================================================================

    def get_labor_cost_report(
        self,
        branch_id: int,
        date_from: date,
        date_to: date,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Total hours, overtime, grouped by role."""
        stmt = (
            select(
                Shift.role,
                func.count(Shift.id).label("shift_count"),
            )
            .where(
                Shift.tenant_id == tenant_id,
                Shift.branch_id == branch_id,
                Shift.shift_date >= date_from,
                Shift.shift_date <= date_to,
                Shift.is_active.is_(True),
            )
            .group_by(Shift.role)
        )
        shift_rows = self._db.execute(stmt).all()

        # Attendance totals
        att_stmt = (
            select(
                func.sum(AttendanceLog.hours_worked).label("total_hours"),
                func.sum(AttendanceLog.overtime_hours).label("total_overtime"),
                func.count(AttendanceLog.id).label("attendance_count"),
            )
            .where(
                AttendanceLog.tenant_id == tenant_id,
                AttendanceLog.branch_id == branch_id,
                func.date(AttendanceLog.clock_in) >= date_from,
                func.date(AttendanceLog.clock_in) <= date_to,
                AttendanceLog.is_active.is_(True),
                AttendanceLog.status == "CLOCKED_OUT",
            )
        )
        att_row = self._db.execute(att_stmt).first()

        shifts_by_role = []
        for row in shift_rows:
            shifts_by_role.append({
                "role": row.role,
                "shift_count": row.shift_count,
            })

        return {
            "branch_id": branch_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "shifts_by_role": shifts_by_role,
            "attendance": {
                "total_hours": round(att_row.total_hours or 0, 2) if att_row else 0,
                "total_overtime_hours": round(att_row.total_overtime or 0, 2) if att_row else 0,
                "total_records": att_row.attendance_count if att_row else 0,
            },
        }

    # =========================================================================
    # Validation Helpers
    # =========================================================================

    def _check_shift_overlap(
        self,
        user_id: int,
        shift_date: date,
        start_time: time,
        end_time: time,
        exclude_shift_id: int | None = None,
    ) -> None:
        """Check for overlapping shifts for same user on same date."""
        stmt = select(Shift).where(
            Shift.user_id == user_id,
            Shift.shift_date == shift_date,
            Shift.is_active.is_(True),
            # Overlap check: new start < existing end AND new end > existing start
            Shift.start_time < end_time,
            Shift.end_time > start_time,
        )
        if exclude_shift_id:
            stmt = stmt.where(Shift.id != exclude_shift_id)

        overlapping = self._db.scalar(stmt)
        if overlapping:
            raise ValidationError(
                f"El turno se superpone con otro turno existente "
                f"({overlapping.start_time}-{overlapping.end_time}).",
                field="start_time",
            )

    # =========================================================================
    # Serialization Helpers
    # =========================================================================

    def _shift_to_dict(self, shift: Shift) -> dict[str, Any]:
        """Convert Shift to dict."""
        return {
            "id": shift.id,
            "tenant_id": shift.tenant_id,
            "branch_id": shift.branch_id,
            "user_id": shift.user_id,
            "shift_date": shift.shift_date.isoformat(),
            "start_time": shift.start_time.isoformat(),
            "end_time": shift.end_time.isoformat(),
            "role": shift.role,
            "notes": shift.notes,
            "status": shift.status,
            "is_active": shift.is_active,
            "created_at": shift.created_at.isoformat() if shift.created_at else None,
        }

    def _template_to_dict(self, template: ShiftTemplate) -> dict[str, Any]:
        """Convert ShiftTemplate to dict with items."""
        items = []
        if template.items:
            for item in template.items:
                if item.is_active:
                    items.append({
                        "id": item.id,
                        "day_of_week": item.day_of_week,
                        "start_time": item.start_time.isoformat(),
                        "end_time": item.end_time.isoformat(),
                        "role": item.role,
                        "min_staff": item.min_staff,
                    })
        return {
            "id": template.id,
            "tenant_id": template.tenant_id,
            "branch_id": template.branch_id,
            "name": template.name,
            "items": items,
            "is_active": template.is_active,
            "created_at": template.created_at.isoformat() if template.created_at else None,
        }

    def _attendance_to_dict(self, log: AttendanceLog) -> dict[str, Any]:
        """Convert AttendanceLog to dict."""
        return {
            "id": log.id,
            "tenant_id": log.tenant_id,
            "branch_id": log.branch_id,
            "user_id": log.user_id,
            "shift_id": log.shift_id,
            "clock_in": log.clock_in.isoformat() if log.clock_in else None,
            "clock_out": log.clock_out.isoformat() if log.clock_out else None,
            "hours_worked": log.hours_worked,
            "overtime_hours": log.overtime_hours,
            "status": log.status,
            "notes": log.notes,
            "is_active": log.is_active,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
