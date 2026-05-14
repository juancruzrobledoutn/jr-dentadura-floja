"""
Tests for CategoryService - category management service.

Tests cover:
- CRUD operations (create, read, update, delete)
- Auto-order calculation
- Validation rules (branch_id required, branch belongs to tenant)
- Subcategory cascade protection
- Edge cases and error handling
"""

import pytest
from rest_api.models import Category, Subcategory
from rest_api.services.domain import CategoryService
from shared.utils.exceptions import ValidationError, NotFoundError
from tests.conftest import next_id


class TestCategoryServiceCreate:
    """Tests for CategoryService.create() and create_with_auto_order()"""

    @pytest.fixture
    def category_service(self, db_session):
        """Get a CategoryService instance."""
        return CategoryService(db_session)

    def test_create_category(
        self, category_service, seed_branch, seed_tenant
    ):
        """Can create a basic category with required fields."""
        data = {
            "name": "Bebidas",
            "branch_id": seed_branch.id,
            "icon": "🥤",
            "order": 1,
        }

        result = category_service.create(
            data=data,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result.name == "Bebidas"
        assert result.branch_id == seed_branch.id
        assert result.icon == "🥤"
        assert result.order == 1
        assert result.is_active is True

    def test_create_category_with_auto_order(
        self, category_service, db_session, seed_branch, seed_tenant
    ):
        """Auto-order assigns next sequential order number."""
        # Create first category with explicit order
        cat1 = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="First",
            icon="1️⃣",
            order=3,
        )
        db_session.add(cat1)
        db_session.commit()

        # Create second category without order (auto-calculated)
        data = {
            "name": "Second",
            "branch_id": seed_branch.id,
            "icon": "2️⃣",
        }

        result = category_service.create_with_auto_order(
            data=data,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result.order == 4  # max(3) + 1

    def test_create_category_without_branch_id_fails(
        self, category_service, seed_tenant
    ):
        """Creating category without branch_id raises ValidationError."""
        data = {
            "name": "No Branch",
            "icon": "❌",
            "order": 1,
        }

        with pytest.raises(ValidationError) as exc_info:
            category_service.create(
                data=data,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert "branch_id" in str(exc_info.value).lower()

    def test_create_category_invalid_branch_fails(
        self, category_service, seed_tenant
    ):
        """Creating category with non-existent branch raises ValidationError."""
        data = {
            "name": "Invalid Branch",
            "branch_id": 99999,
            "icon": "❌",
            "order": 1,
        }

        with pytest.raises(ValidationError) as exc_info:
            category_service.create(
                data=data,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert "branch_id" in str(exc_info.value).lower()


class TestCategoryServiceRead:
    """Tests for CategoryService.list_by_branch() and get_by_id()"""

    @pytest.fixture
    def category_service(self, db_session):
        return CategoryService(db_session)

    @pytest.fixture
    def existing_categories(self, db_session, seed_branch, seed_tenant):
        """Create multiple categories for listing tests."""
        categories = []
        for i, name in enumerate(["Entradas", "Platos Principales", "Postres"], start=1):
            cat = Category(
                id=next_id(),
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                name=name,
                icon="🍽️",
                order=i,
            )
            db_session.add(cat)
            categories.append(cat)
        db_session.commit()
        for c in categories:
            db_session.refresh(c)
        return categories

    def test_list_categories_by_branch(
        self, category_service, existing_categories, seed_branch, seed_tenant
    ):
        """Can list all categories for a branch."""
        results = category_service.list_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        assert len(results) == 3
        names = [c.name for c in results]
        assert "Entradas" in names
        assert "Platos Principales" in names
        assert "Postres" in names

    def test_list_categories_by_branch_ordered(
        self, category_service, existing_categories, seed_branch, seed_tenant
    ):
        """list_by_branch_ordered returns categories sorted by order."""
        results = category_service.list_by_branch_ordered(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        assert len(results) == 3
        assert results[0].name == "Entradas"
        assert results[1].name == "Platos Principales"
        assert results[2].name == "Postres"

    def test_get_category_by_id(
        self, category_service, existing_categories, seed_tenant
    ):
        """Can get a single category by ID."""
        target = existing_categories[0]
        result = category_service.get_by_id(
            entity_id=target.id,
            tenant_id=seed_tenant.id,
        )

        assert result.id == target.id
        assert result.name == target.name

    def test_get_category_not_found(self, category_service, seed_tenant):
        """Getting non-existent category raises NotFoundError."""
        with pytest.raises(NotFoundError):
            category_service.get_by_id(
                entity_id=99999,
                tenant_id=seed_tenant.id,
            )


class TestCategoryServiceUpdate:
    """Tests for CategoryService.update()"""

    @pytest.fixture
    def category_service(self, db_session):
        return CategoryService(db_session)

    @pytest.fixture
    def existing_category(self, db_session, seed_branch, seed_tenant):
        """Create a category for update tests."""
        cat = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Original Name",
            icon="🍔",
            order=1,
        )
        db_session.add(cat)
        db_session.commit()
        db_session.refresh(cat)
        return cat

    def test_update_category(
        self, category_service, existing_category, seed_tenant
    ):
        """Can update category name and icon."""
        result = category_service.update(
            entity_id=existing_category.id,
            data={"name": "Updated Name", "icon": "🍕"},
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result.name == "Updated Name"
        assert result.icon == "🍕"

    def test_update_nonexistent_category_fails(
        self, category_service, seed_tenant
    ):
        """Updating non-existent category raises NotFoundError."""
        with pytest.raises(NotFoundError):
            category_service.update(
                entity_id=99999,
                data={"name": "Nope"},
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )


class TestCategoryServiceDelete:
    """Tests for CategoryService.delete() and cascade protection"""

    @pytest.fixture
    def category_service(self, db_session):
        return CategoryService(db_session)

    @pytest.fixture
    def deletable_category(self, db_session, seed_branch, seed_tenant):
        """Create a category that can be deleted (no subcategories)."""
        cat = Category(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="To Be Deleted",
            icon="🗑️",
            order=1,
        )
        db_session.add(cat)
        db_session.commit()
        db_session.refresh(cat)
        return cat

    def test_soft_delete_category(
        self, category_service, db_session, deletable_category, seed_tenant
    ):
        """Can soft delete a category without subcategories."""
        category_service.delete(
            entity_id=deletable_category.id,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        db_session.refresh(deletable_category)
        assert deletable_category.is_active is False

    def test_deleted_category_excluded_from_list(
        self, category_service, db_session, deletable_category, seed_branch, seed_tenant
    ):
        """Soft-deleted categories are excluded from list by default."""
        category_service.delete(
            entity_id=deletable_category.id,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        results = category_service.list_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        ids = [c.id for c in results]
        assert deletable_category.id not in ids

    def test_category_with_active_subcategories_cannot_delete(
        self, category_service, db_session, deletable_category, seed_tenant
    ):
        """Cannot delete a category that has active subcategories."""
        # Add an active subcategory
        subcategory = Subcategory(
            id=next_id(),
            tenant_id=seed_tenant.id,
            category_id=deletable_category.id,
            name="Active Sub",
        )
        db_session.add(subcategory)
        db_session.commit()

        with pytest.raises(ValidationError) as exc_info:
            category_service.delete(
                entity_id=deletable_category.id,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert "subcategoría" in str(exc_info.value).lower()

    def test_delete_nonexistent_category_fails(
        self, category_service, seed_tenant
    ):
        """Deleting non-existent category raises NotFoundError."""
        with pytest.raises(NotFoundError):
            category_service.delete(
                entity_id=99999,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )
