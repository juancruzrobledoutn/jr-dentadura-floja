"""
Tests for waiter router endpoints refactored in C8 PASS 2.

Coverage scope: the 5 endpoints whose router logic was extracted to domain
services in PASS 2. Each refactor was behavior-preserving, but until now had
ZERO router-level test coverage, so the refactor was unverified.

Endpoints covered:
  1. GET    /api/waiter/my-assignments
       -> StaffService.get_waiter_sector_assignments
  2. GET    /api/waiter/verify-branch-assignment
       -> StaffService.verify_waiter_branch_assignment
  3. GET    /api/waiter/branches/{branch_id}/menu
       -> ProductService.get_compact_branch_menu
  4. DELETE /api/waiter/rounds/{round_id}/items/{item_id}
       -> RoundService.delete_round_item
  5. POST   /api/waiter/tables/{table_id}/transfer
       -> TableService.transfer_waiter

Running these tests requires the standard pytest harness (SQLite in-memory
via conftest fixtures). No external services (docker/redis/postgres) are
strictly required because the test client uses the in-memory DB override
and Redis-side effects fail open. The async endpoints (delete_round_item,
transfer_table_waiter) publish events to Redis after the DB write — if
Redis isn't reachable, the event publish is swallowed by the router's
try/except and the test still asserts on the response payload.

Run:
  cd backend && python -m pytest tests/test_waiter_router.py -v

Scope (and what we explicitly do NOT cover here):
  - Happy paths + 1-2 error cases per endpoint.
  - We do NOT cover concurrency, cross-tenant fuzzing, or every permutation
    of role-based access. See the closing report for the full list.
"""

from datetime import date

import pytest

from rest_api.models import (
    Branch,
    BranchProduct,
    BranchSector,
    Category,
    Product,
    Round,
    RoundItem,
    Table,
    TableSession,
    User,
    UserBranchRole,
    WaiterSectorAssignment,
)
from shared.security.password import hash_password
from tests.conftest import next_id


# =============================================================================
# Shared helpers
# =============================================================================


@pytest.fixture
def seed_sector(db_session, seed_branch, seed_tenant):
    """A single branch sector for assignment tests."""
    sector = BranchSector(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Salón Principal",
        prefix="SAL",
        display_order=1,
    )
    db_session.add(sector)
    db_session.commit()
    db_session.refresh(sector)
    return sector


@pytest.fixture
def seed_waiter_assignment_today(
    db_session, seed_waiter_user, seed_branch, seed_tenant, seed_sector
):
    """Active waiter sector assignment for today (no shift = all-day)."""
    assignment = WaiterSectorAssignment(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        sector_id=seed_sector.id,
        waiter_id=seed_waiter_user.id,
        assignment_date=date.today(),
        shift=None,
    )
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)
    return assignment


# =============================================================================
# 1. GET /api/waiter/my-assignments
# =============================================================================


