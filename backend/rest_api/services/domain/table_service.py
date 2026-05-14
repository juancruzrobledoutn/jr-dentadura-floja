"""
Table Service - Clean Architecture Implementation.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, TYPE_CHECKING

from sqlalchemy import select, or_
from sqlalchemy.orm import Session, joinedload

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

from rest_api.models import (
    Table,
    BranchSector,
    TableSession,
    Check,
    Round,
    RoundItem,
    Product,
    User,
    WaiterSectorAssignment,
)
from shared.infrastructure.db import safe_commit
from shared.utils.admin_schemas import TableOutput
from rest_api.services.base_service import BranchScopedService
from rest_api.services.events import publish_entity_deleted
from shared.utils.exceptions import (
    ValidationError,
    NotFoundError,
    ForbiddenError,
    ConflictError,
)


class TableService(BranchScopedService[Table, TableOutput]):
    """Service for table management."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=Table,
            output_schema=TableOutput,
            entity_name="Mesa",
            image_url_fields=set(),  # Tables don't have images
        )

    def list_by_sector(
        self,
        tenant_id: int,
        sector_id: int,
        *,
        include_inactive: bool = False,
    ) -> list[TableOutput]:
        """List tables for a specific sector."""
        entities = self._repo.find_all(
            tenant_id=tenant_id,
            include_inactive=include_inactive,
            order_by=Table.code,
        )
        filtered = [e for e in entities if e.sector_id == sector_id]
        return [self.to_output(e) for e in filtered]

    def get_by_code(
        self,
        tenant_id: int,
        branch_id: int,
        code: str,
    ) -> TableOutput | None:
        """Get table by code within branch."""
        from rest_api.services.crud.repository import BranchRepository

        repo: BranchRepository = self._repo
        entities = repo.find_by_branch(branch_id, tenant_id)
        for entity in entities:
            if entity.code == code:
                return self.to_output(entity)
        return None

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Validate table creation.

        Accepts either `sector_id` (preferred — copies branch_id from sector)
        or an explicit `branch_id`. At least one is required. When both are
        supplied, the sector's branch wins to keep referential integrity.
        """
        from rest_api.models import Branch

        sector_id = data.get("sector_id")
        branch_id = data.get("branch_id")

        if sector_id:
            sector = self._db.scalar(
                select(BranchSector).where(
                    BranchSector.id == sector_id,
                    BranchSector.tenant_id == tenant_id,
                    BranchSector.is_active.is_(True),
                )
            )
            if not sector:
                raise ValidationError("sector_id inválido", field="sector_id")
            # Copy branch_id from sector (overrides any caller-provided value).
            data["branch_id"] = sector.branch_id
            return

        if not branch_id:
            raise ValidationError(
                "Se requiere sector_id o branch_id",
                field="branch_id",
            )

        branch = self._db.scalar(
            select(Branch).where(
                Branch.id == branch_id,
                Branch.tenant_id == tenant_id,
                Branch.is_active.is_(True),
            )
        )
        if not branch:
            raise ValidationError("branch_id inválido", field="branch_id")

    def _after_delete(
        self,
        entity_info: dict[str, Any],
        user_id: int,
        user_email: str,
        *,
        background_tasks: "BackgroundTasks | None" = None,
    ) -> None:
        """Publish deletion event."""
        publish_entity_deleted(
            tenant_id=entity_info["tenant_id"],
            entity_type="table",
            entity_id=entity_info["id"],
            entity_name=entity_info.get("name"),
            branch_id=entity_info.get("branch_id"),
            actor_user_id=user_id,
            background_tasks=background_tasks,
        )

    def activate_for_waiter(
        self,
        table_id: int,
        tenant_id: int,
        branch_ids: list[int],
        waiter_id: int,
    ) -> tuple[Table, TableSession]:
        """
        S4.1 REFACTOR: Activate a table by creating a waiter-managed session.

        HU-WAITER-MESA CA-01 logic extracted from waiter router.

        Returns (table, session) tuple. Both are refreshed and ready for use.

        Raises:
            NotFoundError: Table missing or filtered out by tenant scope.
            ForbiddenError: Caller has no access to the table's branch.
            ConflictError: Table status is not FREE.
            ConflictError: An OPEN/PAYING session already exists.
        """
        # Find the table (must be active, tenant-scoped).
        table = self._db.scalar(
            select(Table).where(
                Table.id == table_id,
                Table.tenant_id == tenant_id,
                Table.is_active.is_(True),
            )
        )
        if not table:
            raise NotFoundError("Mesa", table_id)

        if table.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        if table.status != "FREE":
            raise ConflictError(
                f"Table is already {table.status}. Cannot activate.",
                current_status=table.status,
            )

        # Defensive: ensure no lingering active session.
        existing_session = self._db.scalar(
            select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if existing_session:
            raise ConflictError(
                f"Table already has an active session (ID: {existing_session.id})",
                session_id=existing_session.id,
            )

        now = datetime.now(timezone.utc)
        session = TableSession(
            tenant_id=tenant_id,
            branch_id=table.branch_id,
            table_id=table.id,
            status="OPEN",
            assigned_waiter_id=waiter_id,
            opened_at=now,
            opened_by="WAITER",
            opened_by_waiter_id=waiter_id,
        )
        self._db.add(session)
        table.status = "ACTIVE"

        safe_commit(self._db)
        self._db.refresh(session)
        self._db.refresh(table)

        return table, session

    # -------------------------------------------------------------------------
    # S4.2 REFACTOR: Close table after payment (HU-WAITER-MESA CA-07).
    # Extracted from rest_api/routers/waiter/routes.py:close_table.
    # -------------------------------------------------------------------------

    def close_table_after_payment(
        self,
        tenant_id: int,
        table_id: int,
        branch_ids: list[int],
        user_roles: list[str],
        force: bool,
    ) -> tuple[Table, TableSession, int, int, datetime]:
        """
        Close a table: closes session, sets table to FREE, returns totals.

        Behavior-preserving extraction of legacy router logic:
          - 404 if table not found / inactive
          - 403 if no branch access
          - 400 if no active session
          - 400 if check not fully paid (unless force=True)
          - 403 if force=True and user lacks ADMIN role

        Returns (table, session, total_cents, paid_cents, closed_at) for the
        router to assemble the response and publish TABLE_CLEARED.
        """
        from sqlalchemy import select as _select

        table = self._db.scalar(
            _select(Table).where(
                Table.id == table_id,
                Table.tenant_id == tenant_id,
                Table.is_active.is_(True),
            )
        )
        if not table:
            raise NotFoundError("Mesa", table_id)

        if table.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        session = self._db.scalar(
            _select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise ValidationError(
                f"Table {table_id} has no active session to close",
                table_id=table_id,
            )

        check = self._db.scalar(
            _select(Check).where(
                Check.table_session_id == session.id,
                Check.tenant_id == tenant_id,
                Check.is_active.is_(True),
            )
        )
        total_cents = check.total_cents if check else 0
        paid_cents = check.paid_cents if check else 0

        if check and check.status != "PAID" and not force:
            remaining = check.total_cents - check.paid_cents
            raise ValidationError(
                f"Check not fully paid. Remaining: {remaining} cents. "
                f"Use force=true to close anyway (ADMIN only).",
                remaining_cents=remaining,
            )

        if force and "ADMIN" not in user_roles:
            raise ForbiddenError("Force close requires ADMIN role")

        now = datetime.now(timezone.utc)
        session.status = "CLOSED"
        session.closed_at = now
        table.status = "FREE"

        safe_commit(self._db)
        self._db.refresh(session)
        self._db.refresh(table)

        return table, session, total_cents, paid_cents, now

    # -------------------------------------------------------------------------
    # S4.2 REFACTOR: Move session between tables.
    # Extracted from rest_api/routers/waiter/routes.py:move_table_session.
    # -------------------------------------------------------------------------

    def move_session_to_table(
        self,
        tenant_id: int,
        table_id: int,
        target_table_id: int,
        branch_ids: list[int],
    ) -> tuple[Table, Table, TableSession]:
        """
        Move active session from source table to target table.

        Behavior-preserving extraction of legacy router logic:
          - 400 if source == target
          - 404 if source table not found
          - 403 if no branch access to source
          - 404 if target not in same branch / not found
          - 400 if target not FREE
          - 400 if source has no active session
          - 400 if target has a lingering active session
          - Source becomes FREE, target inherits source's status
          - Session.table_id is updated

        Returns (source_table, target_table, session).
        """
        from sqlalchemy import select as _select

        if table_id == target_table_id:
            raise ValidationError(
                "La mesa origen y destino no pueden ser la misma",
                table_id=table_id,
            )

        source_table = self._db.scalar(
            _select(Table).where(
                Table.id == table_id,
                Table.tenant_id == tenant_id,
                Table.is_active.is_(True),
            )
        )
        if not source_table:
            raise NotFoundError("Mesa origen", table_id)

        if source_table.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        target_table = self._db.scalar(
            _select(Table).where(
                Table.id == target_table_id,
                Table.tenant_id == tenant_id,
                Table.branch_id == source_table.branch_id,
                Table.is_active.is_(True),
            )
        )
        if not target_table:
            raise NotFoundError(
                "Mesa destino en la misma sucursal", target_table_id
            )

        if target_table.status != "FREE":
            raise ValidationError(
                f"Mesa destino {target_table.code} no está libre "
                f"(estado: {target_table.status})",
                target_status=target_table.status,
            )

        session = self._db.scalar(
            _select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise ValidationError(
                f"Mesa {source_table.code} no tiene una sesión activa para mover",
                table_id=table_id,
            )

        existing_target_session = self._db.scalar(
            _select(TableSession).where(
                TableSession.table_id == target_table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if existing_target_session:
            raise ValidationError(
                f"Mesa destino {target_table.code} ya tiene una sesión activa",
                target_table_id=target_table_id,
            )

        source_status = source_table.status
        session.table_id = target_table_id
        source_table.status = "FREE"
        target_table.status = source_status

        safe_commit(self._db)
        self._db.refresh(session)
        self._db.refresh(source_table)
        self._db.refresh(target_table)

        return source_table, target_table, session

    # -------------------------------------------------------------------------
    # S4.2 REFACTOR: Get session detail for Dashboard TableSessionModal.
    # Extracted from rest_api/routers/waiter/routes.py:get_table_session_detail.
    # -------------------------------------------------------------------------

    def get_table_session_detail(
        self,
        tenant_id: int,
        table_id: int,
        branch_ids: list[int],
    ) -> tuple[Table, TableSession, Check | None]:
        """
        Fetch table + active session with rounds/items/diners eager-loaded,
        plus the related Check (if any).

        The router builds the Pydantic response from the returned objects so
        we don't couple this domain method to the router's schema classes.

        Raises:
            NotFoundError: table not found / no active session
            ForbiddenError: no branch access
        """
        from sqlalchemy import select as _select
        from sqlalchemy.orm import selectinload, joinedload

        table = self._db.scalar(
            _select(Table).where(
                Table.id == table_id,
                Table.tenant_id == tenant_id,
                Table.is_active.is_(True),
            )
        )
        if not table:
            raise NotFoundError("Mesa", table_id)

        if table.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        session = self._db.scalar(
            _select(TableSession)
            .options(
                selectinload(TableSession.diners),
                selectinload(TableSession.rounds)
                .selectinload(Round.items)
                .joinedload(RoundItem.product)
                .joinedload(Product.category),
            )
            .where(
                TableSession.table_id == table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise NotFoundError("Sesión activa para mesa", table_id)

        check = self._db.scalar(
            _select(Check).where(
                Check.table_session_id == session.id,
                Check.tenant_id == tenant_id,
                Check.is_active.is_(True),
            )
        )
        return table, session, check

    # -------------------------------------------------------------------------
    # C8 PASS 2 REFACTOR: Transfer a table's session to another waiter.
    # Extracted from rest_api/routers/waiter/routes.py:transfer_table_waiter.
    # -------------------------------------------------------------------------

    def transfer_waiter(
        self,
        tenant_id: int,
        table_id: int,
        branch_ids: list[int],
        target_waiter_id: int,
    ) -> tuple[Table, TableSession, int | None]:
        """
        Reassign an active session to another waiter.

        Behavior-preserving extraction of legacy router logic:
          - 404 if source table not found (detail: "Mesa {id} no encontrada")
          - 403 if no branch access
          - 400 if table has no active session to transfer
          - 404 if target waiter not found in tenant

        Returns (table, session, previous_waiter_id) for the router to assemble
        the response and publish TABLE_TRANSFERRED.
        """
        table = self._db.scalar(
            select(Table).where(
                Table.id == table_id,
                Table.tenant_id == tenant_id,
                Table.is_active.is_(True),
            )
        )
        if not table:
            raise NotFoundError("Mesa", table_id)

        if table.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        session = self._db.scalar(
            select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise ValidationError(
                f"Mesa {table_id} no tiene una sesión activa para transferir",
                table_id=table_id,
            )

        target_waiter = self._db.scalar(
            select(User).where(
                User.id == target_waiter_id,
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
            )
        )
        if not target_waiter:
            raise NotFoundError("Mozo destino", target_waiter_id)

        previous_waiter_id = session.assigned_waiter_id
        session.assigned_waiter_id = target_waiter_id

        safe_commit(self._db)
        self._db.refresh(session)

        return table, session, previous_waiter_id

    # -------------------------------------------------------------------------
    # C8 PASS 3 REFACTOR: List tables assigned to a waiter via sector
    # assignments. Extracted from
    # rest_api/routers/waiter/routes.py:get_my_assigned_tables.
    # -------------------------------------------------------------------------

    def list_assigned_to_waiter(
        self,
        waiter_id: int,
        tenant_id: int,
        branch_ids: list[int],
        target_date: date,
        shift: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        List all tables in the sectors a waiter is assigned to for a date.

        Behavior-preserving extraction of legacy router logic:
          - if shift is provided, includes assignments matching that shift OR
            with NULL shift (all-day)
          - if no assignments exist, falls back to all active tables in the
            waiter's branch_ids
          - otherwise returns only tables in assigned sectors

        Returns a list of raw dicts (router-friendly shape, no schema coupling).
        """
        query = select(WaiterSectorAssignment.sector_id).where(
            WaiterSectorAssignment.waiter_id == waiter_id,
            WaiterSectorAssignment.tenant_id == tenant_id,
            WaiterSectorAssignment.assignment_date == target_date,
            WaiterSectorAssignment.is_active.is_(True),
        )

        if shift:
            query = query.where(
                or_(
                    WaiterSectorAssignment.shift == shift,
                    WaiterSectorAssignment.shift.is_(None),
                )
            )

        sector_ids = self._db.execute(query).scalars().all()

        if not sector_ids:
            # No assignments - return all tables in branches (fallback behavior)
            tables = self._db.execute(
                select(Table)
                .where(
                    Table.branch_id.in_(branch_ids),
                    Table.is_active.is_(True),
                )
                .order_by(Table.branch_id, Table.code)
            ).scalars().all()
        else:
            # Return only tables in assigned sectors
            tables = self._db.execute(
                select(Table)
                .options(joinedload(Table.sector_rel))
                .where(
                    Table.sector_id.in_(sector_ids),
                    Table.is_active.is_(True),
                )
                .order_by(Table.branch_id, Table.code)
            ).scalars().unique().all()

        return [
            {
                "id": t.id,
                "code": t.code,
                "capacity": t.capacity,
                "status": t.status,
                "branch_id": t.branch_id,
                "sector_id": t.sector_id,
                "sector_name": t.sector_rel.name if t.sector_rel else t.sector,
            }
            for t in tables
        ]
