"""
Override Service - Manager Override / Approval Flow.

CLEAN-ARCH: Handles voids, discounts, and other manager-approved operations.
Records full audit trail with before/after snapshots.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy import select, func, cast, Date
from sqlalchemy.orm import Session

from rest_api.models import RoundItem, Check, TableSession
from rest_api.models.manager_override import ManagerOverride
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import (
    NotFoundError,
    ValidationError,
    ForbiddenError,
)

logger = get_logger(__name__)

# Valid override types
OVERRIDE_TYPES = {"ITEM_VOID", "DISCOUNT", "PAYMENT_REVERSAL", "ROUND_CANCEL"}


class OverrideService:
    """Manager override operations: voids, discounts, and audit."""

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Void Round Item
    # =========================================================================

    def void_round_item(
        self,
        tenant_id: int,
        branch_id: int,
        round_item_id: int,
        reason: str,
        manager_user_id: int,
        requester_user_id: int,
        manager_email: str = "",
    ) -> dict[str, Any]:
        """Void a single round item with manager approval.

        Marks the item as inactive (soft delete) and records the override.
        If a check exists for the session, adjusts the total.

        Args:
            tenant_id: Tenant ID.
            branch_id: Branch ID.
            round_item_id: ID of the round item to void.
            reason: Reason for voiding.
            manager_user_id: Manager who approved.
            requester_user_id: Staff who requested the void.
            manager_email: Manager email for audit.

        Returns:
            Created override record as dict.
        """
        if not reason or not reason.strip():
            raise ValidationError("Se requiere un motivo para la anulación.", field="reason")

        # Find the round item
        item = self._db.scalar(
            select(RoundItem).where(
                RoundItem.id == round_item_id,
                RoundItem.tenant_id == tenant_id,
                RoundItem.branch_id == branch_id,
                RoundItem.is_active.is_(True),
            )
        )
        if not item:
            raise NotFoundError("Item de ronda", round_item_id, tenant_id=tenant_id)

        # Check if already voided
        if item.is_voided:
            raise ValidationError("Este item ya fue anulado.", field="round_item_id")

        # Snapshot old values
        old_values = {
            "qty": item.qty,
            "unit_price_cents": item.unit_price_cents,
            "product_name": item.product_name,
            "is_voided": False,
        }
        voided_amount = item.qty * item.unit_price_cents

        # Mark item as voided (uses dedicated void fields, not soft delete)
        from datetime import datetime, timezone as tz
        item.is_voided = True
        item.void_reason = reason.strip()
        item.voided_by_user_id = manager_user_id
        item.voided_at = datetime.now(tz.utc)

        # Adjust check total if one exists for this session
        self._adjust_check_for_void(item, voided_amount, manager_user_id, manager_email)

        # Create override record
        override = ManagerOverride(
            tenant_id=tenant_id,
            branch_id=branch_id,
            override_type="ITEM_VOID",
            reason=reason.strip(),
            approved_by=manager_user_id,
            requested_by=requester_user_id,
            entity_type="round_item",
            entity_id=round_item_id,
            old_values=json.dumps(old_values),
            new_values=json.dumps({"is_voided": True, "void_reason": reason.strip()}),
            status="APPROVED",
            amount_cents=voided_amount,
        )
        override.set_created_by(manager_user_id, manager_email)
        self._db.add(override)

        safe_commit(self._db)
        self._db.refresh(override)

        logger.info(
            "Round item voided",
            extra={
                "override_id": override.id,
                "round_item_id": round_item_id,
                "amount_cents": voided_amount,
                "manager_id": manager_user_id,
            },
        )
        return self._override_to_dict(override)

    # =========================================================================
    # Apply Discount
    # =========================================================================

    def apply_discount(
        self,
        tenant_id: int,
        branch_id: int,
        check_id: int,
        discount_type: str,
        discount_value: int,
        reason: str,
        manager_user_id: int,
        manager_email: str = "",
    ) -> dict[str, Any]:
        """Apply an ad-hoc discount to a check.

        Args:
            tenant_id: Tenant ID.
            branch_id: Branch ID.
            check_id: Check to apply discount to.
            discount_type: "PERCENT" or "AMOUNT".
            discount_value: Percentage (1-100) or amount in cents.
            reason: Reason for the discount.
            manager_user_id: Manager who approved.
            manager_email: Manager email for audit.

        Returns:
            Created override record as dict.
        """
        if not reason or not reason.strip():
            raise ValidationError("Se requiere un motivo para el descuento.", field="reason")

        if discount_type not in ("PERCENT", "AMOUNT"):
            raise ValidationError(
                "Tipo de descuento inválido. Debe ser PERCENT o AMOUNT.",
                field="discount_type",
            )

        check = self._db.scalar(
            select(Check).where(
                Check.id == check_id,
                Check.tenant_id == tenant_id,
                Check.branch_id == branch_id,
                Check.is_active.is_(True),
            )
        )
        if not check:
            raise NotFoundError("Cuenta", check_id, tenant_id=tenant_id)

        old_total = check.total_cents

        # Calculate discount amount
        if discount_type == "PERCENT":
            if discount_value < 1 or discount_value > 100:
                raise ValidationError(
                    "El porcentaje de descuento debe estar entre 1 y 100.",
                    field="discount_value",
                )
            discount_amount = int(old_total * discount_value / 100)
        else:
            if discount_value <= 0:
                raise ValidationError(
                    "El monto del descuento debe ser positivo.",
                    field="discount_value",
                )
            if discount_value > old_total:
                raise ValidationError(
                    "El descuento no puede superar el total de la cuenta.",
                    field="discount_value",
                )
            discount_amount = discount_value

        # Apply discount
        new_total = old_total - discount_amount
        check.total_cents = new_total
        check.set_updated_by(manager_user_id, manager_email)

        old_values = {"total_cents": old_total}
        new_values = {
            "total_cents": new_total,
            "discount_type": discount_type,
            "discount_value": discount_value,
        }

        override = ManagerOverride(
            tenant_id=tenant_id,
            branch_id=branch_id,
            override_type="DISCOUNT",
            reason=reason.strip(),
            approved_by=manager_user_id,
            requested_by=manager_user_id,
            entity_type="check",
            entity_id=check_id,
            old_values=json.dumps(old_values),
            new_values=json.dumps(new_values),
            status="APPROVED",
            amount_cents=discount_amount,
        )
        override.set_created_by(manager_user_id, manager_email)
        self._db.add(override)

        safe_commit(self._db)
        self._db.refresh(override)

        logger.info(
            "Discount applied",
            extra={
                "override_id": override.id,
                "check_id": check_id,
                "discount_amount": discount_amount,
                "old_total": old_total,
                "new_total": new_total,
            },
        )
        return self._override_to_dict(override)

    # =========================================================================
    # C8 PASS 3 REFACTOR: Apply Discount to a Session's Check
    # Extracted from rest_api/routers/waiter/routes.py:apply_session_discount.
    # Handles full pipeline: session lookup, branch access, check lookup,
    # discount apply, and assembles response data for the router.
    # =========================================================================

    def apply_discount_to_session_check(
        self,
        tenant_id: int,
        branch_ids: list[int],
        session_id: int,
        discount_type: str,
        discount_value: int,
        reason: str,
        manager_user_id: int,
        manager_email: str = "",
    ) -> dict[str, Any]:
        """
        Apply an ad-hoc discount to the check of a given session.

        Behavior-preserving extraction of the legacy router pipeline:
          - 404 if no active session ("Sesión activa {id} no encontrada")
          - 403 if branch access denied
          - 404 if check not found ("No se encontró cuenta para la sesión {id}")
          - 400 for invalid discount_type / value (via apply_discount)

        Returns a dict consumable by the router with:
          - check_id, branch_id, discount_amount_cents
          - old_total_cents, new_total_cents
        """
        # Find the session (must be active: OPEN or PAYING)
        session = self._db.scalar(
            select(TableSession).where(
                TableSession.id == session_id,
                TableSession.tenant_id == tenant_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise NotFoundError(
                "Sesión activa",
                session_id,
            )

        if session.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        # Find the active check for this session
        check = self._db.scalar(
            select(Check).where(
                Check.table_session_id == session_id,
                Check.tenant_id == tenant_id,
                Check.is_active.is_(True),
            )
        )
        if not check:
            raise NotFoundError(
                "Cuenta para sesión",
                session_id,
            )

        # Delegate to existing apply_discount (reuses validation + audit trail)
        result = self.apply_discount(
            tenant_id=tenant_id,
            branch_id=session.branch_id,
            check_id=check.id,
            discount_type=discount_type,
            discount_value=discount_value,
            reason=reason,
            manager_user_id=manager_user_id,
            manager_email=manager_email,
        )

        # Refresh check to read updated total
        self._db.refresh(check)

        new_values = json.loads(result.get("new_values", "{}"))
        old_values = json.loads(result.get("old_values", "{}"))

        return {
            "check_id": check.id,
            "branch_id": session.branch_id,
            "discount_amount_cents": result.get("amount_cents", 0),
            "old_total_cents": old_values.get("total_cents", 0),
            "new_total_cents": check.total_cents,
        }

    # =========================================================================
    # List Overrides
    # =========================================================================

    def list_overrides(
        self,
        tenant_id: int,
        branch_id: int | None = None,
        *,
        override_date: date | None = None,
        override_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List overrides for audit purposes.

        Args:
            tenant_id: Tenant ID.
            branch_id: Optional branch filter.
            override_date: Optional date filter.
            override_type: Optional type filter (ITEM_VOID, DISCOUNT, etc.).
            limit: Max results.
            offset: Pagination offset.

        Returns:
            List of override dicts.
        """
        stmt = select(ManagerOverride).where(
            ManagerOverride.tenant_id == tenant_id,
            ManagerOverride.is_active.is_(True),
        )

        if branch_id:
            stmt = stmt.where(ManagerOverride.branch_id == branch_id)
        if override_date:
            stmt = stmt.where(
                cast(ManagerOverride.created_at, Date) == override_date
            )
        if override_type:
            if override_type not in OVERRIDE_TYPES:
                raise ValidationError(
                    f"Tipo de override inválido: {override_type}",
                    field="override_type",
                )
            stmt = stmt.where(ManagerOverride.override_type == override_type)

        stmt = stmt.order_by(ManagerOverride.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)

        overrides = self._db.scalars(stmt).all()
        return [self._override_to_dict(o) for o in overrides]

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _adjust_check_for_void(
        self,
        item: RoundItem,
        voided_amount: int,
        user_id: int,
        user_email: str,
    ) -> None:
        """Adjust check total when an item is voided."""
        from rest_api.models import Round

        round_obj = self._db.scalar(
            select(Round).where(Round.id == item.round_id)
        )
        if not round_obj:
            return

        check = self._db.scalar(
            select(Check).where(
                Check.table_session_id == round_obj.table_session_id,
                Check.is_active.is_(True),
            )
        )
        if not check:
            return

        check.total_cents = max(0, check.total_cents - voided_amount)
        check.set_updated_by(user_id, user_email)

    # =========================================================================
    # Serialization
    # =========================================================================

    def _override_to_dict(self, o: ManagerOverride) -> dict[str, Any]:
        """Convert ManagerOverride to dict."""
        return {
            "id": o.id,
            "tenant_id": o.tenant_id,
            "branch_id": o.branch_id,
            "override_type": o.override_type,
            "reason": o.reason,
            "approved_by": o.approved_by,
            "requested_by": o.requested_by,
            "entity_type": o.entity_type,
            "entity_id": o.entity_id,
            "old_values": o.old_values,
            "new_values": o.new_values,
            "status": o.status,
            "amount_cents": o.amount_cents,
            "is_active": o.is_active,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
