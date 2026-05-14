"""
Tests for admin branch management endpoints.
"""

import pytest


class TestBranchEndpoints:
    """Test admin branch CRUD operations."""

    def test_list_branches_authenticated(self, client, auth_headers, seed_branch):
        """Authenticated admin can list branches."""
        response = client.get("/api/admin/branches", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Find our test branch
        test_branch = next((b for b in data if b["slug"] == "test-branch"), None)
        assert test_branch is not None
        assert test_branch["name"] == "Test Branch"

    def test_list_branches_unauthenticated(self, client):
        """Unauthenticated request should fail."""
        response = client.get("/api/admin/branches")
        assert response.status_code == 401

    def test_get_branch(self, client, auth_headers, seed_branch):
        """Can get single branch by ID."""
        response = client.get(f"/api/admin/branches/{seed_branch.id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == seed_branch.id
        assert data["name"] == "Test Branch"

    def test_get_branch_not_found(self, client, auth_headers):
        """Getting non-existent branch returns 404."""
        response = client.get("/api/admin/branches/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_create_branch(self, client, auth_headers, seed_tenant):
        """Admin can create a new branch."""
        response = client.post(
            "/api/admin/branches",
            headers=auth_headers,
            json={
                "name": "New Branch",
                "slug": "new-branch",
                "address": "456 New St",
                "phone": "+1987654321",
                "opening_time": "08:00",
                "closing_time": "23:00",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Branch"
        assert data["slug"] == "new-branch"
        assert data["is_active"] is True

    def test_create_branch_duplicate_slug(self, client, auth_headers, seed_branch):
        """Creating branch with duplicate slug in same tenant should fail (400)."""
        response = client.post(
            "/api/admin/branches",
            headers=auth_headers,
            json={
                "name": "Duplicate Branch",
                "slug": "test-branch",  # Already exists in seed_branch's tenant
                "address": "789 Dup St",
            },
        )
        assert response.status_code == 400
        # DuplicateEntityError builds detail as:
        #   "Sucursal con identificador 'test-branch' ya existe"
        detail = response.json()["detail"].lower()
        assert "sucursal" in detail
        assert "test-branch" in detail

    def test_create_branch_duplicate_slug_same_tenant_raises(
        self, db_session, seed_branch
    ):
        """
        BranchService.create rejects a duplicate slug within the same tenant
        but allows the same slug across different tenants.

        Covers production bug from session #224 (audita14.md sec. 4, item #1):
        Branch.slug must be unique per-tenant, not globally.
        """
        from rest_api.models import Tenant
        from rest_api.services.domain.branch_service import BranchService
        from shared.utils.exceptions import DuplicateEntityError

        tenant_a_id = seed_branch.tenant_id  # tenant A already has slug "test-branch"
        service = BranchService(db_session)

        # 1. Different slug in tenant A -> OK
        ok = service.create(
            data={"name": "Second Branch A", "slug": "branch-a-2"},
            tenant_id=tenant_a_id,
            user_id=1,
            user_email="admin@test.com",
        )
        assert ok.slug == "branch-a-2"

        # 2. Duplicate slug in tenant A -> DuplicateEntityError
        with pytest.raises(DuplicateEntityError):
            service.create(
                data={"name": "Dup Branch A", "slug": "test-branch"},
                tenant_id=tenant_a_id,
                user_id=1,
                user_email="admin@test.com",
            )

        # 3. Same slug "test-branch" in a DIFFERENT tenant -> OK
        tenant_b = Tenant(
            id=2,
            name="Other Restaurant",
            slug="other",
            description="Second tenant",
            theme_color="#000000",
        )
        db_session.add(tenant_b)
        db_session.commit()

        ok_other = service.create(
            data={"name": "Branch B", "slug": "test-branch"},
            tenant_id=tenant_b.id,
            user_id=1,
            user_email="admin@test.com",
        )
        assert ok_other.slug == "test-branch"
        assert ok_other.id != seed_branch.id

    def test_update_branch_duplicate_slug_same_tenant_raises(
        self, client, auth_headers, db_session, seed_branch, seed_tenant
    ):
        """
        Updating a branch to a slug already used by another active branch
        in the same tenant must return 400.
        """
        # Create a sibling branch in the same tenant via the service
        from rest_api.services.domain.branch_service import BranchService

        sibling = BranchService(db_session).create(
            data={"name": "Sibling", "slug": "sibling"},
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        # Try to rename sibling to "test-branch" (already used by seed_branch)
        response = client.patch(
            f"/api/admin/branches/{sibling.id}",
            headers=auth_headers,
            json={"slug": "test-branch"},
        )
        assert response.status_code == 400
        assert "test-branch" in response.json()["detail"].lower()

    def test_update_branch_keep_same_slug_succeeds(
        self, client, auth_headers, seed_branch
    ):
        """Updating a branch with its own current slug must NOT trigger the check."""
        response = client.patch(
            f"/api/admin/branches/{seed_branch.id}",
            headers=auth_headers,
            json={"slug": "test-branch", "name": "Renamed Branch"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed Branch"

    def test_update_branch(self, client, auth_headers, seed_branch):
        """Admin can update a branch."""
        response = client.patch(
            f"/api/admin/branches/{seed_branch.id}",
            headers=auth_headers,
            json={"name": "Updated Branch Name"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Branch Name"

    def test_delete_branch_requires_admin(self, client, waiter_auth_headers, seed_branch):
        """Only admin can delete branches."""
        response = client.delete(
            f"/api/admin/branches/{seed_branch.id}",
            headers=waiter_auth_headers,
        )
        # WAITER role should not be able to delete
        assert response.status_code == 403

    def test_soft_delete_branch(self, client, auth_headers, seed_branch, db_session):
        """Deleting a branch soft-deletes it."""
        from rest_api.models import Branch

        response = client.delete(
            f"/api/admin/branches/{seed_branch.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify it's soft-deleted
        db_session.refresh(seed_branch)
        assert seed_branch.is_active is False
        assert seed_branch.deleted_at is not None
