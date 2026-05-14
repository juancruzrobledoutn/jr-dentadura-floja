"""
Tip Domain Service.

Handles tip recording, distribution via pools, and reporting.
"""

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from shared.utils.exceptions import NotFoundError, ValidationError
from rest_api.models.tip import Tip, TipDistribution, TipPool
from rest_api.services.domain.audit_service import AuditService

logger = get_logger(__name__)

VALID_TIP_METHODS = {"CASH", "CARD", "MERCADOPAGO"}
VALID_ROLES = {"WAITER", "KITCHEN", "MANAGER"}


class TipService:
    """Domain service for tip operations."""

    def __init__(self, db: Session):
        self._db = db
        self._audit = AuditService(db)

    # -------------------------------------------------------------------------
    # Tip CRUD
    # -------------------------------------------------------------------------

    def record_tip(
        self,
        tenant_id: int,
        branch_id: int,
        amount_cents: int,
        payment_method: str,
        waiter_id: int | None = None,
        table_session_id: int | None = None,
        check_id: int | None = None,
    ) -> Tip:
        """Record a new tip."""
        if amount_cents <= 0:
            raise ValidationError("El monto de la propina debe ser mayor a cero.")

        if payment_method not in VALID_TIP_METHODS:
            raise ValidationError(
                f"Método de pago inválido: {payment_method}. "
                f"Valores válidos: {', '.join(sorted(VALID_TIP_METHODS))}"
            )

        tip = Tip(
            tenant_id=tenant_id,
            branch_id=branch_id,
            amount_cents=amount_cents,
            payment_method=payment_method,
            waiter_id=waiter_id,
            table_session_id=table_session_id,
            check_id=check_id,
        )
        self._db.add(tip)
        safe_commit(self._db)
        self._db.refresh(tip)

        self._audit.log(
            tenant_id=tenant_id,
            user_id=waiter_id,
            user_email=None,
            action="CREATE",
            entity_type="tip",
            entity_id=tip.id,
            new_values={
                "amount_cents": amount_cents,
                "payment_method": payment_method,
                "waiter_id": waiter_id,
                "table_session_id": table_session_id,
            },
        )

        logger.info(
            "Tip recorded",
            tip_id=tip.id,
            amount=amount_cents,
            method=payment_method,
            waiter_id=waiter_id,
        )
        return tip

    def distribute_tip(self, tip_id: int, pool_id: int, tenant_id: int) -> list[TipDistribution]:
        """
        Split a tip according to pool percentages.

        Creates TipDistribution records for each role based on the pool config.
        Note: Staff assignment to roles is determined by the pool percentages,
        actual user assignment should be done by the caller or a higher-level service.
        """
        tip = self._db.scalar(
            select(Tip).where(
                Tip.id == tip_id,
                Tip.tenant_id == tenant_id,
                Tip.is_active.is_(True),
            )
        )
        if not tip:
            raise NotFoundError("Propina", tip_id, tenant_id=tenant_id)

        pool = self._db.scalar(
            select(TipPool).where(
                TipPool.id == pool_id,
                TipPool.tenant_id == tenant_id,
                TipPool.is_active.is_(True),
            )
        )
        if not pool:
            raise NotFoundError("Pool de propinas", pool_id, tenant_id=tenant_id)

        # Check if already distributed
        existing = self._db.scalar(
            select(func.count(TipDistribution.id)).where(
                TipDistribution.tip_id == tip_id,
                TipDistribution.is_active.is_(True),
            )
        )
        if existing and existing > 0:
            raise ValidationError("Esta propina ya fue distribuida.")

        distributions = []
        total = tip.amount_cents

        # Calculate amounts (waiter gets remainder to handle rounding)
        kitchen_amount = (total * pool.kitchen_percent) // 100
        other_amount = (total * pool.other_percent) // 100
        waiter_amount = total - kitchen_amount - other_amount

        role_amounts = [
            ("WAITER", waiter_amount),
            ("KITCHEN", kitchen_amount),
            ("MANAGER", other_amount),
        ]

        for role, amount in role_amounts:
            if amount > 0:
                dist = TipDistribution(
                    tenant_id=tenant_id,
                    tip_id=tip_id,
                    user_id=tip.waiter_id or 0,  # Default; caller should set actual users
                    amount_cents=amount,
                    role=role,
                )
                self._db.add(dist)
                distributions.append(dist)

        safe_commit(self._db)
        for d in distributions:
            self._db.refresh(d)

        logger.info(
            "Tip distributed",
            tip_id=tip_id,
            pool_id=pool_id,
            distributions=len(distributions),
        )
        return distributions

    # -------------------------------------------------------------------------
    # Queries
    # -------------------------------------------------------------------------

    def list_tips(
        self,
        tenant_id: int,
        branch_id: int | None = None,
        waiter_id: int | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Tip]:
        """List tips with optional filters."""
        query = select(Tip).where(
            Tip.tenant_id == tenant_id,
            Tip.is_active.is_(True),
        )

        if branch_id is not None:
            query = query.where(Tip.branch_id == branch_id)
        if waiter_id is not None:
            query = query.where(Tip.waiter_id == waiter_id)
        if date_from is not None:
            query = query.where(Tip.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
        if date_to is not None:
            next_day = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
            query = query.where(Tip.created_at <= next_day)

        query = query.order_by(Tip.created_at.desc()).limit(limit).offset(offset)
        return list(self._db.execute(query).scalars().all())

    def get_waiter_tips(
        self,
        user_id: int,
        tenant_id: int,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        """Tips earned by a waiter in a period."""
        query = select(Tip).where(
            Tip.tenant_id == tenant_id,
            Tip.waiter_id == user_id,
            Tip.is_active.is_(True),
        )

        if date_from is not None:
            query = query.where(Tip.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
        if date_to is not None:
            next_day = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
            query = query.where(Tip.created_at <= next_day)

        tips = list(self._db.execute(query.order_by(Tip.created_at.desc())).scalars().all())

        total_cents = sum(t.amount_cents for t in tips)
        by_method: dict[str, int] = {}
        for t in tips:
            by_method[t.payment_method] = by_method.get(t.payment_method, 0) + t.amount_cents

        return {
            "user_id": user_id,
            "total_cents": total_cents,
            "tip_count": len(tips),
            "by_method": by_method,
            "tips": [
                {
                    "id": t.id,
                    "amount_cents": t.amount_cents,
                    "payment_method": t.payment_method,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tips
            ],
        }

    def get_branch_tip_report(
        self,
        branch_id: int,
        tenant_id: int,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        """All tips for a branch in a period."""
        query = select(Tip).where(
            Tip.tenant_id == tenant_id,
            Tip.branch_id == branch_id,
            Tip.is_active.is_(True),
        )

        if date_from is not None:
            query = query.where(Tip.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
        if date_to is not None:
            next_day = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
            query = query.where(Tip.created_at <= next_day)

        tips = list(self._db.execute(query.order_by(Tip.created_at.desc())).scalars().all())

        total_cents = sum(t.amount_cents for t in tips)
        by_method: dict[str, int] = {}
        by_waiter: dict[int, int] = {}
        for t in tips:
            by_method[t.payment_method] = by_method.get(t.payment_method, 0) + t.amount_cents
            if t.waiter_id:
                by_waiter[t.waiter_id] = by_waiter.get(t.waiter_id, 0) + t.amount_cents

        return {
            "branch_id": branch_id,
            "total_cents": total_cents,
            "tip_count": len(tips),
            "by_method": by_method,
            "by_waiter": {str(k): v for k, v in by_waiter.items()},
        }

    # -------------------------------------------------------------------------
    # Tip Pool CRUD
    # -------------------------------------------------------------------------

    def create_pool(
        self,
        tenant_id: int,
        branch_id: int,
        name: str,
        waiter_percent: int,
        kitchen_percent: int,
        other_percent: int,
    ) -> TipPool:
        """Create a tip pool configuration."""
        if waiter_percent + kitchen_percent + other_percent != 100:
            raise ValidationError("Los porcentajes deben sumar 100.")
        if waiter_percent < 0 or kitchen_percent < 0 or other_percent < 0:
            raise ValidationError("Los porcentajes no pueden ser negativos.")

        pool = TipPool(
            tenant_id=tenant_id,
            branch_id=branch_id,
            name=name.strip(),
            waiter_percent=waiter_percent,
            kitchen_percent=kitchen_percent,
            other_percent=other_percent,
        )
        self._db.add(pool)
        safe_commit(self._db)
        self._db.refresh(pool)

        logger.info("Tip pool created", pool_id=pool.id, branch_id=branch_id)
        return pool

    def list_pools(self, tenant_id: int, branch_id: int | None = None) -> list[TipPool]:
        """List tip pools, optionally filtered by branch."""
        query = select(TipPool).where(
            TipPool.tenant_id == tenant_id,
            TipPool.is_active.is_(True),
        )
        if branch_id is not None:
            query = query.where(TipPool.branch_id == branch_id)
        return list(self._db.execute(query.order_by(TipPool.name)).scalars().all())

    def update_pool(
        self,
        pool_id: int,
        tenant_id: int,
        name: str | None = None,
        waiter_percent: int | None = None,
        kitchen_percent: int | None = None,
        other_percent: int | None = None,
    ) -> TipPool:
        """Update a tip pool."""
        pool = self._db.scalar(
            select(TipPool).where(
                TipPool.id == pool_id,
                TipPool.tenant_id == tenant_id,
                TipPool.is_active.is_(True),
            )
        )
        if not pool:
            raise NotFoundError("Pool de propinas", pool_id, tenant_id=tenant_id)

        if name is not None:
            pool.name = name.strip()

        # Validate percentages if any are provided
        w = waiter_percent if waiter_percent is not None else pool.waiter_percent
        k = kitchen_percent if kitchen_percent is not None else pool.kitchen_percent
        o = other_percent if other_percent is not None else pool.other_percent

        if w + k + o != 100:
            raise ValidationError("Los porcentajes deben sumar 100.")
        if w < 0 or k < 0 or o < 0:
            raise ValidationError("Los porcentajes no pueden ser negativos.")

        pool.waiter_percent = w
        pool.kitchen_percent = k
        pool.other_percent = o

        safe_commit(self._db)
        self._db.refresh(pool)
        return pool

    def delete_pool(self, pool_id: int, tenant_id: int, user_id: int, user_email: str) -> None:
        """Soft delete a tip pool."""
        pool = self._db.scalar(
            select(TipPool).where(
                TipPool.id == pool_id,
                TipPool.tenant_id == tenant_id,
                TipPool.is_active.is_(True),
            )
        )
        if not pool:
            raise NotFoundError("Pool de propinas", pool_id, tenant_id=tenant_id)

        pool.soft_delete(user_id, user_email)
        safe_commit(self._db)
