"""
Floor Plan Service - Visual Table Layout Management.

CLEAN-ARCH: Handles floor plan CRUD, table positioning,
real-time status integration, and auto-generation of layouts.
"""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models.floor_plan import FloorPlan, FloorPlanTable
from rest_api.models.table import Table, TableSession
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError, ValidationError

logger = get_logger(__name__)


class FloorPlanService:
    """Floor plan visual layout management."""

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Floor Plan CRUD
    # =========================================================================

    def create_plan(
        self,
        branch_id: int,
        name: str,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
        *,
        width: int = 800,
        height: int = 600,
        background_image: str | None = None,
        is_default: bool = False,
        sector_id: int | None = None,
    ) -> dict[str, Any]:
        """Create a new floor plan."""
        # If marking as default, unset other defaults for this branch
        if is_default:
            self._unset_branch_defaults(branch_id, tenant_id)

        plan = FloorPlan(
            tenant_id=tenant_id,
            branch_id=branch_id,
            name=name,
            width=width,
            height=height,
            background_image=background_image,
            is_default=is_default,
            sector_id=sector_id,
        )
        plan.set_created_by(actor_user_id, actor_email)
        self._db.add(plan)
        safe_commit(self._db)
        self._db.refresh(plan)

        logger.info(
            "Floor plan created",
            extra={"plan_id": plan.id, "branch_id": branch_id},
        )
        return self._plan_to_dict(plan)

    def get_plan(self, plan_id: int, tenant_id: int) -> dict[str, Any]:
        """Get a floor plan with table positions."""
        plan = self._db.scalar(
            select(FloorPlan)
            .where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
            .options(selectinload(FloorPlan.tables))
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)
        return self._plan_to_dict(plan)

    def update_plan(
        self,
        plan_id: int,
        data: dict[str, Any],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Update floor plan metadata."""
        plan = self._db.scalar(
            select(FloorPlan).where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)

        allowed_fields = {"name", "width", "height", "background_image", "is_default", "sector_id"}
        for key, value in data.items():
            if key in allowed_fields:
                setattr(plan, key, value)

        if data.get("is_default"):
            self._unset_branch_defaults(plan.branch_id, tenant_id, exclude_id=plan_id)

        plan.set_updated_by(actor_user_id, actor_email)
        safe_commit(self._db)
        self._db.refresh(plan)
        return self._plan_to_dict(plan)

    def delete_plan(
        self,
        plan_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> None:
        """Soft delete a floor plan."""
        plan = self._db.scalar(
            select(FloorPlan)
            .where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
            .options(selectinload(FloorPlan.tables))
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)

        # Soft delete child table positions too
        for fpt in plan.tables:
            if fpt.is_active:
                fpt.soft_delete(actor_user_id, actor_email)

        plan.soft_delete(actor_user_id, actor_email)
        safe_commit(self._db)

    def list_plans(
        self,
        branch_id: int,
        tenant_id: int,
    ) -> list[dict[str, Any]]:
        """List floor plans for a branch."""
        stmt = (
            select(FloorPlan)
            .where(
                FloorPlan.branch_id == branch_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
            .options(selectinload(FloorPlan.tables))
            .order_by(FloorPlan.name)
        )
        plans = self._db.scalars(stmt).all()
        return [self._plan_to_dict(p) for p in plans]

    # =========================================================================
    # Table Positioning
    # =========================================================================

    def update_table_positions(
        self,
        plan_id: int,
        positions: list[dict[str, Any]],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Batch update all table positions on a floor plan.

        Each position dict: {table_id, x, y, width?, height?, rotation?, shape?, label?}
        """
        plan = self._db.scalar(
            select(FloorPlan)
            .where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
            .options(selectinload(FloorPlan.tables))
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)

        # Build lookup of existing floor plan tables
        existing_by_table_id: dict[int, FloorPlanTable] = {}
        for fpt in plan.tables:
            if fpt.is_active:
                existing_by_table_id[fpt.table_id] = fpt

        incoming_table_ids = set()

        for pos in positions:
            table_id = pos["table_id"]
            incoming_table_ids.add(table_id)

            if table_id in existing_by_table_id:
                # Update existing position
                fpt = existing_by_table_id[table_id]
                fpt.x = pos["x"]
                fpt.y = pos["y"]
                fpt.width = pos.get("width", fpt.width)
                fpt.height = pos.get("height", fpt.height)
                fpt.rotation = pos.get("rotation", fpt.rotation)
                fpt.shape = pos.get("shape", fpt.shape)
                fpt.label = pos.get("label", fpt.label)
                fpt.set_updated_by(actor_user_id, actor_email)
            else:
                # Create new position
                fpt = FloorPlanTable(
                    floor_plan_id=plan_id,
                    table_id=table_id,
                    x=pos["x"],
                    y=pos["y"],
                    width=pos.get("width", 60),
                    height=pos.get("height", 60),
                    rotation=pos.get("rotation", 0),
                    shape=pos.get("shape", "RECTANGLE"),
                    label=pos.get("label"),
                )
                fpt.set_created_by(actor_user_id, actor_email)
                self._db.add(fpt)

        # Soft delete positions for tables no longer on the plan
        for table_id, fpt in existing_by_table_id.items():
            if table_id not in incoming_table_ids:
                fpt.soft_delete(actor_user_id, actor_email)

        safe_commit(self._db)

        # Refresh and return
        self._db.refresh(plan)
        refreshed = self._db.scalar(
            select(FloorPlan)
            .where(FloorPlan.id == plan_id)
            .options(selectinload(FloorPlan.tables))
        )
        return self._plan_to_dict(refreshed)

    # =========================================================================
    # Live View
    # =========================================================================

    def get_plan_with_status(
        self,
        plan_id: int,
        tenant_id: int,
    ) -> dict[str, Any]:
        """Floor plan with real-time table statuses."""
        plan = self._db.scalar(
            select(FloorPlan)
            .where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
            .options(selectinload(FloorPlan.tables))
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)

        # Get all table IDs on this plan
        table_ids = [fpt.table_id for fpt in plan.tables if fpt.is_active]

        if not table_ids:
            return {
                **self._plan_to_dict(plan),
                "live_tables": [],
            }

        # Fetch actual tables with their sessions
        tables_stmt = (
            select(Table)
            .where(
                Table.id.in_(table_ids),
                Table.is_active.is_(True),
            )
        )
        tables = self._db.scalars(tables_stmt).all()
        table_map = {t.id: t for t in tables}

        # Get active sessions for these tables
        session_stmt = select(TableSession).where(
            TableSession.table_id.in_(table_ids),
            TableSession.status.in_(["OPEN", "PAYING"]),
            TableSession.is_active.is_(True),
        )
        sessions = self._db.scalars(session_stmt).all()
        session_map = {s.table_id: s for s in sessions}

        # Build live table data
        live_tables = []
        for fpt in plan.tables:
            if not fpt.is_active:
                continue

            table = table_map.get(fpt.table_id)
            if not table:
                continue

            session = session_map.get(fpt.table_id)
            status = "FREE"
            elapsed_minutes = None

            if session:
                status = session.status  # OPEN or PAYING
                if session.created_at:
                    from datetime import datetime, timezone as tz
                    delta = datetime.now(tz.utc) - session.created_at
                    elapsed_minutes = int(delta.total_seconds() / 60)

            live_tables.append({
                "floor_plan_table_id": fpt.id,
                "table_id": fpt.table_id,
                "table_number": table.code,
                "capacity": table.capacity,
                "x": fpt.x,
                "y": fpt.y,
                "width": fpt.width,
                "height": fpt.height,
                "rotation": fpt.rotation,
                "shape": fpt.shape,
                "label": fpt.label or table.code,
                "status": status,
                "elapsed_minutes": elapsed_minutes,
            })

        return {
            **self._plan_to_dict(plan),
            "live_tables": live_tables,
        }

    # =========================================================================
    # Auto-Generate
    # =========================================================================

    def auto_generate(
        self,
        plan_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
        *,
        sector_id: int | None = None,
    ) -> dict[str, Any]:
        """Auto-generate grid layout from existing tables."""
        plan = self._db.scalar(
            select(FloorPlan).where(
                FloorPlan.id == plan_id,
                FloorPlan.tenant_id == tenant_id,
                FloorPlan.is_active.is_(True),
            )
        )
        if not plan:
            raise NotFoundError("Plano de piso", plan_id, tenant_id=tenant_id)

        # Get tables for this branch (optionally filtered by sector)
        stmt = select(Table).where(
            Table.branch_id == plan.branch_id,
            Table.is_active.is_(True),
        )
        if sector_id:
            stmt = stmt.where(Table.sector_id == sector_id)

        tables = self._db.scalars(stmt.order_by(Table.code)).all()
        if not tables:
            raise ValidationError(
                "No hay mesas disponibles para generar el plano.",
                field="branch_id",
            )

        # Calculate grid layout
        table_count = len(tables)
        cols = max(1, int(math.ceil(math.sqrt(table_count))))
        table_width = 60
        table_height = 60
        padding = 20
        margin_x = 40
        margin_y = 40

        positions = []
        for i, table in enumerate(tables):
            row = i // cols
            col = i % cols
            x = margin_x + col * (table_width + padding)
            y = margin_y + row * (table_height + padding)

            positions.append({
                "table_id": table.id,
                "x": float(x),
                "y": float(y),
                "width": float(table_width),
                "height": float(table_height),
                "rotation": 0.0,
                "shape": "RECTANGLE",
                "label": table.code,
            })

        # Update plan dimensions to fit the grid
        total_cols = cols
        total_rows = math.ceil(table_count / cols)
        new_width = max(plan.width, margin_x * 2 + total_cols * (table_width + padding))
        new_height = max(plan.height, margin_y * 2 + total_rows * (table_height + padding))

        plan.width = new_width
        plan.height = new_height
        safe_commit(self._db)

        # Delegate to update_table_positions
        return self.update_table_positions(
            plan_id=plan_id,
            positions=positions,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
        )

    # =========================================================================
    # Helpers
    # =========================================================================

    def _unset_branch_defaults(
        self, branch_id: int, tenant_id: int, *, exclude_id: int | None = None
    ) -> None:
        """Unset is_default on all other plans for a branch."""
        stmt = select(FloorPlan).where(
            FloorPlan.branch_id == branch_id,
            FloorPlan.tenant_id == tenant_id,
            FloorPlan.is_default.is_(True),
            FloorPlan.is_active.is_(True),
        )
        if exclude_id:
            stmt = stmt.where(FloorPlan.id != exclude_id)
        plans = self._db.scalars(stmt).all()
        for p in plans:
            p.is_default = False

    def _plan_to_dict(self, plan: FloorPlan) -> dict[str, Any]:
        tables = []
        if plan.tables:
            for fpt in plan.tables:
                if fpt.is_active:
                    tables.append({
                        "id": fpt.id,
                        "table_id": fpt.table_id,
                        "x": fpt.x,
                        "y": fpt.y,
                        "width": fpt.width,
                        "height": fpt.height,
                        "rotation": fpt.rotation,
                        "shape": fpt.shape,
                        "label": fpt.label,
                    })
        return {
            "id": plan.id,
            "tenant_id": plan.tenant_id,
            "branch_id": plan.branch_id,
            "name": plan.name,
            "width": plan.width,
            "height": plan.height,
            "background_image": plan.background_image,
            "is_default": plan.is_default,
            "sector_id": plan.sector_id,
            "tables": tables,
            "is_active": plan.is_active,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
        }
