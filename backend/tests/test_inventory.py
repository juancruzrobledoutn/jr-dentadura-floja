"""
Tests for inventory domain service: stock items, movements, and alerts.
"""

import pytest
from tests.conftest import next_id
from rest_api.models import (
    StockItem, StockMovement, StockAlert, Ingredient, IngredientGroup,
)
from rest_api.services.domain.inventory_service import InventoryService
from shared.utils.exceptions import NotFoundError, ValidationError


@pytest.fixture
def seed_ingredient(db_session, seed_tenant):
    """Create a test ingredient group and ingredient."""
    group = IngredientGroup(
        id=next_id(),
        tenant_id=seed_tenant.id,
        name="Proteínas",
    )
    db_session.add(group)
    db_session.flush()

    ingredient = Ingredient(
        id=next_id(),
        tenant_id=seed_tenant.id,
        group_id=group.id,
        name="Harina",
    )
    db_session.add(ingredient)
    db_session.commit()
    db_session.refresh(ingredient)
    return ingredient


@pytest.fixture
def seed_stock_item(db_session, seed_tenant, seed_branch, seed_ingredient):
    """Create a test stock item."""
    item = StockItem(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        ingredient_id=seed_ingredient.id,
        current_qty=100.0,
        unit="kg",
        min_level=10.0,
        cost_per_unit_cents=500,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


class TestInventoryService:
    """Test inventory stock management."""

    def test_create_stock_movement_purchase(self, db_session, seed_tenant, seed_stock_item):
        """Recording a purchase movement should increase stock qty."""
        service = InventoryService(db_session)
        movement = service.record_movement(
            stock_item_id=seed_stock_item.id,
            tenant_id=seed_tenant.id,
            qty_change=50.0,
            movement_type="PURCHASE",
            reason="Restock semanal",
            user_id=1,
        )

        assert movement.qty_before == 100.0
        assert movement.qty_after == 150.0
        assert movement.movement_type == "PURCHASE"

        db_session.refresh(seed_stock_item)
        assert seed_stock_item.current_qty == 150.0
        assert seed_stock_item.last_restock_at is not None

    def test_stock_movement_negative_insufficient(self, db_session, seed_tenant, seed_stock_item):
        """Deducting more than available stock should raise ValidationError."""
        service = InventoryService(db_session)
        with pytest.raises(ValidationError, match="Stock insuficiente"):
            service.record_movement(
                stock_item_id=seed_stock_item.id,
                tenant_id=seed_tenant.id,
                qty_change=-200.0,
                movement_type="ORDER_DEDUCTION",
            )

    def test_stock_movement_not_found(self, db_session, seed_tenant):
        """Movement on nonexistent stock item should raise NotFoundError."""
        service = InventoryService(db_session)
        with pytest.raises(NotFoundError):
            service.record_movement(
                stock_item_id=99999,
                tenant_id=seed_tenant.id,
                qty_change=10.0,
                movement_type="ADJUSTMENT",
            )

    def test_low_stock_alert_created(self, db_session, seed_tenant, seed_branch, seed_stock_item):
        """Deducting stock below min_level should create a LOW_STOCK alert."""
        service = InventoryService(db_session)
        # Deduct to bring qty below min_level (10.0)
        service.record_movement(
            stock_item_id=seed_stock_item.id,
            tenant_id=seed_tenant.id,
            qty_change=-95.0,
            movement_type="ORDER_DEDUCTION",
        )

        db_session.refresh(seed_stock_item)
        assert seed_stock_item.current_qty == 5.0

        # Check alert was created
        alerts = service.check_alerts(seed_branch.id, seed_tenant.id)
        active_alerts = [a for a in alerts if a.status == "ACTIVE"]
        assert len(active_alerts) >= 1
        assert active_alerts[0].alert_type == "LOW_STOCK"

    def test_validate_unit_on_create(self, db_session, seed_tenant):
        """Creating a stock item with invalid unit should raise ValidationError."""
        service = InventoryService(db_session)
        with pytest.raises(ValidationError, match="Unidad invalida"):
            service._validate_create({"unit": "pounds"}, seed_tenant.id)
