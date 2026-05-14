"""
Inventory Domain Service: stock management, movements, alerts, waste, and food cost calculation.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models.inventory import (
    StockItem,
    StockMovement,
    StockAlert,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    WasteLog,
    RecipeCost,
)
from rest_api.models.recipe import Recipe
from rest_api.models.catalog import Product, BranchProduct
from rest_api.services.base_service import BranchScopedService, BaseCRUDService
from shared.utils.admin_schemas import StockItemOutput, SupplierOutput, PurchaseOrderOutput, StockMovementOutput
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError, ValidationError
from rest_api.services.domain.audit_service import AuditService

logger = get_logger(__name__)


class InventoryService(BranchScopedService[StockItem, StockItemOutput]):
    """Manages stock levels, movements, and alerts."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=StockItem,
            output_schema=StockItemOutput,
            entity_name="Item de Stock",
        )

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Validate stock item creation."""
        if not data.get("unit"):
            raise ValidationError("La unidad es requerida", field="unit")
        valid_units = {"kg", "lt", "units", "g", "ml"}
        if data.get("unit") not in valid_units:
            raise ValidationError(
                f"Unidad invalida. Opciones: {', '.join(valid_units)}",
                field="unit",
            )

    def record_movement(
        self,
        stock_item_id: int,
        tenant_id: int,
        qty_change: float,
        movement_type: str,
        reason: str | None = None,
        user_id: int | None = None,
        reference_type: str | None = None,
        reference_id: int | None = None,
    ) -> StockMovement:
        """Record a stock movement and update current qty."""
        stock_item = self._db.scalar(
            select(StockItem).where(
                StockItem.id == stock_item_id,
                StockItem.tenant_id == tenant_id,
                StockItem.is_active.is_(True),
            )
        )
        if not stock_item:
            raise NotFoundError("Item de Stock", stock_item_id, tenant_id=tenant_id)

        qty_before = stock_item.current_qty
        qty_after = qty_before + qty_change

        if qty_after < 0:
            raise ValidationError(
                f"Stock insuficiente. Disponible: {qty_before}, solicitado: {abs(qty_change)}",
                field="qty_change",
            )

        # Update stock level
        stock_item.current_qty = qty_after
        if qty_change > 0 and movement_type == "PURCHASE":
            stock_item.last_restock_at = datetime.now(timezone.utc)

        # Create movement record
        movement = StockMovement(
            tenant_id=tenant_id,
            branch_id=stock_item.branch_id,
            stock_item_id=stock_item_id,
            movement_type=movement_type,
            qty_change=qty_change,
            qty_before=qty_before,
            qty_after=qty_after,
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
            cost_per_unit_cents=stock_item.cost_per_unit_cents,
            performed_by_id=user_id,
        )
        self._db.add(movement)
        safe_commit(self._db)

        # Audit log for stock adjustments
        audit = AuditService(self._db)
        audit.log(
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=None,
            action="STOCK_ADJUSTMENT",
            entity_type="stock_item",
            entity_id=stock_item_id,
            old_values={"qty": qty_before},
            new_values={
                "qty": qty_after,
                "movement_type": movement_type,
                "qty_change": qty_change,
                "reason": reason,
            },
        )

        # Check for alerts after movement
        self._check_single_alert(stock_item, tenant_id)

        return movement

    def log_waste(
        self,
        stock_item_id: int,
        qty: float,
        reason: str,
        tenant_id: int,
        user_id: int,
    ) -> WasteLog:
        """Log wasted/spoiled inventory and deduct from stock.

        Creates a WasteLog entry and records a corresponding negative stock
        movement of type ``WASTE``. The stock deduction is performed by
        :meth:`record_movement`, which keeps stock levels, audit logs, and
        alert reconciliation consistent.

        Args:
            stock_item_id: Stock item being wasted.
            qty: Positive quantity wasted (will be deducted from stock).
            reason: Waste reason code (validated against allowed set).
            tenant_id: Tenant ID for isolation.
            user_id: User performing the action.

        Returns:
            The persisted WasteLog instance.

        Raises:
            ValidationError: If the reason is not a recognized code.
            NotFoundError: If the stock item does not exist for this tenant.
        """
        valid_reasons = {"EXPIRED", "DAMAGED", "OVERPRODUCTION", "PREPARATION_WASTE"}
        if reason not in valid_reasons:
            raise ValidationError(
                f"Razon invalida. Opciones: {', '.join(sorted(valid_reasons))}",
                field="reason",
            )

        # Load stock item to derive branch_id and cost.
        stock_item = self._db.scalar(
            select(StockItem).where(
                StockItem.id == stock_item_id,
                StockItem.tenant_id == tenant_id,
                StockItem.is_active.is_(True),
            )
        )
        if not stock_item:
            raise NotFoundError("Item de Stock", stock_item_id, tenant_id=tenant_id)

        cost_cents = int(qty * stock_item.cost_per_unit_cents)

        waste = WasteLog(
            tenant_id=tenant_id,
            branch_id=stock_item.branch_id,
            stock_item_id=stock_item_id,
            qty=qty,
            reason=reason,
            cost_cents=cost_cents,
            logged_by_id=user_id,
            logged_at=datetime.now(timezone.utc),
        )
        self._db.add(waste)

        # Deduct from stock. record_movement commits internally, which also
        # persists the WasteLog above as part of the same flush cycle.
        self.record_movement(
            stock_item_id=stock_item_id,
            tenant_id=tenant_id,
            qty_change=-qty,
            movement_type="WASTE",
            reason=reason,
            user_id=user_id,
            reference_type="waste_log",
        )

        self._db.refresh(waste)
        return waste

    def deduct_for_round(self, round_id: int, branch_id: int, tenant_id: int) -> list[StockMovement]:
        """
        Auto-deduct ingredients when a round is confirmed.
        Uses recipe ingredients JSON to calculate quantities needed.
        """
        from rest_api.models.order import Round, RoundItem

        round_obj = self._db.scalar(
            select(Round).where(Round.id == round_id).options(
                selectinload(Round.items)
            )
        )
        if not round_obj:
            raise NotFoundError("Ronda", round_id)

        movements = []
        for item in round_obj.items:
            if not item.product_id:
                continue

            # Find recipe linked to this product
            recipe = self._db.scalar(
                select(Recipe).where(
                    Recipe.product_id == item.product_id,
                    Recipe.tenant_id == tenant_id,
                    Recipe.is_active.is_(True),
                )
            )
            if not recipe or not recipe.ingredients:
                continue

            # Parse recipe ingredients JSON
            try:
                recipe_ingredients = json.loads(recipe.ingredients)
            except (json.JSONDecodeError, TypeError):
                continue

            qty_multiplier = item.qty if hasattr(item, "qty") else 1

            for ing in recipe_ingredients:
                ing_name = ing.get("name", "")
                ing_qty = float(ing.get("quantity", 0)) * qty_multiplier

                if ing_qty <= 0:
                    continue

                # Find stock item for this ingredient at this branch
                # Match by ingredient name since recipe stores names in JSON
                from rest_api.models.ingredient import Ingredient

                ingredient = self._db.scalar(
                    select(Ingredient).where(
                        Ingredient.name == ing_name,
                        Ingredient.tenant_id == tenant_id,
                        Ingredient.is_active.is_(True),
                    )
                )
                if not ingredient:
                    continue

                stock_item = self._db.scalar(
                    select(StockItem).where(
                        StockItem.branch_id == branch_id,
                        StockItem.ingredient_id == ingredient.id,
                        StockItem.is_active.is_(True),
                    )
                )
                if not stock_item:
                    continue

                try:
                    movement = self.record_movement(
                        stock_item_id=stock_item.id,
                        tenant_id=tenant_id,
                        qty_change=-ing_qty,
                        movement_type="ORDER_DEDUCTION",
                        reason=f"Ronda #{round_id}",
                        reference_type="round",
                        reference_id=round_id,
                    )
                    movements.append(movement)
                except ValidationError:
                    # Insufficient stock — log warning but don't block the order
                    logger.warning(
                        "Insufficient stock for deduction",
                        ingredient=ing_name,
                        branch_id=branch_id,
                        round_id=round_id,
                    )

        return movements

    def check_stock_for_product(
        self,
        branch_id: int,
        tenant_id: int,
        product_id: int,
        required_qty: int,
    ) -> list[str]:
        """
        Check if sufficient stock exists for a product based on its recipe.

        Returns a list of ingredient names with insufficient stock.
        If the product has no recipe or no tracked ingredients, returns empty list
        (stock is NOT tracked for that product, so no validation needed).

        NOTE: For multiple products use :meth:`validate_stock_for_products` to
        avoid the N+1 query pattern. This single-product helper is kept for
        backwards compatibility with existing callers and now delegates to the
        bulk implementation internally.
        """
        result = self.validate_stock_for_products(
            branch_id=branch_id,
            tenant_id=tenant_id,
            products_with_qty={product_id: required_qty},
        )
        return result.get(product_id, [])

    def validate_stock_for_products(
        self,
        branch_id: int,
        tenant_id: int,
        products_with_qty: dict[int, int],
    ) -> dict[int, list[str]]:
        """
        Bulk-validate ingredient stock availability for multiple products in
        2 queries (instead of the N+1 pattern used by the legacy per-product
        helper).

        Args:
            branch_id: Branch where the products will be consumed.
            tenant_id: Tenant scope for recipe/ingredient/stock lookups.
            products_with_qty: Mapping of ``product_id -> required_qty``.

        Returns:
            Mapping of ``product_id -> [ingredient names with insufficient stock]``.
            Products without a recipe, without tracked ingredients, or whose
            ingredients are not yet registered as stock items are treated as
            "not stock-tracked" and are EXCLUDED from the result (same semantics
            as :meth:`check_stock_for_product`).

        Performance:
            - 1 query to fetch all active recipes for the given product_ids
            - 1 query to fetch (Ingredient, StockItem) tuples for all ingredient
              names referenced by those recipes
            - Everything else is in-memory computation

        Semantics preserved from the legacy single-product helper:
            - Recipe missing / no ingredients JSON / malformed JSON -> no issues
            - Ingredient name not found in DB -> ignored (no issue)
            - StockItem missing for an existing ingredient -> ignored (no issue)
            - StockItem present but ``current_qty < required`` -> reported
        """
        from rest_api.models.ingredient import Ingredient

        if not products_with_qty:
            return {}

        product_ids = list(products_with_qty.keys())

        # Query 1: bulk fetch active recipes for these products.
        recipe_rows = self._db.execute(
            select(Recipe.product_id, Recipe.ingredients).where(
                Recipe.product_id.in_(product_ids),
                Recipe.tenant_id == tenant_id,
                Recipe.is_active.is_(True),
            )
        ).all()

        # Parse recipe JSON in-memory. Build:
        #   per_product_needs: {product_id: [(ingredient_name, qty_needed_total)]}
        #   all_ingredient_names: set of unique ingredient names referenced
        per_product_needs: dict[int, list[tuple[str, float]]] = {}
        all_ingredient_names: set[str] = set()

        for product_id, ingredients_json in recipe_rows:
            if not ingredients_json:
                continue
            try:
                recipe_ingredients = json.loads(ingredients_json)
            except (json.JSONDecodeError, TypeError):
                continue
            required_qty = products_with_qty.get(product_id, 0)
            if required_qty <= 0:
                continue

            needs: list[tuple[str, float]] = []
            for ing in recipe_ingredients:
                ing_name = ing.get("name", "") if isinstance(ing, dict) else ""
                if not ing_name:
                    continue
                try:
                    per_unit_qty = float(ing.get("quantity", 0))
                except (TypeError, ValueError):
                    continue
                total_qty = per_unit_qty * required_qty
                if total_qty <= 0:
                    continue
                needs.append((ing_name, total_qty))
                all_ingredient_names.add(ing_name)

            if needs:
                per_product_needs[product_id] = needs

        if not all_ingredient_names:
            return {}

        # Query 2: bulk fetch (Ingredient, StockItem) for every referenced name.
        # LEFT-join semantics matter: ingredient may exist without stock_item,
        # which we treat as "not tracked" (legacy parity).
        stock_rows = self._db.execute(
            select(Ingredient.name, StockItem.current_qty)
            .join(
                StockItem,
                (StockItem.ingredient_id == Ingredient.id)
                & (StockItem.branch_id == branch_id)
                & (StockItem.is_active.is_(True)),
            )
            .where(
                Ingredient.name.in_(all_ingredient_names),
                Ingredient.tenant_id == tenant_id,
                Ingredient.is_active.is_(True),
            )
        ).all()

        # Build name -> current_qty map. If the same name appears more than once
        # (different branches/tenants edge cases already filtered above), keep
        # the first occurrence – branch scope makes it unique in practice.
        stock_by_name: dict[str, float] = {}
        for name, current_qty in stock_rows:
            if name not in stock_by_name:
                stock_by_name[name] = current_qty

        # Compute insufficient ingredients per product.
        issues: dict[int, list[str]] = {}
        for product_id, needs in per_product_needs.items():
            insufficient: list[str] = []
            for ing_name, qty_needed in needs:
                if ing_name not in stock_by_name:
                    # Ingredient has no stock_item at this branch -> not tracked
                    continue
                if stock_by_name[ing_name] < qty_needed:
                    insufficient.append(ing_name)
            if insufficient:
                issues[product_id] = insufficient

        return issues

    def check_alerts(self, branch_id: int, tenant_id: int) -> list[StockAlert]:
        """Check all stock items for low-stock conditions and generate alerts."""
        stock_items = self._db.execute(
            select(StockItem).where(
                StockItem.branch_id == branch_id,
                StockItem.tenant_id == tenant_id,
                StockItem.is_active.is_(True),
            )
        ).scalars().all()

        alerts = []
        for item in stock_items:
            alert = self._check_single_alert(item, tenant_id)
            if alert:
                alerts.append(alert)

        return alerts

    def _check_single_alert(self, stock_item: StockItem, tenant_id: int) -> StockAlert | None:
        """Check a single stock item and create/resolve alerts as needed."""
        # Resolve existing alerts if stock is OK
        if stock_item.current_qty >= stock_item.min_level:
            existing = self._db.execute(
                select(StockAlert).where(
                    StockAlert.stock_item_id == stock_item.id,
                    StockAlert.status == "ACTIVE",
                    StockAlert.is_active.is_(True),
                )
            ).scalars().all()
            for alert in existing:
                alert.status = "RESOLVED"
            if existing:
                safe_commit(self._db)
            return None

        # Check if active alert already exists
        existing_alert = self._db.scalar(
            select(StockAlert).where(
                StockAlert.stock_item_id == stock_item.id,
                StockAlert.status == "ACTIVE",
                StockAlert.is_active.is_(True),
            )
        )
        if existing_alert:
            # Update qty in existing alert
            existing_alert.current_qty = stock_item.current_qty
            safe_commit(self._db)
            return existing_alert

        # Determine alert type
        alert_type = "OUT_OF_STOCK" if stock_item.current_qty == 0 else "LOW_STOCK"

        alert = StockAlert(
            tenant_id=tenant_id,
            branch_id=stock_item.branch_id,
            stock_item_id=stock_item.id,
            alert_type=alert_type,
            current_qty=stock_item.current_qty,
            threshold_qty=stock_item.min_level,
            status="ACTIVE",
        )
        self._db.add(alert)
        safe_commit(self._db)
        return alert

    def calculate_recipe_cost(self, recipe_id: int, tenant_id: int) -> RecipeCost | None:
        """Calculate total cost for a recipe based on current ingredient stock prices."""
        recipe = self._db.scalar(
            select(Recipe).where(
                Recipe.id == recipe_id,
                Recipe.tenant_id == tenant_id,
                Recipe.is_active.is_(True),
            )
        )
        if not recipe or not recipe.ingredients:
            return None

        try:
            recipe_ingredients = json.loads(recipe.ingredients)
        except (json.JSONDecodeError, TypeError):
            return None

        total_cost_cents = 0
        from rest_api.models.ingredient import Ingredient

        for ing in recipe_ingredients:
            ing_name = ing.get("name", "")
            ing_qty = float(ing.get("quantity", 0))

            ingredient = self._db.scalar(
                select(Ingredient).where(
                    Ingredient.name == ing_name,
                    Ingredient.tenant_id == tenant_id,
                    Ingredient.is_active.is_(True),
                )
            )
            if not ingredient:
                continue

            # Find any stock item for this ingredient to get cost
            stock_item = self._db.scalar(
                select(StockItem).where(
                    StockItem.ingredient_id == ingredient.id,
                    StockItem.tenant_id == tenant_id,
                    StockItem.is_active.is_(True),
                )
            )
            if stock_item and stock_item.cost_per_unit_cents > 0:
                total_cost_cents += int(ing_qty * stock_item.cost_per_unit_cents)

        # Calculate food cost % if product has a price
        food_cost_percent = 0.0
        selling_price_cents = 0
        if recipe.product_id:
            # Get branch product price
            bp = self._db.scalar(
                select(BranchProduct).where(
                    BranchProduct.product_id == recipe.product_id,
                    BranchProduct.is_active.is_(True),
                )
            )
            if bp and bp.price_cents and bp.price_cents > 0:
                selling_price_cents = bp.price_cents
                food_cost_percent = round((total_cost_cents / selling_price_cents) * 100, 2)

        # Create or update snapshot
        recipe_cost = RecipeCost(
            tenant_id=tenant_id,
            recipe_id=recipe_id,
            product_id=recipe.product_id,
            total_cost_cents=total_cost_cents,
            food_cost_percent=food_cost_percent,
            calculated_at=datetime.now(timezone.utc),
        )
        self._db.add(recipe_cost)
        safe_commit(self._db)
        self._db.refresh(recipe_cost)

        return recipe_cost

    def get_food_cost_report(self, branch_id: int, tenant_id: int) -> list[dict]:
        """Food cost % for all products in a branch."""
        recipes = self._db.execute(
            select(Recipe).where(
                Recipe.branch_id == branch_id,
                Recipe.tenant_id == tenant_id,
                Recipe.is_active.is_(True),
                Recipe.product_id.isnot(None),
            )
        ).scalars().all()

        report = []
        for recipe in recipes:
            # Get latest cost snapshot
            latest_cost = self._db.scalar(
                select(RecipeCost)
                .where(
                    RecipeCost.recipe_id == recipe.id,
                    RecipeCost.tenant_id == tenant_id,
                    RecipeCost.is_active.is_(True),
                )
                .order_by(RecipeCost.calculated_at.desc())
            )

            # Get product name and selling price
            product_name = None
            selling_price_cents = None
            if recipe.product_id:
                product = self._db.scalar(
                    select(Product).where(Product.id == recipe.product_id)
                )
                if product:
                    product_name = product.name
                bp = self._db.scalar(
                    select(BranchProduct).where(
                        BranchProduct.product_id == recipe.product_id,
                        BranchProduct.branch_id == branch_id,
                        BranchProduct.is_active.is_(True),
                    )
                )
                if bp:
                    selling_price_cents = bp.price_cents

            report.append({
                "product_id": recipe.product_id,
                "product_name": product_name,
                "recipe_id": recipe.id,
                "recipe_name": recipe.name,
                "total_cost_cents": latest_cost.total_cost_cents if latest_cost else 0,
                "selling_price_cents": selling_price_cents,
                "food_cost_percent": latest_cost.food_cost_percent if latest_cost else 0.0,
            })

        return report


class SupplierService(BaseCRUDService[Supplier, SupplierOutput]):
    """Manages supplier CRUD operations."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=Supplier,
            output_schema=SupplierOutput,
            entity_name="Proveedor",
        )

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        if not data.get("name"):
            raise ValidationError("El nombre es requerido", field="name")


