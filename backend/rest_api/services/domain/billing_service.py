"""
Billing Domain Service.

CRIT-01 FIX: Handles check and payment business logic.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from rest_api.models import (
    Table,
    TableSession,
    Round,
    RoundItem,
    Product,
    Check,
    Payment,
)
from shared.utils.schemas import (
    CheckDetailOutput,
    CheckItemOutput,
    PaymentOutput,
    WaiterSessionSummaryOutput,
)
from rest_api.services.domain.audit_service import AuditService
from shared.utils.exceptions import (
    NotFoundError,
    ForbiddenError,
    CheckNotFoundError,
)

logger = get_logger(__name__)


class BillingService:
    """
    Domain service for Check and Payment operations.
    
    CRIT-01 FIX: Extracted from diner/orders.py router.
    """
    
    def __init__(self, db: Session):
        self._db = db
        self._audit = AuditService(db)
    
    def calculate_session_total(self, session_id: int) -> int:
        """Calculate total from all non-canceled rounds."""
        total_cents = self._db.scalar(
            select(func.sum(RoundItem.unit_price_cents * RoundItem.qty))
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.table_session_id == session_id,
                Round.status != "CANCELED",
            )
        ) or 0
        return total_cents
    
    def get_session_total(
        self,
        session_id: int,
    ) -> dict[str, Any]:
        """
        Get total amount for a session.
        
        Returns dict with total, paid, check info.
        """
        total_cents = self.calculate_session_total(session_id)
        
        # Get active check
        check = self._db.scalar(
            select(Check)
            .where(Check.table_session_id == session_id)
            .order_by(Check.created_at.desc())
        )
        
        return {
            "session_id": session_id,
            "total_cents": total_cents,
            "paid_cents": check.paid_cents if check else 0,
            "check_id": check.id if check else None,
            "check_status": check.status if check else None,
        }
    
    def get_or_create_check(
        self,
        tenant_id: int,
        branch_id: int,
        session_id: int,
    ) -> tuple[Check, bool]:
        """
        Get or create a check for session.
        
        Returns (check, is_new) tuple.
        """
        # Check if exists
        existing = self._db.scalar(
            select(Check)
            .where(Check.table_session_id == session_id)
            .order_by(Check.created_at.desc())
        )
        
        if existing:
            return existing, False
        
        # Calculate total
        total_cents = self.calculate_session_total(session_id)
        
        # Create check
        check = Check(
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_session_id=session_id,
            total_cents=total_cents,
            paid_cents=0,
            status="OPEN",
        )
        self._db.add(check)
        safe_commit(self._db)
        self._db.refresh(check)
        
        self._audit.log(
            tenant_id=tenant_id,
            user_id=None,
            user_email=None,
            action="CREATE",
            entity_type="check",
            entity_id=check.id,
            new_values={"total_cents": total_cents, "session_id": session_id, "status": "OPEN"},
        )

        logger.info(
            "Check created",
            check_id=check.id,
            session_id=session_id,
            total_cents=total_cents,
        )

        return check, True
    
    def request_check(
        self,
        tenant_id: int,
        branch_id: int,
        session_id: int,
    ) -> tuple[Check, int, bool]:
        """
        REF-02: Request check for a session (waiter flow).
        
        Returns (check, items_count, is_new) tuple.
        If check already exists, returns existing check with is_new=False.
        Updates session status to PAYING if new check created.
        """
        # Check for existing check (idempotency)
        existing = self._db.scalar(
            select(Check)
            .where(
                Check.table_session_id == session_id,
                Check.tenant_id == tenant_id,
                Check.is_active.is_(True),
            )
        )
        
        if existing:
            # Calculate items count from session rounds
            items_count = self._get_session_items_count(session_id)
            return existing, items_count, False
        
        # Calculate total and items from all submitted rounds
        total_cents = 0
        items_count = 0
        
        rounds = self._db.execute(
            select(Round)
            .where(
                Round.table_session_id == session_id,
                Round.status.notin_(["DRAFT", "CANCELED"]),
            )
        ).scalars().all()
        
        for round_obj in rounds:
            items = self._db.execute(
                select(RoundItem).where(RoundItem.round_id == round_obj.id)
            ).scalars().all()
            for item in items:
                total_cents += item.unit_price_cents * item.qty
                items_count += item.qty
        
        if total_cents == 0:
            raise ValueError("No items to bill. Submit at least one round first.")
        
        # Create check with REQUESTED status
        check = Check(
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_session_id=session_id,
            status="REQUESTED",
            total_cents=total_cents,
            paid_cents=0,
        )
        self._db.add(check)
        
        # Update session status to PAYING
        session = self._db.scalar(
            select(TableSession).where(TableSession.id == session_id)
        )
        if session:
            session.status = "PAYING"
        
        safe_commit(self._db)
        self._db.refresh(check)
        
        self._audit.log(
            tenant_id=tenant_id,
            user_id=None,
            user_email=None,
            action="CREATE",
            entity_type="check",
            entity_id=check.id,
            new_values={
                "total_cents": total_cents,
                "session_id": session_id,
                "status": "REQUESTED",
                "items_count": items_count,
            },
        )

        logger.info(
            "Check requested",
            check_id=check.id,
            session_id=session_id,
            total_cents=total_cents,
            items_count=items_count,
        )

        return check, items_count, True
    
    def _get_session_items_count(self, session_id: int) -> int:
        """Get total items count for a session."""
        rounds = self._db.execute(
            select(Round)
            .where(
                Round.table_session_id == session_id,
                Round.status.notin_(["DRAFT", "CANCELED"]),
            )
        ).scalars().all()
        
        items_count = 0
        for round_obj in rounds:
            items = self._db.execute(
                select(RoundItem).where(RoundItem.round_id == round_obj.id)
            ).scalars().all()
            items_count += sum(item.qty for item in items)
        
        return items_count
    
    def get_check_detail(
        self,
        session_id: int,
        table_id: int,
    ) -> CheckDetailOutput:
        """
        Get full check detail with items and payments.
        """
        # Get check
        check = self._db.scalar(
            select(Check)
            .where(Check.table_session_id == session_id)
            .order_by(Check.created_at.desc())
        )
        
        if not check:
            raise CheckNotFoundError(session_id=session_id)

        # Get table
        table = self._db.scalar(select(Table).where(Table.id == table_id))
        
        # Get items from all non-canceled rounds
        items_query = self._db.execute(
            select(RoundItem, Product, Round.round_number)
            .join(Product, RoundItem.product_id == Product.id)
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.table_session_id == session_id,
                Round.status != "CANCELED",
            )
            .order_by(Round.round_number, RoundItem.id)
        ).all()
        
        items = [
            CheckItemOutput(
                product_name=product.name,
                qty=item.qty,
                unit_price_cents=item.unit_price_cents,
                subtotal_cents=item.qty * item.unit_price_cents,
                notes=item.notes,
                round_number=round_number,
            )
            for item, product, round_number in items_query
        ]
        
        # Get payments
        payments = self._db.execute(
            select(Payment)
            .where(Payment.check_id == check.id)
            .order_by(Payment.created_at)
        ).scalars().all()
        
        payment_outputs = [
            PaymentOutput(
                id=p.id,
                provider=p.provider,
                status=p.status,
                amount_cents=p.amount_cents,
                created_at=p.created_at,
            )
            for p in payments
        ]
        
        return CheckDetailOutput(
            id=check.id,
            status=check.status,
            total_cents=check.total_cents,
            paid_cents=check.paid_cents,
            remaining_cents=max(0, check.total_cents - check.paid_cents),
            items=items,
            payments=payment_outputs,
            created_at=check.created_at,
            table_code=table.code if table else None,
        )
    
    def record_payment(
        self,
        check_id: int,
        provider: str,
        amount_cents: int,
        external_id: str | None = None,
    ) -> Payment:
        """
        Record a payment for a check.
        
        Updates check paid_cents and status.
        """
        check = self._db.scalar(select(Check).where(Check.id == check_id))
        if not check:
            raise CheckNotFoundError(check_id)

        # Create payment
        payment = Payment(
            tenant_id=check.tenant_id,
            branch_id=check.branch_id,
            check_id=check_id,
            provider=provider,
            amount_cents=amount_cents,
            status="APPROVED",
            external_id=external_id,
        )
        self._db.add(payment)
        
        # Update check
        check.paid_cents += amount_cents
        if check.paid_cents >= check.total_cents:
            check.status = "PAID"
            check.paid_at = datetime.now(timezone.utc)
        
        safe_commit(self._db)
        self._db.refresh(payment)
        
        self._audit.log(
            tenant_id=check.tenant_id,
            user_id=None,
            user_email=None,
            action="PAYMENT",
            entity_type="payment",
            entity_id=payment.id,
            new_values={
                "check_id": check_id,
                "amount_cents": amount_cents,
                "provider": provider,
                "status": "APPROVED",
                "check_status": check.status,
            },
        )

        logger.info(
            "Payment recorded",
            payment_id=payment.id,
            check_id=check_id,
            amount_cents=amount_cents,
            check_status=check.status,
        )

        return payment
    
    def record_manual_payment(
        self,
        check_id: int,
        amount_cents: int,
        manual_method: str,
        waiter_id: int,
        branch_ids: list[int],
        notes: str | None = None,
    ) -> tuple[Payment, Check]:
        """
        REF-02: Record a manual payment (cash/card_physical) by waiter.
        
        Returns (payment, check) tuple.
        Raises CheckNotFoundError if check not found or no access.
        Raises ValueError if validation fails.
        """
        # Find check with lock
        check = self._db.scalar(
            select(Check)
            .where(
                Check.id == check_id,
                Check.is_active.is_(True),
            )
            .with_for_update()
        )
        
        if not check:
            raise CheckNotFoundError(check_id)

        # Verify branch access (returns 404 to avoid leaking check existence
        # across branches; deliberately conflated with not-found)
        if check.branch_id not in branch_ids:
            raise CheckNotFoundError(check_id, no_access=True, branch_id=check.branch_id)
        
        # Validate check status
        if check.status not in ["REQUESTED", "IN_PAYMENT"]:
            raise ValueError(f"Cannot pay check with status {check.status}")
        
        # Calculate remaining
        remaining = check.total_cents - check.paid_cents
        if amount_cents > remaining:
            raise ValueError(
                f"Payment amount ({amount_cents}) exceeds remaining balance ({remaining})"
            )
        
        # Determine provider
        provider = "CASH" if manual_method == "CASH" else "CARD_PHYSICAL"
        
        # Create payment
        payment = Payment(
            tenant_id=check.tenant_id,
            branch_id=check.branch_id,
            check_id=check_id,
            provider=provider,
            status="APPROVED",
            amount_cents=amount_cents,
            payment_category="MANUAL",
            registered_by="WAITER",
            registered_by_waiter_id=waiter_id,
            manual_method=manual_method,
            manual_notes=notes,
        )
        self._db.add(payment)
        
        # Update check
        check.paid_cents += amount_cents
        if check.paid_cents >= check.total_cents:
            check.status = "PAID"
        else:
            check.status = "IN_PAYMENT"
        
        safe_commit(self._db)
        self._db.refresh(payment)
        self._db.refresh(check)
        
        self._audit.log(
            tenant_id=check.tenant_id,
            user_id=waiter_id,
            user_email=None,
            action="PAYMENT",
            entity_type="payment",
            entity_id=payment.id,
            new_values={
                "check_id": check_id,
                "amount_cents": amount_cents,
                "provider": provider,
                "manual_method": manual_method,
                "waiter_id": waiter_id,
                "status": "APPROVED",
                "check_status": check.status,
            },
        )

        logger.info(
            "Manual payment recorded",
            payment_id=payment.id,
            check_id=check_id,
            amount_cents=amount_cents,
            method=manual_method,
            waiter_id=waiter_id,
            check_status=check.status,
        )

        return payment, check

    def get_waiter_session_summary(
        self,
        session_id: int,
        tenant_id: int,
        branch_ids: list[int],
    ) -> WaiterSessionSummaryOutput:
        """
        S4.1 REFACTOR: Build waiter session summary with traceability info.

        Read-only aggregation. Returns full WaiterSessionSummaryOutput including
        session metadata, totals, check info, and hybrid-flow indicator.

        Raises:
            NotFoundError: If session does not exist for this tenant.
            ForbiddenError: If caller has no access to the session's branch.
        """
        from sqlalchemy.orm import joinedload, selectinload  # local import to avoid top-level churn

        # Find session with related data (mirror router-side load options).
        session = self._db.scalar(
            select(TableSession)
            .options(
                joinedload(TableSession.table),
                selectinload(TableSession.rounds),
                selectinload(TableSession.diners),
            )
            .where(
                TableSession.id == session_id,
                TableSession.tenant_id == tenant_id,
            )
        )

        if not session:
            raise NotFoundError("Sesión", session_id)

        # Verify branch access (must match HTTP 403 contract from router).
        if session.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        # Get check info if exists (tenant-scoped, defense-in-depth).
        check = self._db.scalar(
            select(Check)
            .where(
                Check.table_session_id == session_id,
                Check.tenant_id == tenant_id,
                Check.is_active.is_(True),
            )
        )

        # Calculate totals from rounds using a single aggregated query
        # (matches HIGH-N+1-01 FIX in original router).
        valid_round_ids = [
            r.id for r in session.rounds
            if r.status not in ["DRAFT", "CANCELED"]
        ]
        total_cents = 0
        if valid_round_ids:
            total_cents = self._db.scalar(
                select(func.coalesce(func.sum(RoundItem.unit_price_cents * RoundItem.qty), 0))
                .where(RoundItem.round_id.in_(valid_round_ids))
            ) or 0

        # Hybrid-flow detection: both waiter- and diner-submitted rounds present.
        has_waiter_rounds = any(r.submitted_by == "WAITER" for r in session.rounds)
        has_diner_rounds = any(r.submitted_by == "DINER" for r in session.rounds)
        is_hybrid = has_waiter_rounds and has_diner_rounds

        table = session.table
        diner_count = len(session.diners) if session.diners else 0

        return WaiterSessionSummaryOutput(
            session_id=session.id,
            table_id=table.id if table else 0,
            table_code=table.code if table else "",
            status=session.status,
            opened_at=session.opened_at,
            opened_by=session.opened_by,
            opened_by_waiter_id=session.opened_by_waiter_id,
            assigned_waiter_id=session.assigned_waiter_id,
            diner_count=diner_count,
            rounds_count=len(session.rounds),
            total_cents=check.total_cents if check else total_cents,
            paid_cents=check.paid_cents if check else 0,
            check_status=check.status if check else None,
            is_hybrid=is_hybrid,
        )