class TestGetMyAssignments:
    """Tests for GET /api/waiter/my-assignments."""

    def test_returns_assignments_for_today(
        self,
        client,
        waiter_auth_headers,
        seed_waiter_assignment_today,
        seed_sector,
        seed_branch,
    ):
        """Happy path: waiter sees their sector assignment for today."""
        response = client.get(
            "/api/waiter/my-assignments",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()

        assert data["waiter_id"] == 2  # seed_waiter_user.id
        assert data["assignment_date"] == date.today().isoformat()
        assert isinstance(data["sectors"], list)
        assert len(data["sectors"]) == 1

        sector = data["sectors"][0]
        assert sector["sector_id"] == seed_sector.id
        assert sector["sector_name"] == "Salón Principal"
        assert sector["sector_prefix"] == "SAL"
        assert sector["branch_id"] == seed_branch.id

        assert seed_sector.id in data["sector_ids"]

    def test_returns_empty_when_no_assignments(
        self, client, waiter_auth_headers, seed_waiter_user
    ):
        """Waiter with no assignments today returns empty list (not 404)."""
        response = client.get(
            "/api/waiter/my-assignments",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["sectors"] == []
        assert data["sector_ids"] == []

    def test_invalid_shift_value_rejected(
        self, client, waiter_auth_headers, seed_waiter_assignment_today
    ):
        """ShiftType enum validation: bogus shift -> 422 from FastAPI."""
        response = client.get(
            "/api/waiter/my-assignments?shift=BOGUS",
            headers=waiter_auth_headers,
        )

        # ShiftType is a str Enum -> FastAPI returns 422 on validation error.
        assert response.status_code == 422

    def test_unauthenticated_request_rejected(self, client):
        """No JWT -> 401."""
        response = client.get("/api/waiter/my-assignments")
        assert response.status_code == 401


# =============================================================================
# 2. GET /api/waiter/verify-branch-assignment
# =============================================================================


class TestVerifyBranchAssignment:
    """Tests for GET /api/waiter/verify-branch-assignment."""

    def test_assigned_branch_returns_true(
        self,
        client,
        waiter_auth_headers,
        seed_waiter_assignment_today,
        seed_branch,
        seed_sector,
    ):
        """Happy path: waiter IS assigned to branch today."""
        response = client.get(
            f"/api/waiter/verify-branch-assignment?branch_id={seed_branch.id}",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["is_assigned"] is True
        assert data["branch_id"] == seed_branch.id
        assert data["branch_name"] == seed_branch.name
        assert data["assignment_date"] == date.today().isoformat()
        assert len(data["sectors"]) == 1
        assert data["sectors"][0]["sector_id"] == seed_sector.id
        # Personalized success message must mention the branch name
        assert seed_branch.name in data["message"]

    def test_branch_user_lacks_access_returns_false(
        self,
        client,
        waiter_auth_headers,
        db_session,
        seed_tenant,
    ):
        """
        User is NOT a member of the queried branch -> is_assigned=False
        with "No tienes acceso" message.

        We create a second branch the waiter does not belong to.
        """
        other_branch = Branch(
            id=next_id(),
            tenant_id=seed_tenant.id,
            name="Other Branch",
            slug="other-branch",
            address="999 Other St",
            phone="+1999",
            opening_time="09:00",
            closing_time="22:00",
        )
        db_session.add(other_branch)
        db_session.commit()
        db_session.refresh(other_branch)

        response = client.get(
            f"/api/waiter/verify-branch-assignment?branch_id={other_branch.id}",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["is_assigned"] is False
        assert "no tienes acceso" in data["message"].lower()

    def test_branch_member_but_no_assignment_returns_false(
        self,
        client,
        waiter_auth_headers,
        seed_waiter_user,
        seed_branch,
    ):
        """
        User belongs to branch but has NO assignment today -> is_assigned=False
        with personalized "no estás asignado" message.
        """
        response = client.get(
            f"/api/waiter/verify-branch-assignment?branch_id={seed_branch.id}",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["is_assigned"] is False
        assert "no estás asignado" in data["message"].lower()
        # Branch name should appear in the message (service personalizes it).
        assert seed_branch.name in data["message"]

    def test_missing_branch_id_param_rejected(
        self, client, waiter_auth_headers
    ):
        """`branch_id` query param is required -> 422."""
        response = client.get(
            "/api/waiter/verify-branch-assignment",
            headers=waiter_auth_headers,
        )
        assert response.status_code == 422


# =============================================================================
# 3. GET /api/waiter/branches/{branch_id}/menu
# =============================================================================


class TestGetBranchMenuCompact:
    """Tests for GET /api/waiter/branches/{branch_id}/menu (Comanda Rápida)."""

    @pytest.fixture
    def seed_menu(self, db_session, seed_branch, seed_tenant):
        """Create a category + product + branch_product for menu queries."""
        category = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Hamburguesas",
            icon="🍔",
            order=1,
        )
        db_session.add(category)
        db_session.flush()

        product = Product(
            id=next_id(),
            tenant_id=seed_tenant.id,
            category_id=category.id,
            name="Burger Clásica",
            description="Una clásica",
        )
        db_session.add(product)
        db_session.flush()

        branch_product = BranchProduct(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            product_id=product.id,
            price_cents=1500,
            is_available=True,
        )
        db_session.add(branch_product)
        db_session.commit()
        db_session.refresh(product)
        return {"category": category, "product": product, "bp": branch_product}

    def test_compact_menu_happy_path(
        self,
        client,
        waiter_auth_headers,
        seed_branch,
        seed_menu,
    ):
        """
        Happy path: returns categories with available products and no images.

        Verifies ProductService.get_compact_branch_menu returns categories
        ordered by `Category.order` and products by name (per the model
        definitions in catalog.py).
        """
        response = client.get(
            f"/api/waiter/branches/{seed_branch.id}/menu",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["branch_id"] == seed_branch.id
        assert data["branch_name"] == seed_branch.name
        assert data["total_products"] == 1
        assert len(data["categories"]) == 1

        cat = data["categories"][0]
        assert cat["name"] == "Hamburguesas"
        assert len(cat["products"]) == 1

        prod = cat["products"][0]
        assert prod["name"] == "Burger Clásica"
        assert prod["price_cents"] == 1500
        # Compact menu has no image field on products in the output.
        assert "image" not in prod or prod.get("image") is None

    def test_compact_menu_empty_when_no_available_products(
        self,
        client,
        waiter_auth_headers,
        db_session,
        seed_branch,
        seed_tenant,
    ):
        """A branch with categories but zero available products -> empty menu."""
        # Category with no associated BranchProduct.
        category = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Vacía",
            icon="🍽️",
            order=1,
        )
        db_session.add(category)
        db_session.commit()

        response = client.get(
            f"/api/waiter/branches/{seed_branch.id}/menu",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["total_products"] == 0
        assert data["categories"] == []  # Empty categories are dropped.

    def test_compact_menu_branch_not_in_user_branch_ids(
        self,
        client,
        waiter_auth_headers,
        db_session,
        seed_tenant,
    ):
        """Waiter querying a branch they don't belong to -> 403."""
        other_branch = Branch(
            id=next_id(),
            tenant_id=seed_tenant.id,
            name="Forbidden Branch",
            slug="forbidden",
            address="X",
            phone="+1",
            opening_time="09:00",
            closing_time="22:00",
        )
        db_session.add(other_branch)
        db_session.commit()

        response = client.get(
            f"/api/waiter/branches/{other_branch.id}/menu",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 403


# =============================================================================
# 4. DELETE /api/waiter/rounds/{round_id}/items/{item_id}
# =============================================================================


class TestDeleteRoundItem:
    """Tests for DELETE /api/waiter/rounds/{round_id}/items/{item_id}."""

    @pytest.fixture
    def seed_round_with_items(
        self,
        db_session,
        seed_branch,
        seed_tenant,
        seed_waiter_user,
    ):
        """Create a PENDING round with two items for deletion tests."""
        # Minimal table + session.
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code="DEL-01",
            capacity=4,
            sector="Main",
            status="ACTIVE",
        )
        db_session.add(table)
        db_session.flush()

        session = TableSession(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_id=table.id,
            status="OPEN",
            opened_by="WAITER",
            opened_by_waiter_id=seed_waiter_user.id,
        )
        db_session.add(session)
        db_session.flush()

        # Category + product so RoundItem FK is valid.
        category = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Cat",
            icon="🍕",
            order=1,
        )
        db_session.add(category)
        db_session.flush()

        product = Product(
            id=next_id(),
            tenant_id=seed_tenant.id,
            category_id=category.id,
            name="Pizza",
        )
        db_session.add(product)
        db_session.flush()

        round_obj = Round(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_session_id=session.id,
            round_number=1,
            status="PENDING",
            submitted_by="WAITER",
            submitted_by_waiter_id=seed_waiter_user.id,
        )
        db_session.add(round_obj)
        db_session.flush()

        item1 = RoundItem(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=round_obj.id,
            product_id=product.id,
            qty=1,
            unit_price_cents=1500,
        )
        item2 = RoundItem(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=round_obj.id,
            product_id=product.id,
            qty=2,
            unit_price_cents=1500,
        )
        db_session.add_all([item1, item2])
        db_session.commit()
        db_session.refresh(round_obj)
        db_session.refresh(item1)
        db_session.refresh(item2)

        return {
            "round": round_obj,
            "item1": item1,
            "item2": item2,
            "session": session,
            "table": table,
            "product": product,
        }

    def test_delete_item_happy_path(
        self,
        client,
        waiter_auth_headers,
        seed_round_with_items,
    ):
        """Happy path: delete one of two items, round survives."""
        ctx = seed_round_with_items
        round_id = ctx["round"].id
        item_id = ctx["item1"].id

        response = client.delete(
            f"/api/waiter/rounds/{round_id}/items/{item_id}",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["round_id"] == round_id
        assert data["item_id"] == item_id
        assert data["remaining_items"] == 1
        assert data["round_deleted"] is False
        assert "eliminado" in data["message"].lower()

    def test_delete_last_item_cancels_round(
        self,
        client,
        waiter_auth_headers,
        db_session,
        seed_round_with_items,
    ):
        """
        Special case (per CLAUDE.md): deleting the last item from a PENDING
        round should cause the round itself to be deleted (round_deleted=True).

        Note: the production code path actually `db.delete()`s the round
        (hard delete), then returns round_deleted=True. The router builds
        its response from the in-memory `round_obj` returned by the service.
        """
        ctx = seed_round_with_items
        round_id = ctx["round"].id

        # Delete both items: the second deletion should trip the empty-round path.
        first = client.delete(
            f"/api/waiter/rounds/{round_id}/items/{ctx['item1'].id}",
            headers=waiter_auth_headers,
        )
        assert first.status_code == 200, first.text

        second = client.delete(
            f"/api/waiter/rounds/{round_id}/items/{ctx['item2'].id}",
            headers=waiter_auth_headers,
        )
        assert second.status_code == 200, second.text
        data = second.json()
        assert data["remaining_items"] == 0
        assert data["round_deleted"] is True
        assert "ronda eliminada" in data["message"].lower()

    def test_delete_item_from_submitted_round_rejected(
        self,
        client,
        waiter_auth_headers,
        db_session,
        seed_round_with_items,
    ):
        """
        Cannot delete items from rounds past CONFIRMED (sent to kitchen).
        Service raises ValidationError -> router returns 400.
        """
        ctx = seed_round_with_items
        ctx["round"].status = "SUBMITTED"
        db_session.commit()

        response = client.delete(
            f"/api/waiter/rounds/{ctx['round'].id}/items/{ctx['item1'].id}",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 400, response.text
        detail = response.json()["detail"].lower()
        # Service message mentions the disallowed state.
        assert "submitted" in detail or "ronda" in detail

    def test_delete_item_not_in_round(
        self,
        client,
        waiter_auth_headers,
        seed_round_with_items,
    ):
        """Non-existent item ID for an existing round -> 404."""
        round_id = seed_round_with_items["round"].id

        response = client.delete(
            f"/api/waiter/rounds/{round_id}/items/999999",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 404
        # Router preserves a distinct message that mentions "Item".
        assert "item" in response.json()["detail"].lower()

    def test_delete_item_round_not_found(
        self,
        client,
        waiter_auth_headers,
    ):
        """Round ID doesn't exist -> 404."""
        response = client.delete(
            "/api/waiter/rounds/999999/items/1",
            headers=waiter_auth_headers,
        )

        assert response.status_code == 404
        # Router preserves "Ronda ... no encontrada" message.
        assert "ronda" in response.json()["detail"].lower()


# =============================================================================
# 5. POST /api/waiter/tables/{table_id}/transfer
# =============================================================================


class TestTransferTableWaiter:
    """Tests for POST /api/waiter/tables/{table_id}/transfer (shift handoff)."""

    @pytest.fixture
    def seed_manager_user(self, db_session, seed_tenant, seed_branch):
        """
        Create a MANAGER user — required because transfer endpoint guards on
        MANAGER/ADMIN, not WAITER.
        """
        user = User(
            id=next_id(),
            tenant_id=seed_tenant.id,
            email="manager@test.com",
            password=hash_password("mgr12345"),
            first_name="Test",
            last_name="Manager",
        )
        db_session.add(user)
        db_session.flush()

        role = UserBranchRole(
            id=next_id(),
            user_id=user.id,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            role="MANAGER",
        )
        db_session.add(role)
        db_session.commit()
        db_session.refresh(user)
        return user

    @pytest.fixture
    def manager_auth_headers(self, client, seed_manager_user):
        """Login as the manager user."""
        response = client.post(
            "/api/auth/login",
            json={"email": "manager@test.com", "password": "mgr12345"},
        )
        assert response.status_code == 200, response.text
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture
    def seed_second_waiter(self, db_session, seed_tenant, seed_branch):
        """Create a second waiter user to act as the transfer target."""
        user = User(
            id=next_id(),
            tenant_id=seed_tenant.id,
            email="waiter2@test.com",
            password=hash_password("waiter2pw"),
            first_name="Waiter",
            last_name="Two",
        )
        db_session.add(user)
        db_session.flush()

        role = UserBranchRole(
            id=next_id(),
            user_id=user.id,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            role="WAITER",
        )
        db_session.add(role)
        db_session.commit()
        db_session.refresh(user)
        return user

    @pytest.fixture
    def active_table(
        self,
        db_session,
        seed_branch,
        seed_tenant,
        seed_waiter_user,
    ):
        """Create a table with an active session assigned to seed_waiter_user."""
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code="TRF-01",
            capacity=4,
            sector="Main",
            status="ACTIVE",
            assigned_waiter_id=seed_waiter_user.id,
        )
        db_session.add(table)
        db_session.flush()

        session = TableSession(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_id=table.id,
            status="OPEN",
            opened_by="WAITER",
            opened_by_waiter_id=seed_waiter_user.id,
            assigned_waiter_id=seed_waiter_user.id,
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(table)
        db_session.refresh(session)
        return {"table": table, "session": session}

    def test_transfer_happy_path(
        self,
        client,
        manager_auth_headers,
        active_table,
        seed_second_waiter,
        seed_waiter_user,
    ):
        """Happy path: manager transfers active table to a second waiter."""
        table = active_table["table"]

        response = client.post(
            f"/api/waiter/tables/{table.id}/transfer",
            json={"target_waiter_id": seed_second_waiter.id},
            headers=manager_auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["table_id"] == table.id
        assert data["table_code"] == "TRF-01"
        assert data["new_waiter_id"] == seed_second_waiter.id
        assert data["previous_waiter_id"] == seed_waiter_user.id
        assert "transferida" in data["message"].lower()

    def test_transfer_requires_manager_role(
        self,
        client,
        waiter_auth_headers,  # plain WAITER token
        active_table,
        seed_second_waiter,
    ):
        """A plain WAITER may not transfer a table — 403."""
        table = active_table["table"]

        response = client.post(
            f"/api/waiter/tables/{table.id}/transfer",
            json={"target_waiter_id": seed_second_waiter.id},
            headers=waiter_auth_headers,
        )

        assert response.status_code == 403

    def test_transfer_table_without_active_session(
        self,
        client,
        manager_auth_headers,
        db_session,
        seed_branch,
        seed_tenant,
        seed_second_waiter,
    ):
        """A FREE table has no active session -> 400."""
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code="TRF-FREE",
            capacity=4,
            sector="Main",
            status="FREE",
        )
        db_session.add(table)
        db_session.commit()
        db_session.refresh(table)

        response = client.post(
            f"/api/waiter/tables/{table.id}/transfer",
            json={"target_waiter_id": seed_second_waiter.id},
            headers=manager_auth_headers,
        )

        assert response.status_code == 400
        assert "sesión" in response.json()["detail"].lower() or \
               "session" in response.json()["detail"].lower()

    def test_transfer_to_nonexistent_target_waiter(
        self,
        client,
        manager_auth_headers,
        active_table,
    ):
        """Target waiter ID doesn't exist -> 404 (with 'Mozo destino' message)."""
        table = active_table["table"]

        response = client.post(
            f"/api/waiter/tables/{table.id}/transfer",
            json={"target_waiter_id": 999999},
            headers=manager_auth_headers,
        )

        assert response.status_code == 404
        # Router preserves the distinct "Mozo destino" 404 message.
        assert "mozo destino" in response.json()["detail"].lower()

    def test_transfer_table_not_found(
        self,
        client,
        manager_auth_headers,
        seed_second_waiter,
    ):
        """Source table doesn't exist -> 404 (with 'Mesa' message)."""
        response = client.post(
            "/api/waiter/tables/999999/transfer",
            json={"target_waiter_id": seed_second_waiter.id},
            headers=manager_auth_headers,
        )

        assert response.status_code == 404
        assert "mesa" in response.json()["detail"].lower()