class PurchaseOrderService(BranchScopedService[PurchaseOrder, PurchaseOrderOutput]):
    """Manages purchase order operations."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=PurchaseOrder,
            output_schema=PurchaseOrderOutput,
            entity_name="Orden de Compra",
        )

    def create_with_items(
        self,
        data: dict[str, Any],
        items_data: list[dict],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> PurchaseOrderOutput:
        """Create a purchase order with line items."""
        total_cents = sum(
            int(item.get("qty_ordered", 0) * item.get("unit_cost_cents", 0))
            for item in items_data
        )

        po = PurchaseOrder(
            tenant_id=tenant_id,
            branch_id=data["branch_id"],
            supplier_id=data["supplier_id"],
            order_date=data["order_date"],
            expected_date=data.get("expected_date"),
            notes=data.get("notes"),
            total_cents=total_cents,
            status="DRAFT",
        )
        po.set_created_by(user_id, user_email)
        self._db.add(po)
        safe_commit(self._db)
        self._db.refresh(po)

        for item_data in items_data:
            item = PurchaseOrderItem(
                tenant_id=tenant_id,
                purchase_order_id=po.id,
                ingredient_id=item_data["ingredient_id"],
                qty_ordered=item_data["qty_ordered"],
                unit=item_data["unit"],
                unit_cost_cents=item_data["unit_cost_cents"],
            )
            item.set_created_by(user_id, user_email)
            self._db.add(item)

        safe_commit(self._db)
        self._db.refresh(po)
        return self.to_output(po)

    def receive_items(
        self,
        po_id: int,
        tenant_id: int,
        receive_data: list[dict],
        received_date: Any | None,
        user_id: int,
        user_email: str,
    ) -> PurchaseOrderOutput:
        """Mark PO items as received and update stock levels."""
        po = self._db.scalar(
            select(PurchaseOrder).where(
                PurchaseOrder.id == po_id,
                PurchaseOrder.tenant_id == tenant_id,
                PurchaseOrder.is_active.is_(True),
            ).options(selectinload(PurchaseOrder.items))
        )
        if not po:
            raise NotFoundError("Orden de Compra", po_id, tenant_id=tenant_id)

        if po.status in ("RECEIVED", "CANCELED"):
            raise ValidationError(f"La orden ya esta en estado {po.status}")

        inventory_service = InventoryService(self._db)
        all_received = True

        for rd in receive_data:
            item = self._db.scalar(
                select(PurchaseOrderItem).where(
                    PurchaseOrderItem.id == rd["item_id"],
                    PurchaseOrderItem.purchase_order_id == po_id,
                )
            )
            if not item:
                continue

            qty_received = float(rd.get("qty_received", 0))
            item.qty_received = qty_received

            if qty_received < item.qty_ordered:
                all_received = False

            # Find or create stock item and record purchase movement
            stock_item = self._db.scalar(
                select(StockItem).where(
                    StockItem.branch_id == po.branch_id,
                    StockItem.ingredient_id == item.ingredient_id,
                    StockItem.is_active.is_(True),
                )
            )

            if stock_item:
                # Update cost per unit from purchase
                stock_item.cost_per_unit_cents = item.unit_cost_cents
                inventory_service.record_movement(
                    stock_item_id=stock_item.id,
                    tenant_id=tenant_id,
                    qty_change=qty_received,
                    movement_type="PURCHASE",
                    reason=f"OC #{po_id}",
                    user_id=user_id,
                    reference_type="purchase_order",
                    reference_id=po_id,
                )

        po.status = "RECEIVED" if all_received else "PARTIALLY_RECEIVED"
        if received_date:
            po.received_date = received_date
        po.set_updated_by(user_id, user_email)

        safe_commit(self._db)
        self._db.refresh(po)
        return self.to_output(po)
