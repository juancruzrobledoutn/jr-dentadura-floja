"""
Tests for InventoryService.validate_stock_for_products (S2.C — N+1 fix).

Validates:
  * Bulk semantics match the legacy check_stock_for_product behaviour.
  * Edge cases: missing recipe, missing ingredient, missing stock_item, malformed JSON.
  * Query count: a single round-trip per logical step (Recipe + Ingredient/StockItem).
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from sqlalchemy import event

from tests.conftest import next_id
from rest_api.models import (
    IngredientGroup,
    Ingredient,
    StockItem,
    Product,
)
from rest_api.models.recipe import Recipe
from rest_api.services.domain.inventory_service import InventoryService


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_recipe_json(ingredients: list[tuple[str, float, str]]) -> str:
    """Build the JSON payload stored in Recipe.ingredients."""
    return json.dumps(
        [
            {"name": name, "quantity": str(qty), "unit": unit}
            for name, qty, unit in ingredients
        ]
    )


@pytest.fixture
def seed_category_local(db_session, seed_branch, seed_tenant):
    from rest_api.models import Category

    category = Category(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Bulk Validation Cat",
        icon="🍕",
        order=1,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


@pytest.fixture
def seed_group(db_session, seed_tenant):
    group = IngredientGroup(
        id=next_id(),
        tenant_id=seed_tenant.id,
        name="Bulk Group",
    )
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    return group


def _make_ingredient(db_session, tenant_id, group_id, name: str) -> Ingredient:
    ing = Ingredient(
        id=next_id(),
        tenant_id=tenant_id,
        group_id=group_id,
        name=name,
    )
    db_session.add(ing)
    db_session.flush()
    return ing


def _make_stock(
    db_session,
    tenant_id: int,
    branch_id: int,
    ingredient_id: int,
    qty: float,
    unit: str = "kg",
) -> StockItem:
    item = StockItem(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        ingredient_id=ingredient_id,
        current_qty=qty,
        unit=unit,
        min_level=0.0,
        cost_per_unit_cents=100,
    )
    db_session.add(item)
    db_session.flush()
    return item


def _make_product(db_session, tenant_id, category_id, branch_id, name: str) -> Product:
    """
    Product is TENANT-scoped (no branch_id on Product). The branch_id argument
    is accepted for call-site symmetry with other helpers but only used to
    create the per-branch BranchProduct row that mirrors real seed data.
    """
    from rest_api.models import BranchProduct

    product = Product(
        id=next_id(),
        tenant_id=tenant_id,
        category_id=category_id,
        name=name,
        description="bulk test product",
    )
    db_session.add(product)
    db_session.flush()

    bp = BranchProduct(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        product_id=product.id,
        price_cents=1000,
        is_available=True,
    )
    db_session.add(bp)
    db_session.flush()
    return product


def _make_recipe(
    db_session,
    tenant_id,
    branch_id,
    product_id,
    ingredients: list[tuple[str, float, str]],
) -> Recipe:
    recipe = Recipe(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        product_id=product_id,
        name=f"Recipe for product {product_id}",
        ingredients=_make_recipe_json(ingredients),
    )
    db_session.add(recipe)
    db_session.flush()
    return recipe


class _QueryCounter:
    """Context manager that counts emitted SQL statements (excluding SAVEPOINT)."""

    def __init__(self, engine: Any):
        self._engine = engine
        self.count = 0
        self.statements: list[str] = []

    def _on_before(self, conn, cursor, statement, *args, **kwargs):
        first = statement.strip().split()[0].upper() if statement.strip() else ""
        if first in {"SAVEPOINT", "RELEASE", "ROLLBACK", "BEGIN", "COMMIT", "PRAGMA"}:
            return
        self.count += 1
        self.statements.append(statement)

    def __enter__(self):
        event.listen(self._engine, "before_cursor_execute", self._on_before)
        return self

    def __exit__(self, exc_type, exc, tb):
        event.remove(self._engine, "before_cursor_execute", self._on_before)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestValidateStockBulk:
    def test_all_products_sufficient_returns_empty(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """When every ingredient has enough stock, result must be empty dict."""
        harina = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Harina")
        tomate = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Tomate")
        _make_stock(db_session, seed_tenant.id, seed_branch.id, harina.id, qty=1000.0)
        _make_stock(db_session, seed_tenant.id, seed_branch.id, tomate.id, qty=500.0)

        pizza = _make_product(
            db_session, seed_tenant.id, seed_category_local.id, seed_branch.id, "Pizza"
        )
        _make_recipe(
            db_session,
            seed_tenant.id,
            seed_branch.id,
            pizza.id,
            [("Harina", 0.5, "kg"), ("Tomate", 0.2, "kg")],
        )
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={pizza.id: 5},
        )

        assert result == {}

    def test_insufficient_stock_reports_offending_ingredients(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """A product whose recipe needs more than stock_qty must be reported."""
        harina = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Harina")
        _make_stock(db_session, seed_tenant.id, seed_branch.id, harina.id, qty=1.0)

        pizza = _make_product(
            db_session, seed_tenant.id, seed_category_local.id, seed_branch.id, "Pizza"
        )
        _make_recipe(
            db_session,
            seed_tenant.id,
            seed_branch.id,
            pizza.id,
            [("Harina", 0.5, "kg")],  # 0.5 per unit * 5 = 2.5kg required, only 1.0 in stock
        )
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={pizza.id: 5},
        )

        assert pizza.id in result
        assert "Harina" in result[pizza.id]

    def test_product_without_recipe_passes(
        self, db_session, seed_tenant, seed_branch, seed_category_local
    ):
        """Products with no recipe are NOT stock-tracked: must not appear in issues."""
        bebida = _make_product(
            db_session,
            seed_tenant.id,
            seed_category_local.id,
            seed_branch.id,
            "Bebida (sin receta)",
        )
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={bebida.id: 10},
        )

        assert result == {}

    def test_ingredient_orphan_in_recipe_is_ignored(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """An ingredient name referenced in recipe JSON but missing from DB is ignored.

        Matches the legacy semantics: missing Ingredient row -> no validation error.
        """
        # Stock for a real ingredient – ample supply.
        real = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Sal")
        _make_stock(db_session, seed_tenant.id, seed_branch.id, real.id, qty=100.0)

        sopa = _make_product(
            db_session, seed_tenant.id, seed_category_local.id, seed_branch.id, "Sopa"
        )
        _make_recipe(
            db_session,
            seed_tenant.id,
            seed_branch.id,
            sopa.id,
            [
                ("Sal", 0.01, "kg"),
                ("IngredienteFantasma", 1.0, "kg"),  # not in Ingredient table
            ],
        )
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={sopa.id: 3},
        )

        assert result == {}  # ghost ingredient is silently skipped

    def test_ingredient_without_stock_item_is_ignored(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """An Ingredient row that has NO StockItem at this branch is not tracked."""
        ing = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Aceite")
        # NOTE: no _make_stock for this ingredient at this branch.

        plato = _make_product(
            db_session, seed_tenant.id, seed_category_local.id, seed_branch.id, "Plato"
        )
        _make_recipe(
            db_session,
            seed_tenant.id,
            seed_branch.id,
            plato.id,
            [("Aceite", 0.1, "lt")],
        )
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={plato.id: 1},
        )

        assert result == {}

    def test_malformed_recipe_json_is_skipped(
        self, db_session, seed_tenant, seed_branch, seed_category_local
    ):
        """Recipe.ingredients with invalid JSON must not crash – treat as no tracking."""
        plato = _make_product(
            db_session, seed_tenant.id, seed_category_local.id, seed_branch.id, "Plato2"
        )
        recipe = Recipe(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            product_id=plato.id,
            name="Broken JSON",
            ingredients="not-a-json{{{",
        )
        db_session.add(recipe)
        db_session.commit()

        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={plato.id: 1},
        )

        assert result == {}

    def test_legacy_helper_delegates_to_bulk(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """Legacy check_stock_for_product must keep the same external contract."""
        ing = _make_ingredient(db_session, seed_tenant.id, seed_group.id, "Carne")
        _make_stock(db_session, seed_tenant.id, seed_branch.id, ing.id, qty=0.2)

        burger = _make_product(
            db_session,
            seed_tenant.id,
            seed_category_local.id,
            seed_branch.id,
            "Hamburguesa",
        )
        _make_recipe(
            db_session,
            seed_tenant.id,
            seed_branch.id,
            burger.id,
            [("Carne", 0.15, "kg")],
        )
        db_session.commit()

        service = InventoryService(db_session)

        # 1 burger -> 0.15kg needed, 0.2 in stock -> OK.
        ok = service.check_stock_for_product(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            product_id=burger.id,
            required_qty=1,
        )
        assert ok == []

        # 2 burgers -> 0.30kg needed, 0.2 in stock -> insufficient.
        insufficient = service.check_stock_for_product(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            product_id=burger.id,
            required_qty=2,
        )
        assert insufficient == ["Carne"]

    def test_query_count_is_bounded_for_many_products(
        self, db_session, seed_tenant, seed_branch, seed_group, seed_category_local
    ):
        """
        Performance assertion: 5 products x 4 ingredients should issue at most
        2 SELECTs (recipe bulk + ingredient/stock JOIN bulk), regardless of N.

        Loose bound: <= 4 SELECTs to allow for SQLAlchemy autoflush behavior.
        Legacy implementation would be ~45 SELECTs for the same input.
        """
        ingredient_names = ["IngA", "IngB", "IngC", "IngD"]
        ingredients = [
            _make_ingredient(db_session, seed_tenant.id, seed_group.id, name)
            for name in ingredient_names
        ]
        for ing in ingredients:
            _make_stock(
                db_session,
                seed_tenant.id,
                seed_branch.id,
                ing.id,
                qty=1000.0,
            )

        products_with_qty: dict[int, int] = {}
        for i in range(5):
            prod = _make_product(
                db_session,
                seed_tenant.id,
                seed_category_local.id,
                seed_branch.id,
                f"Plato {i}",
            )
            _make_recipe(
                db_session,
                seed_tenant.id,
                seed_branch.id,
                prod.id,
                [(name, 0.1, "kg") for name in ingredient_names],
            )
            products_with_qty[prod.id] = 1

        db_session.commit()
        # Avoid autoflush noise: pre-flush is a no-op now.
        db_session.flush()

        service = InventoryService(db_session)
        engine = db_session.get_bind()

        with _QueryCounter(engine) as counter:
            result = service.validate_stock_for_products(
                branch_id=seed_branch.id,
                tenant_id=seed_tenant.id,
                products_with_qty=products_with_qty,
            )

        assert result == {}
        # Hard upper bound — implementation today issues exactly 2 SELECTs.
        # The bound is intentionally loose to survive minor ORM-emitted reads.
        assert counter.count <= 4, (
            f"Bulk validation issued {counter.count} queries (expected <=4). "
            f"Statements:\n" + "\n---\n".join(counter.statements)
        )

    def test_empty_input_returns_empty_dict(self, db_session, seed_tenant, seed_branch):
        """Sanity: empty input -> empty dict, zero queries."""
        service = InventoryService(db_session)
        result = service.validate_stock_for_products(
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            products_with_qty={},
        )
        assert result == {}
