"""
Assignment Service - Waiter-Sector daily shift assignments.

CLEAN-ARCH: Encapsulates bulk-create / copy-previous-day logic for
WaiterSectorAssignment, guaranteeing atomicity (single commit, rollback on
any failure). Replaces inline router loops that previously committed at the
end without explicit transaction safety.

Atomicity model:
- All entity mutations happen in-memory until the final `safe_commit()`.
- `safe_commit()` issues `db.rollback()` on any DB error and re-raises.
- Validation runs BEFORE any `db.add(...)`. If a precondition fails the
  method raises ValidationError without touching the session.
- For partial-failure semantics (skipped duplicates / invalid IDs), the
  service returns counts so the router can build the response — it does
  NOT raise; only hard errors (DB, ValidationError) trigger rollback.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from rest_api.models import (
    Branch,
    BranchSector,
    User,
    UserBranchRole,
    WaiterSectorAssignment,
)
from rest_api.services.crud.soft_delete import set_created_by
from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from shared.utils.exceptions import (
    DatabaseError,
    NotFoundError,
    ValidationError,
)

logger = get_logger(__name__)


class AssignmentService:
    """
    Service for daily waiter-sector assignment management.

    Provides atomic bulk-create and copy-from-previous-day operations
    that replace the inline loops previously used in the admin router.
    """

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Public API
    # =========================================================================

    def create_bulk(
        self,
        *,
        branch_id: int,
        assignment_date: date,
        shift: str | None,
        assignments: list[dict],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """
        Create multiple waiter-sector assignments atomically.

        Skips duplicates (same waiter+sector+date+shift) and invalid IDs,
        returning counts so the caller can construct an aggregate response.
        Hard errors (DB failure) trigger rollback and re-raise.

        Args:
            branch_id: Target branch ID.
            assignment_date: Date for the shift.
            shift: Optional shift label (e.g., MORNING/AFTERNOON/NIGHT).
            assignments: List of {sector_id, waiter_ids[]} groups.
            tenant_id: Tenant for isolation.
            user_id: Acting user ID (audit trail).
            user_email: Acting user email (audit trail).

        Returns:
            dict with keys:
                - created: list[WaiterSectorAssignment] (persisted, refreshed)
                - skipped_count: int
                - sector_map: dict[int, BranchSector]
                - waiter_map: dict[int, User]

        Raises:
            NotFoundError: branch not found in tenant.
            DatabaseError: commit failure (after rollback).
        """
        # --- 1. Branch existence (fail fast, no DB writes yet) ---------------
        branch = self._db.scalar(
            select(Branch).where(
                Branch.id == branch_id,
                Branch.tenant_id == tenant_id,
                Branch.is_active.is_(True),
            )
        )
        if not branch:
            raise NotFoundError("Branch", branch_id, tenant_id=tenant_id)

        # --- 2. Resolve valid sectors + waiters in one pass ------------------
        sector_map = self._load_sector_map(tenant_id, branch_id)
        waiter_map = self._load_waiter_map(tenant_id, branch_id)
        valid_sector_ids = set(sector_map.keys())
        valid_waiter_ids = set(waiter_map.keys())

        # --- 3. Pre-load existing assignments to skip dupes ------------------
        existing_keys = self._load_existing_keys(
            tenant_id=tenant_id,
            branch_id=branch_id,
            assignment_date=assignment_date,
            shift=shift,
        )

        # --- 4. Stage new assignments in-memory (no commits) -----------------
        created: list[WaiterSectorAssignment] = []
        skipped = 0

        for group in assignments:
            sector_id = group.get("sector_id")
            waiter_ids = group.get("waiter_ids", [])

            if sector_id not in valid_sector_ids:
                skipped += len(waiter_ids)
                continue

            for waiter_id in waiter_ids:
                if waiter_id not in valid_waiter_ids:
                    skipped += 1
                    continue

                if (sector_id, waiter_id) in existing_keys:
                    skipped += 1
                    continue

                assignment = WaiterSectorAssignment(
                    tenant_id=tenant_id,
                    branch_id=branch_id,
                    sector_id=sector_id,
                    waiter_id=waiter_id,
                    assignment_date=assignment_date,
                    shift=shift,
                )
                set_created_by(assignment, user_id, user_email)
                self._db.add(assignment)
                created.append(assignment)
                existing_keys.add((sector_id, waiter_id))

        # --- 5. Atomic commit (rollback on any error) ------------------------
        try:
            safe_commit(self._db)
        except Exception as e:
            logger.error(
                "Failed to bulk-create waiter-sector assignments",
                error=str(e),
                tenant_id=tenant_id,
                branch_id=branch_id,
                attempted_count=len(created),
            )
            raise DatabaseError("crear asignaciones de sector")

        # Refresh to obtain PK + DB-side defaults
        for a in created:
            self._db.refresh(a)

        logger.info(
            "Bulk assignments created",
            extra={
                "tenant_id": tenant_id,
                "branch_id": branch_id,
                "created": len(created),
                "skipped": skipped,
            },
        )

        return {
            "created": created,
            "skipped_count": skipped,
            "sector_map": sector_map,
            "waiter_map": waiter_map,
        }

    def copy_from_previous(
        self,
        *,
        branch_id: int,
        from_date: date,
        to_date: date,
        shift: str | None,
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """
        Copy assignments from one date to another atomically.

        Skips entries whose (sector_id, waiter_id, shift) tuple already exists
        on the target date.

        Returns:
            Same structure as create_bulk(): created/skipped_count/sector_map/waiter_map.

        Raises:
            DatabaseError: commit failure (after rollback).
        """
        # Source assignments
        src_query = select(WaiterSectorAssignment).where(
            WaiterSectorAssignment.tenant_id == tenant_id,
            WaiterSectorAssignment.branch_id == branch_id,
            WaiterSectorAssignment.assignment_date == from_date,
            WaiterSectorAssignment.is_active.is_(True),
        )
        if shift:
            src_query = src_query.where(WaiterSectorAssignment.shift == shift)
        source_assignments = self._db.execute(src_query).scalars().all()

        if not source_assignments:
            return {
                "created": [],
                "skipped_count": 0,
                "sector_map": {},
                "waiter_map": {},
            }

        # Existing on target date (avoid dupes — tuple includes shift!)
        existing = self._db.execute(
            select(WaiterSectorAssignment).where(
                WaiterSectorAssignment.tenant_id == tenant_id,
                WaiterSectorAssignment.branch_id == branch_id,
                WaiterSectorAssignment.assignment_date == to_date,
                WaiterSectorAssignment.is_active.is_(True),
            )
        ).scalars().all()
        existing_keys = {(a.sector_id, a.waiter_id, a.shift) for a in existing}

        # Pre-resolve sector/waiter maps for output rendering
        sector_ids = {a.sector_id for a in source_assignments}
        waiter_ids = {a.waiter_id for a in source_assignments}

        sector_map: dict[int, BranchSector] = {
            s.id: s
            for s in self._db.execute(
                select(BranchSector).where(BranchSector.id.in_(sector_ids))
            ).scalars().all()
        }
        waiter_map: dict[int, User] = {
            w.id: w
            for w in self._db.execute(
                select(User).where(User.id.in_(waiter_ids))
            ).scalars().all()
        }

        created: list[WaiterSectorAssignment] = []
        skipped = 0

        for src in source_assignments:
            if (src.sector_id, src.waiter_id, src.shift) in existing_keys:
                skipped += 1
                continue

            new_assignment = WaiterSectorAssignment(
                tenant_id=tenant_id,
                branch_id=branch_id,
                sector_id=src.sector_id,
                waiter_id=src.waiter_id,
                assignment_date=to_date,
                shift=src.shift,
            )
            set_created_by(new_assignment, user_id, user_email)
            self._db.add(new_assignment)
            created.append(new_assignment)
            existing_keys.add((src.sector_id, src.waiter_id, src.shift))

        try:
            safe_commit(self._db)
        except Exception as e:
            logger.error(
                "Failed to copy waiter-sector assignments",
                error=str(e),
                tenant_id=tenant_id,
                branch_id=branch_id,
                from_date=str(from_date),
                to_date=str(to_date),
            )
            raise DatabaseError("copiar asignaciones de sector")

        for a in created:
            self._db.refresh(a)

        logger.info(
            "Assignments copied",
            extra={
                "tenant_id": tenant_id,
                "branch_id": branch_id,
                "from_date": str(from_date),
                "to_date": str(to_date),
                "created": len(created),
                "skipped": skipped,
            },
        )

        return {
            "created": created,
            "skipped_count": skipped,
            "sector_map": sector_map,
            "waiter_map": waiter_map,
        }

    # =========================================================================
    # Validation Hooks (extensible by subclasses)
    # =========================================================================

    def _validate_assignment(
        self,
        assignment_data: dict[str, Any],
        tenant_id: int,
        *,
        valid_sector_ids: set[int],
        valid_waiter_ids: set[int],
    ) -> None:
        """
        Per-assignment validation hook. Default impl checks sector/waiter
        membership; override for stricter rules. Raises ValidationError on
        hard failures (caller must rollback). The current bulk implementation
        treats unknown IDs as "skipped" rather than errors, so this hook is
        primarily for subclasses that want hard validation.
        """
        sector_id = assignment_data.get("sector_id")
        waiter_id = assignment_data.get("waiter_id")
        if sector_id is not None and sector_id not in valid_sector_ids:
            raise ValidationError("sector_id inválido", field="sector_id")
        if waiter_id is not None and waiter_id not in valid_waiter_ids:
            raise ValidationError("waiter_id inválido", field="waiter_id")

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _load_sector_map(self, tenant_id: int, branch_id: int) -> dict[int, BranchSector]:
        """Return {sector_id: BranchSector} for valid sectors (branch + global)."""
        from sqlalchemy import or_

        sectors = self._db.execute(
            select(BranchSector).where(
                BranchSector.tenant_id == tenant_id,
                BranchSector.is_active.is_(True),
                or_(
                    BranchSector.branch_id == branch_id,
                    BranchSector.branch_id.is_(None),
                ),
            )
        ).scalars().all()
        return {s.id: s for s in sectors}

    def _load_waiter_map(self, tenant_id: int, branch_id: int) -> dict[int, User]:
        """Return {user_id: User} for active waiters of the branch."""
        roles = self._db.execute(
            select(UserBranchRole).where(
                UserBranchRole.tenant_id == tenant_id,
                UserBranchRole.branch_id == branch_id,
                UserBranchRole.role == "WAITER",
            ).options(joinedload(UserBranchRole.user))
        ).scalars().unique().all()
        return {r.user_id: r.user for r in roles if r.user and r.user.is_active}

    def _load_existing_keys(
        self,
        *,
        tenant_id: int,
        branch_id: int,
        assignment_date: date,
        shift: str | None,
    ) -> set[tuple[int, int]]:
        """Return set of (sector_id, waiter_id) already assigned for date+shift."""
        existing = self._db.execute(
            select(WaiterSectorAssignment).where(
                WaiterSectorAssignment.tenant_id == tenant_id,
                WaiterSectorAssignment.branch_id == branch_id,
                WaiterSectorAssignment.assignment_date == assignment_date,
                WaiterSectorAssignment.shift == shift,
                WaiterSectorAssignment.is_active.is_(True),
            )
        ).scalars().all()
        return {(a.sector_id, a.waiter_id) for a in existing}
