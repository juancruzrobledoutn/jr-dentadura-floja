"""
Cash Register Domain Service.

Handles cash session lifecycle: open, record movements, close with reconciliation.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from shared.utils.exceptions import NotFoundError, ValidationError
from rest_api.models.cash_register import CashRegister, CashSession, CashMovement

logger = get_logger(__name__)

# Valid movement types
VALID_MOVEMENT_TYPES = {"SALE", "REFUND", "EXPENSE", "DEPOSIT", "WITHDRAWAL", "TIP_IN"}
VALID_PAYMENT_METHODS = {"CASH", "CARD", "TRANSFER", "MERCADOPAGO"}


class CashService:
    """Domain service for cash register operations."""

    def __init__(self, db: Session):
        self._db = db

    # -------------------------------------------------------------------------
    # Register management
    # -------------------------------------------------------------------------

    def get_or_create_register(
        self, tenant_id: int, branch_id: int, name: str = "Caja Principal"
    ) -> CashRegister:
        """Get existing register or create a default one for the branch."""
        register = self._db.scalar(
            select(CashRegister).where(
                CashRegister.tenant_id == tenant_id,
                CashRegister.branch_id == branch_id,
                CashRegister.is_active.is_(True),
            )
        )
        if register:
            return register

        register = CashRegister(
            tenant_id=tenant_id,
            branch_id=branch_id,
            name=name,
            is_open=False,
        )
        self._db.add(register)
        safe_commit(self._db)
        self._db.refresh(register)

        logger.info(
            "Cash register created",
            register_id=register.id,
            branch_id=branch_id,
        )
        return register

    # -------------------------------------------------------------------------
    # Session lifecycle
    # -------------------------------------------------------------------------

    def open_session(
        self,
        register_id: int,
        opening_amount_cents: int,
        user_id: int,
        tenant_id: int,
        branch_id: int,
    ) -> CashSession:
        """
        Open a new cash session.

        Validates register exists, is not already open, and creates session.
        """
        register = self._db.scalar(
            select(CashRegister).where(
                CashRegister.id == register_id,
                CashRegister.tenant_id == tenant_id,
                CashRegister.is_active.is_(True),
            ).with_for_update()
        )

        if not register:
            raise NotFoundError("Caja registradora", register_id, tenant_id=tenant_id)

        if register.is_open:
            raise ValidationError(
                "La caja ya está abierta. Cerrá la sesión actual antes de abrir una nueva."
            )

        if opening_amount_cents < 0:
            raise ValidationError("El monto de apertura no puede ser negativo.")

        now = datetime.now(timezone.utc)
        session = CashSession(
            tenant_id=tenant_id,
            branch_id=branch_id,
            cash_register_id=register_id,
            opened_by_id=user_id,
            opened_at=now,
            opening_amount_cents=opening_amount_cents,
            status="OPEN",
        )
        self._db.add(session)
        self._db.flush()  # Get session.id

        # Update register
        register.is_open = True
        register.current_session_id = session.id

        safe_commit(self._db)
        self._db.refresh(session)

        logger.info(
            "Cash session opened",
            session_id=session.id,
            register_id=register_id,
            opening_amount=opening_amount_cents,
            user_id=user_id,
        )
        return session

    def record_movement(
        self,
        session_id: int,
        movement_type: str,
        amount_cents: int,
        payment_method: str,
        tenant_id: int,
        description: str | None = None,
        user_id: int | None = None,
        reference_type: str | None = None,
        reference_id: int | None = None,
    ) -> CashMovement:
        """Record a cash movement in the active session."""
        if movement_type not in VALID_MOVEMENT_TYPES:
            raise ValidationError(
                f"Tipo de movimiento inválido: {movement_type}. "
                f"Valores válidos: {', '.join(sorted(VALID_MOVEMENT_TYPES))}"
            )

        if payment_method not in VALID_PAYMENT_METHODS:
            raise ValidationError(
                f"Método de pago inválido: {payment_method}. "
                f"Valores válidos: {', '.join(sorted(VALID_PAYMENT_METHODS))}"
            )

        session = self._db.scalar(
            select(CashSession).where(
                CashSession.id == session_id,
                CashSession.tenant_id == tenant_id,
                CashSession.status == "OPEN",
                CashSession.is_active.is_(True),
            )
        )

        if not session:
            raise NotFoundError("Sesión de caja abierta", session_id, tenant_id=tenant_id)

        movement = CashMovement(
            tenant_id=tenant_id,
            cash_session_id=session_id,
            movement_type=movement_type,
            amount_cents=amount_cents,
            payment_method=payment_method,
            description=description,
            performed_by_id=user_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        self._db.add(movement)
        safe_commit(self._db)
        self._db.refresh(movement)

        logger.info(
            "Cash movement recorded",
            movement_id=movement.id,
            session_id=session_id,
            type=movement_type,
            amount=amount_cents,
            method=payment_method,
        )
        return movement

    def close_session(
        self,
        session_id: int,
        actual_amount_cents: int,
        user_id: int,
        tenant_id: int,
        notes: str | None = None,
    ) -> CashSession:
        """
        Close a cash session.

        Calculates expected amount from opening + movements, computes difference.
        """
        session = self._db.scalar(
            select(CashSession).where(
                CashSession.id == session_id,
                CashSession.tenant_id == tenant_id,
                CashSession.status == "OPEN",
                CashSession.is_active.is_(True),
            ).with_for_update()
        )

        if not session:
            raise NotFoundError("Sesión de caja abierta", session_id, tenant_id=tenant_id)

        if actual_amount_cents < 0:
            raise ValidationError("El monto real contado no puede ser negativo.")

        # Calculate expected: opening + sum of all CASH movements
        cash_movement_total = self._db.scalar(
            select(func.coalesce(func.sum(CashMovement.amount_cents), 0)).where(
                CashMovement.cash_session_id == session_id,
                CashMovement.payment_method == "CASH",
                CashMovement.is_active.is_(True),
            )
        ) or 0

        expected = session.opening_amount_cents + cash_movement_total
        difference = actual_amount_cents - expected

        now = datetime.now(timezone.utc)
        session.status = "CLOSED"
        session.closed_by_id = user_id
        session.closed_at = now
        session.expected_amount_cents = expected
        session.actual_amount_cents = actual_amount_cents
        session.difference_cents = difference
        session.notes = notes

        # Update register
        register = self._db.scalar(
            select(CashRegister).where(
                CashRegister.id == session.cash_register_id
            ).with_for_update()
        )
        if register:
            register.is_open = False
            register.current_session_id = None

        safe_commit(self._db)
        self._db.refresh(session)

        logger.info(
            "Cash session closed",
            session_id=session.id,
            expected=expected,
            actual=actual_amount_cents,
            difference=difference,
            user_id=user_id,
        )
        return session

    # -------------------------------------------------------------------------
    # Queries
    # -------------------------------------------------------------------------

    def get_current_session(
        self, tenant_id: int, branch_id: int
    ) -> CashSession | None:
        """Get the currently open session for a branch."""
        return self._db.scalar(
            select(CashSession).where(
                CashSession.tenant_id == tenant_id,
                CashSession.branch_id == branch_id,
                CashSession.status == "OPEN",
                CashSession.is_active.is_(True),
            )
        )

    def get_session_summary(self, session_id: int, tenant_id: int) -> dict[str, Any]:
        """
        Get detailed summary for a session.

        Returns totals by payment method, movements list, and difference.
        """
        session = self._db.scalar(
            select(CashSession).where(
                CashSession.id == session_id,
                CashSession.tenant_id == tenant_id,
                CashSession.is_active.is_(True),
            )
        )

        if not session:
            raise NotFoundError("Sesión de caja", session_id, tenant_id=tenant_id)

        # All movements
        movements = self._db.execute(
            select(CashMovement).where(
                CashMovement.cash_session_id == session_id,
                CashMovement.is_active.is_(True),
            ).order_by(CashMovement.created_at)
        ).scalars().all()

        # Totals by payment method
        totals_by_method: dict[str, int] = {}
        totals_by_type: dict[str, int] = {}
        for m in movements:
            totals_by_method[m.payment_method] = (
                totals_by_method.get(m.payment_method, 0) + m.amount_cents
            )
            totals_by_type[m.movement_type] = (
                totals_by_type.get(m.movement_type, 0) + m.amount_cents
            )

        return {
            "session_id": session.id,
            "status": session.status,
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
            "closed_at": session.closed_at.isoformat() if session.closed_at else None,
            "opening_amount_cents": session.opening_amount_cents,
            "expected_amount_cents": session.expected_amount_cents,
            "actual_amount_cents": session.actual_amount_cents,
            "difference_cents": session.difference_cents,
            "notes": session.notes,
            "totals_by_method": totals_by_method,
            "totals_by_type": totals_by_type,
            "movements": [
                {
                    "id": m.id,
                    "movement_type": m.movement_type,
                    "amount_cents": m.amount_cents,
                    "payment_method": m.payment_method,
                    "description": m.description,
                    "reference_type": m.reference_type,
                    "reference_id": m.reference_id,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in movements
            ],
            "movement_count": len(movements),
        }

    def list_sessions(
        self,
        tenant_id: int,
        branch_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list[CashSession]:
        """List cash sessions for a branch, most recent first."""
        return list(
            self._db.execute(
                select(CashSession)
                .where(
                    CashSession.tenant_id == tenant_id,
                    CashSession.branch_id == branch_id,
                    CashSession.is_active.is_(True),
                )
                .order_by(CashSession.opened_at.desc())
                .limit(limit)
                .offset(offset)
            ).scalars().all()
        )
