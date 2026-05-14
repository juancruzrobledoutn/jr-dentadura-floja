"""
Round Domain Service.

CRIT-01 FIX: Extracted from diner/orders.py for thin controller pattern.
Handles all round-related business logic.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload, joinedload

from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from rest_api.models import (
    Table,
    TableSession,
    Round,
    RoundItem,
    Product,
    BranchProduct,
    CartItem,
)
from shared.utils.schemas import (
    SubmitRoundRequest,
    SubmitRoundResponse,
    RoundOutput,
    RoundItemOutput,
)
from rest_api.services.domain.audit_service import AuditService
from shared.utils.exceptions import (
    NotFoundError,
    ConflictError,
    ValidationError,
    ForbiddenError,
    RoundNotFoundError,
)

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger = get_logger(__name__)


# -----------------------------------------------------------------------------
# Service-local exceptions that DO NOT map cleanly to shared.utils.exceptions
# because they carry structured payloads consumed by callers.
# -----------------------------------------------------------------------------


class InsufficientStockError(Exception):
    """One or more products have insufficient stock.

    Carries `unavailable_items: list[str]` which the diner router renders as a
    structured 409 JSON body (per-product feedback). Cannot be replaced with the
    plain shared ConflictError without losing that structure.
    """
    def __init__(self, unavailable_items: list[str]):
        self.unavailable_items = unavailable_items
        items_str = ", ".join(unavailable_items)
        super().__init__(f"Insufficient stock for: {items_str}")


class DuplicateRoundError(Exception):
    """Duplicate round detected (idempotency).

    NOT an HTTP error: the router catches it and returns a successful
    SubmitRoundResponse echoing the existing round. Carries round_id /
    round_number / status used to build that response.
    """
    def __init__(self, round_id: int, round_number: int, status: str):
        self.round_id = round_id
        self.round_number = round_number
        self.status = status
        super().__init__(f"Round {round_id} already exists")


class RoundService:
    """
    Domain service for Round operations.
    
    CRIT-01 FIX: Extracted from diner/orders.py router.
    Encapsulates all business logic for round submission and retrieval.
    """
    
    def __init__(self, db: Session):
        self._db = db
        self._audit = AuditService(db)
    
    def check_idempotency(
        self,
        session_id: int,
        idempotency_key: str | None,
    ) -> Round | None:
        """
        Check if a round with this idempotency key already exists.
        
        Returns the existing round if found, None otherwise.
        """
        if not idempotency_key:
            return None
        
        existing = self._db.scalar(
            select(Round).where(
                Round.table_session_id == session_id,
                Round.idempotency_key == idempotency_key,
                Round.status != "CANCELED",
            )
        )
        return existing
    
    def validate_session(self, session_id: int) -> TableSession:
        """
        Validate session exists and is OPEN (not PAYING or CLOSED).

        Orders are only allowed when the session is OPEN.
        Once a check is requested (PAYING), no new rounds can be submitted.

        Raises ConflictError (409) if session doesn't exist or is not OPEN.
        """
        session = self._db.scalar(
            select(TableSession).where(TableSession.id == session_id)
        )
        if not session:
            raise ConflictError("Session does not exist", session_id=session_id)
        if session.status != "OPEN":
            raise ConflictError(
                f"Session is in '{session.status}' state. Orders are only allowed when session is OPEN.",
                session_id=session_id,
                current_status=session.status,
            )
        return session
    
    def get_table_sector_id(self, table_id: int) -> int | None:
        """Get sector_id for a table, for targeted waiter notifications."""
        table = self._db.scalar(select(Table).where(Table.id == table_id))
        return table.sector_id if table else None
    
    def submit_round(
        self,
        tenant_id: int,
        branch_id: int,
        session_id: int,
        table_id: int,
        request: SubmitRoundRequest,
        idempotency_key: str | None = None,
    ) -> tuple[Round, int]:
        """
        Submit a new round of orders.
        
        Returns (round, sector_id) tuple for event publishing.
        Raises:
            DuplicateRoundError: If idempotency check finds existing round
            ConflictError (409): If session is not active
            ValidationError (400): If any product is not available
            InsufficientStockError: If any product lacks stock (custom; carries items list)
        """
        # Validate session
        self.validate_session(session_id)

        # Get sector for notifications
        sector_id = self.get_table_sector_id(table_id)

        # ----------------------------------------------------------------
        # PRE-LOCK validation (read-only, no TableSession lock held).
        #
        # PERF: stock check uses a single bulk query (validate_stock_for_products)
        # instead of the legacy N+1 pattern. Running it BEFORE acquiring
        # with_for_update() means concurrent submissions don't serialize on
        # this comparatively expensive read.
        #
        # Race-condition note: a second-pass stock check is performed AFTER
        # the lock is acquired (see below) to catch the narrow window where
        # two concurrent rounds might both pass pre-validation against the
        # same scarce ingredient.
        # ----------------------------------------------------------------

        # Batch fetch products and prices (read-only).
        product_ids = [item.product_id for item in request.items]
        products_query = self._db.execute(
            select(Product, BranchProduct)
            .join(BranchProduct, Product.id == BranchProduct.product_id)
            .where(
                Product.id.in_(product_ids),
                Product.is_active.is_(True),
                BranchProduct.branch_id == branch_id,
                BranchProduct.is_available == True,
            )
        ).all()

        product_lookup = {
            product.id: (product, branch_product)
            for product, branch_product in products_query
        }

        # Validate all products available.
        for item in request.items:
            if item.product_id not in product_lookup:
                raise ValidationError(
                    f"Product {item.product_id} not available in this branch",
                    product_id=item.product_id,
                    branch_id=branch_id,
                )

        # Bulk stock validation (PRE-LOCK).
        from rest_api.services.domain.inventory_service import InventoryService
        inventory_service = InventoryService(self._db)
        products_with_qty: dict[int, int] = {}
        for item in request.items:
            # Accumulate quantities in case the same product appears twice.
            products_with_qty[item.product_id] = (
                products_with_qty.get(item.product_id, 0) + item.qty
            )

        stock_issues = inventory_service.validate_stock_for_products(
            branch_id=branch_id,
            tenant_id=tenant_id,
            products_with_qty=products_with_qty,
        )
        if stock_issues:
            unavailable_items: list[str] = []
            for product_id, insufficient in stock_issues.items():
                product, _bp = product_lookup[product_id]
                unavailable_items.append(
                    f"{product.name} (falta: {', '.join(insufficient)})"
                )
            raise InsufficientStockError(unavailable_items)

        # ----------------------------------------------------------------
        # CRITICAL SECTION: acquire the TableSession lock. From here on
        # everything must be cheap and deterministic – we deliberately
        # avoid putting expensive reads inside this block.
        # ----------------------------------------------------------------

        # Lock session to prevent race condition on concurrent submissions.
        locked_session = self._db.scalar(
            select(TableSession)
            .where(TableSession.id == session_id)
            .with_for_update()
        )
        if not locked_session:
            raise ConflictError("Session not found", session_id=session_id)

        # Check idempotency AFTER acquiring lock to prevent duplicate rounds.
        existing = self.check_idempotency(session_id, idempotency_key)
        if existing:
            raise DuplicateRoundError(
                existing.id,
                existing.round_number,
                existing.status,
            )

        # Intra-lock stock re-check (race-condition safety net).
        # Bulk query – same cost profile as the pre-lock check (~1ms).
        # Catches the narrow window between pre-lock validation and lock
        # acquisition where another transaction may have consumed stock.
        stock_issues_intra = inventory_service.validate_stock_for_products(
            branch_id=branch_id,
            tenant_id=tenant_id,
            products_with_qty=products_with_qty,
        )
        if stock_issues_intra:
            unavailable_items_intra: list[str] = []
            for product_id, insufficient in stock_issues_intra.items():
                product, _bp = product_lookup[product_id]
                unavailable_items_intra.append(
                    f"{product.name} (falta: {', '.join(insufficient)})"
                )
            raise InsufficientStockError(unavailable_items_intra)

        # Get next round number.
        max_round = self._db.scalar(
            select(func.max(Round.round_number))
            .where(Round.table_session_id == session_id)
        ) or 0
        next_round_number = max_round + 1

        # Create round
        new_round = Round(
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_session_id=session_id,
            round_number=next_round_number,
            status="PENDING",
            submitted_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self._db.add(new_round)
        self._db.flush()
        
        # Create round items
        round_items = []
        for item in request.items:
            product, branch_product = product_lookup[item.product_id]
            round_item = RoundItem(
                tenant_id=tenant_id,
                branch_id=branch_id,
                round_id=new_round.id,
                product_id=product.id,
                qty=item.qty,
                unit_price_cents=branch_product.price_cents,
                product_name=product.name,  # Snapshot product name at order time
                notes=item.notes,
            )
            round_items.append(round_item)
        
        self._db.add_all(round_items)
        
        # Clear cart after creating round
        self._db.execute(
            CartItem.__table__.delete().where(CartItem.session_id == session_id)
        )
        
        # Commit
        safe_commit(self._db)
        self._db.refresh(new_round)
        
        self._audit.log(
            tenant_id=tenant_id,
            user_id=None,
            user_email=None,
            action="SUBMIT",
            entity_type="round",
            entity_id=new_round.id,
            new_values={
                "round_number": next_round_number,
                "session_id": session_id,
                "items_count": len(round_items),
                "status": "PENDING",
            },
        )

        logger.info(
            "Round submitted",
            round_id=new_round.id,
            session_id=session_id,
            items_count=len(round_items),
        )

        return new_round, sector_id
    
    def get_session_rounds(
        self,
        session_id: int,
    ) -> list[RoundOutput]:
        """
        Get all rounds for a session with batch loading.
        
        Uses batch loading to prevent N+1 queries.
        """
        rounds = self._db.execute(
            select(Round)
            .where(Round.table_session_id == session_id)
            .order_by(Round.round_number)
        ).scalars().all()
        
        if not rounds:
            return []
        
        # Batch load all items with products
        round_ids = [r.id for r in rounds]
        all_items = self._db.execute(
            select(RoundItem, Product)
            .join(Product, RoundItem.product_id == Product.id)
            .where(RoundItem.round_id.in_(round_ids))
        ).all()
        
        # Group by round_id
        items_by_round: dict[int, list[tuple]] = {rid: [] for rid in round_ids}
        for item, product in all_items:
            items_by_round[item.round_id].append((item, product))
        
        # Build output
        result = []
        for round_obj in rounds:
            items = items_by_round.get(round_obj.id, [])
            item_outputs = [
                RoundItemOutput(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=product.name,
                    qty=item.qty,
                    unit_price_cents=item.unit_price_cents,
                    notes=item.notes,
                )
                for item, product in items
            ]
            result.append(
                RoundOutput(
                    id=round_obj.id,
                    round_number=round_obj.round_number,
                    status=round_obj.status,
                    items=item_outputs,
                    created_at=round_obj.created_at,
                )
            )
        
        return result
    
    def confirm_round(self, round_id: int, user_id: int) -> Round:
        """
        Confirm a pending round (waiter verification).
        
        Changes status from PENDING to CONFIRMED.
        """
        round_obj = self._db.scalar(
            select(Round).where(Round.id == round_id)
        )
        if not round_obj:
            raise RoundNotFoundError(round_id)
        
        if round_obj.status != "PENDING":
            raise ValueError(f"Cannot confirm round with status {round_obj.status}")
        
        round_obj.status = "CONFIRMED"
        round_obj.confirmed_by_user_id = user_id
        round_obj.confirmed_at = datetime.now(timezone.utc)
        
        safe_commit(self._db)
        
        logger.info("Round confirmed", round_id=round_id, user_id=user_id)
        
        return round_obj
    
    def submit_to_kitchen(self, round_id: int, user_id: int) -> Round:
        """
        Submit a confirmed round to kitchen.
        
        Changes status from CONFIRMED to SUBMITTED.
        """
        round_obj = self._db.scalar(
            select(Round).where(Round.id == round_id)
        )
        if not round_obj:
            raise RoundNotFoundError(round_id)
        
        if round_obj.status not in ("CONFIRMED", "PENDING"):
            raise ValueError(f"Cannot submit round with status {round_obj.status}")
        
        round_obj.status = "SUBMITTED"
        round_obj.sent_to_kitchen_at = datetime.now(timezone.utc)
        
        safe_commit(self._db)
        
        logger.info("Round submitted to kitchen", round_id=round_id, user_id=user_id)
        
        return round_obj
    
    def cancel_round(self, round_id: int, user_id: int) -> Round:
        """
        Cancel a round.

        Only PENDING or CONFIRMED rounds can be canceled.
        """
        round_obj = self._db.scalar(
            select(Round).where(Round.id == round_id)
        )
        if not round_obj:
            raise RoundNotFoundError(round_id)

        if round_obj.status not in ("PENDING", "CONFIRMED"):
            raise ValueError(f"Cannot cancel round with status {round_obj.status}")

        round_obj.status = "CANCELED"
        round_obj.canceled_at = datetime.now(timezone.utc)

        safe_commit(self._db)

        self._audit.log(
            tenant_id=round_obj.tenant_id,
            user_id=user_id,
            user_email=None,
            action="CANCEL",
            entity_type="round",
            entity_id=round_id,
            old_values={"status": "PENDING"},
            new_values={"status": "CANCELED"},
        )

        logger.info("Round canceled", round_id=round_id, user_id=user_id)

        return round_obj

    def void_item(
        self,
        tenant_id: int,
        round_item_id: int,
        reason: str,
        user_id: int,
        branch_ids: list[int] | None = None,
    ) -> tuple[RoundItem, Round, bool]:
        """
        Void a single item from a submitted round.

        Allowed states: SUBMITTED, IN_KITCHEN, READY (not SERVED, not already voided).
        If ALL items in the round become voided, the round is auto-canceled.

        C8 PASS 3 REFACTOR: If `branch_ids` is provided, branch access is enforced
        here (legacy router-side check moved into the service).

        Returns (voided_item, round, round_canceled) tuple.
        """
        # Fetch the item with its round and table info
        item = self._db.scalar(
            select(RoundItem)
            .options(
                joinedload(RoundItem.round)
                .joinedload(Round.session)
                .joinedload(TableSession.table),
            )
            .where(
                RoundItem.id == round_item_id,
                RoundItem.tenant_id == tenant_id,
            )
        )

        if not item:
            raise NotFoundError("Item de pedido", round_item_id)

        if item.is_voided:
            raise ConflictError("Item already voided", round_item_id=round_item_id)

        round_obj = item.round

        # C8 PASS 3: Enforce branch access if caller supplied branch_ids.
        if branch_ids is not None and round_obj.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        voidable_statuses = ("SUBMITTED", "IN_KITCHEN", "READY")

        if round_obj.status not in voidable_statuses:
            raise ConflictError(
                f"Cannot void item in round with status {round_obj.status}. "
                f"Only allowed for: {', '.join(voidable_statuses)}",
                round_item_id=round_item_id,
                round_status=round_obj.status,
            )

        # Mark item as voided
        now = datetime.now(timezone.utc)
        item.is_voided = True
        item.void_reason = reason
        item.voided_by_user_id = user_id
        item.voided_at = now

        # Check if ALL items in the round are now voided
        all_items = self._db.execute(
            select(RoundItem).where(RoundItem.round_id == round_obj.id)
        ).scalars().all()

        round_canceled = all(i.is_voided for i in all_items)

        if round_canceled:
            round_obj.status = "CANCELED"

        safe_commit(self._db)

        self._audit.log(
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=None,
            action="VOID",
            entity_type="round_item",
            entity_id=round_item_id,
            new_values={
                "reason": reason,
                "round_id": round_obj.id,
                "round_canceled": round_canceled,
            },
        )

        logger.info(
            "Round item voided",
            round_item_id=round_item_id,
            round_id=round_obj.id,
            reason=reason,
            user_id=user_id,
            round_canceled=round_canceled,
        )

        return item, round_obj, round_canceled

    # -------------------------------------------------------------------------
    # S4.2 REFACTOR: Waiter-submitted round (HU-WAITER-MESA CA-03).
    # Extracted from rest_api/routers/waiter/routes.py:submit_round_for_session.
    # PROD BUG FIX: RoundItem now receives branch_id (was missing, violating NOT NULL).
    # -------------------------------------------------------------------------

    def submit_round_for_waiter(
        self,
        tenant_id: int,
        branch_ids: list[int],
        session_id: int,
        waiter_id: int,
        request,
    ) -> tuple["Round", int, int, "TableSession"]:
        """
        Submit a round on behalf of a waiter (verbal/comanda-rapida order).

        Behavior-preserving extraction of the legacy router logic:
          - locks session via SELECT FOR UPDATE
          - validates branch access
          - validates products exist + are available in the branch
          - validates inventory stock (per-item check_stock_for_product, same as legacy)
          - assigns next round_number
          - creates Round with status=PENDING and submitted_by="WAITER"
          - creates RoundItems (now includes branch_id — prod bug fix)
          - safe_commits and refreshes

        Returns (new_round, total_cents, items_count, session) for event publishing.
        Raises shared exceptions (NotFoundError / ForbiddenError / ValidationError /
        InsufficientStockError) — the router maps these to HTTPException.
        """
        # Lock session (with table joined for sector_id later in event publish)
        session = self._db.scalar(
            select(TableSession)
            .options(joinedload(TableSession.table))
            .where(
                TableSession.id == session_id,
                TableSession.tenant_id == tenant_id,
                TableSession.status == "OPEN",
            )
            .with_for_update()
        )
        if not session:
            raise NotFoundError("Sesión activa", session_id)

        # Branch access
        if session.branch_id not in branch_ids:
            raise ForbiddenError("No access to this branch")

        # Batch validate products (single query, avoid N+1)
        product_ids = [item.product_id for item in request.items]
        products_query = self._db.execute(
            select(Product, BranchProduct)
            .join(BranchProduct, Product.id == BranchProduct.product_id)
            .where(
                Product.id.in_(product_ids),
                Product.tenant_id == tenant_id,
                Product.is_active.is_(True),
                BranchProduct.branch_id == session.branch_id,
            )
        ).all()
        product_lookup = {p.id: (p, bp) for p, bp in products_query}

        for item in request.items:
            if item.product_id not in product_lookup:
                raise ValidationError(
                    f"Product {item.product_id} not available at this branch",
                    product_id=item.product_id,
                    branch_id=session.branch_id,
                )

        # Stock validation — keep per-item call (same behavior as legacy router)
        from rest_api.services.domain.inventory_service import InventoryService
        inventory_service = InventoryService(self._db)
        unavailable_items: list[str] = []
        for item in request.items:
            product, _bp = product_lookup[item.product_id]
            insufficient = inventory_service.check_stock_for_product(
                branch_id=session.branch_id,
                tenant_id=tenant_id,
                product_id=item.product_id,
                required_qty=item.qty,
            )
            if insufficient:
                unavailable_items.append(
                    f"{product.name} (falta: {', '.join(insufficient)})"
                )
        if unavailable_items:
            raise InsufficientStockError(unavailable_items)

        # Next round number
        max_round = self._db.scalar(
            select(func.max(Round.round_number))
            .where(Round.table_session_id == session_id)
        ) or 0
        next_round_number = max_round + 1

        # Create round (PENDING — admin/manager advances to kitchen)
        now = datetime.now(timezone.utc)
        new_round = Round(
            tenant_id=tenant_id,
            branch_id=session.branch_id,
            table_session_id=session_id,
            round_number=next_round_number,
            status="PENDING",
            submitted_at=now,
            submitted_by="WAITER",
            submitted_by_waiter_id=waiter_id,
        )
        self._db.add(new_round)
        self._db.flush()

        # Create round items in batch — branch_id now included (BUG FIX)
        total_cents = 0
        round_items: list[RoundItem] = []
        for item in request.items:
            product, branch_product = product_lookup[item.product_id]
            unit_price = branch_product.price_cents
            round_items.append(
                RoundItem(
                    tenant_id=tenant_id,
                    branch_id=session.branch_id,  # <-- PROD BUG FIX (was missing)
                    round_id=new_round.id,
                    product_id=item.product_id,
                    qty=item.qty,
                    unit_price_cents=unit_price,
                    notes=item.notes,
                )
            )
            total_cents += unit_price * item.qty

        self._db.add_all(round_items)
        safe_commit(self._db)
        self._db.refresh(new_round)

        return new_round, total_cents, len(round_items), session

    # -------------------------------------------------------------------------
    # C8 PASS 2 REFACTOR: Delete a round item before submission.
    # Extracted from rest_api/routers/waiter/routes.py:delete_round_item.
    # -------------------------------------------------------------------------

    def delete_round_item(
        self,
        tenant_id: int,
        branch_ids: list[int],
        round_id: int,
        item_id: int,
    ) -> tuple["Round", int, int, bool]:
        """
        Delete an item from a PENDING/CONFIRMED round.

        If the round becomes empty after deletion, the entire round is deleted.

        Behavior-preserving extraction of the legacy router logic:
          - 404 if round not found
          - 403 if no branch access
          - 400 if round status not in PENDING/CONFIRMED
          - 404 if item not part of the round
          - returns (round_obj, deleted_product_id, remaining_items, round_deleted)
            so router can publish ROUND_ITEM_DELETED event with full context
        """
        round_obj = self._db.scalar(
            select(Round)
            .options(
                selectinload(Round.items),
                joinedload(Round.session).joinedload(TableSession.table),
            )
            .where(
                Round.id == round_id,
                Round.tenant_id == tenant_id,
            )
        )

        if not round_obj:
            raise NotFoundError("Ronda", round_id)

        if round_obj.branch_id not in branch_ids:
            raise ForbiddenError("acceder a esta sucursal")

        if round_obj.status not in ["PENDING", "CONFIRMED"]:
            raise ValidationError(
                f"No se puede eliminar items de una ronda en estado {round_obj.status}. "
                f"Solo se permite en PENDING o CONFIRMED.",
                round_status=round_obj.status,
            )

        item = next((i for i in round_obj.items if i.id == item_id), None)
        if not item:
            raise NotFoundError(f"Item en la ronda {round_id}", item_id)

        # Capture product_id BEFORE deletion for frontend sync
        deleted_product_id = item.product_id

        self._db.delete(item)

        remaining_items = len([i for i in round_obj.items if i.id != item_id])
        round_deleted = False

        if remaining_items == 0:
            self._db.delete(round_obj)
            round_deleted = True

        safe_commit(self._db)

        return round_obj, deleted_product_id, remaining_items, round_deleted
