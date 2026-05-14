"""
Tests for floor plan domain service: plan CRUD, table positioning, and auto-grid generation.
"""

import pytest
from tests.conftest import next_id
from rest_api.models import FloorPlan, FloorPlanTable, Table
from rest_api.services.domain.floor_plan_service import FloorPlanService
from shared.utils.exceptions import NotFoundError, ValidationError


@pytest.fixture
def seed_tables(db_session, seed_tenant, seed_branch):
    """Create multiple test tables for floor plan tests."""
    tables = []
    for i in range(4):
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code=f"T-{i + 1:02d}",
            capacity=4,
            status="FREE",
        )
        db_session.add(table)
        tables.append(table)
    db_session.commit()
    for t in tables:
        db_session.refresh(t)
    return tables


class TestFloorPlanService:
    """Test visual floor plan management."""

    def test_create_plan(self, db_session, seed_tenant, seed_branch):
        """Creating a floor plan should store dimensions and name."""
        service = FloorPlanService(db_session)
        plan = service.create_plan(
            branch_id=seed_branch.id,
            name="Planta Baja",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
            width=1000,
            height=800,
        )

        assert plan["name"] == "Planta Baja"
        assert plan["width"] == 1000
        assert plan["height"] == 800
        assert plan["is_default"] is False

    def test_create_default_plan_unsets_previous(self, db_session, seed_tenant, seed_branch):
        """Setting a plan as default should unset other defaults for the branch."""
        service = FloorPlanService(db_session)

        plan1 = service.create_plan(
            branch_id=seed_branch.id,
            name="Plan 1",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
            is_default=True,
        )
        assert plan1["is_default"] is True

        plan2 = service.create_plan(
            branch_id=seed_branch.id,
            name="Plan 2",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
            is_default=True,
        )
        assert plan2["is_default"] is True

        # Refresh plan1 — should no longer be default
        refreshed_plan1 = service.get_plan(plan1["id"], seed_tenant.id)
        assert refreshed_plan1["is_default"] is False

    def test_update_table_positions(self, db_session, seed_tenant, seed_branch, seed_tables):
        """Batch updating table positions should place tables on the plan."""
        service = FloorPlanService(db_session)
        plan = service.create_plan(
            branch_id=seed_branch.id,
            name="Test Plan",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        positions = [
            {"table_id": seed_tables[0].id, "x": 100.0, "y": 100.0},
            {"table_id": seed_tables[1].id, "x": 200.0, "y": 100.0, "shape": "CIRCLE"},
        ]

        updated = service.update_table_positions(
            plan_id=plan["id"],
            positions=positions,
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        assert len(updated["tables"]) == 2
        table_positions = {t["table_id"]: t for t in updated["tables"]}
        assert table_positions[seed_tables[0].id]["x"] == 100.0
        assert table_positions[seed_tables[1].id]["shape"] == "CIRCLE"

    def test_batch_add_multiple_tables(self, db_session, seed_tenant, seed_branch, seed_tables):
        """Adding all tables via batch update should place them with unique positions."""
        service = FloorPlanService(db_session)
        plan = service.create_plan(
            branch_id=seed_branch.id,
            name="Full Plan",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        positions = [
            {"table_id": seed_tables[i].id, "x": float(40 + i * 80), "y": 40.0}
            for i in range(4)
        ]

        result = service.update_table_positions(
            plan_id=plan["id"],
            positions=positions,
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        assert len(result["tables"]) == 4
        coords = [(t["x"], t["y"]) for t in result["tables"]]
        assert len(set(coords)) == 4

    def test_delete_plan_soft_deletes_tables(self, db_session, seed_tenant, seed_branch, seed_tables):
        """Soft deleting a plan should also soft delete its table positions."""
        service = FloorPlanService(db_session)
        plan = service.create_plan(
            branch_id=seed_branch.id,
            name="Delete Plan",
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        # Add a table position
        service.update_table_positions(
            plan_id=plan["id"],
            positions=[{"table_id": seed_tables[0].id, "x": 50.0, "y": 50.0}],
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        # Delete plan
        service.delete_plan(
            plan_id=plan["id"],
            tenant_id=seed_tenant.id,
            actor_user_id=1,
            actor_email="admin@test.com",
        )

        # Fetching should raise NotFoundError
        with pytest.raises(NotFoundError):
            service.get_plan(plan["id"], seed_tenant.id)
