"""
Tests for CategoryRepository - data access layer for categories.

These tests cover regressions for bugs fixed in earlier pases:
- pase 3: Category.display_order (does NOT exist) — ordering uses Category.order (FIXED)
- pase 4: Product.branch_id (does NOT exist) — find_with_products joins via
  BranchProduct (FIXED)
- pase 4: Product.is_available used wrongly — availability lives on
  BranchProduct (FIXED)
- pase 6: Category.is_visible predicate removed (column did not exist on
  the Category model) (FIXED)

Methods covered:
- find_all (inherited via BaseRepository, with CategoryFilters)
- find_with_products
- find_for_menu

REQUIREMENTS:
- Run with: cd backend && python -m pytest tests/test_category_repository.py -v
- Uses SQLite in-memory via conftest.py db_session fixture.
- For full empirical verification with PostgreSQL, docker compose must be up
  (see CLAUDE.md > Testing section).
"""

import pytest
from rest_api.models import (
    Product,
    Category,
    BranchProduct,
    Tenant,
)
from rest_api.repositories.category import CategoryRepository, CategoryFilters
from tests.conftest import next_id


@pytest.fixture
def category_repo(db_session):
    """Get a CategoryRepository instance."""
    return CategoryRepository(db_session)


def _make_category(
    db_session,
    *,
    tenant_id,
    branch_id,
    name="Category",
    order=0,
    is_active=True,
):
    """Helper: create a Category with explicit ID."""
    cat = Category(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        name=name,
        icon="🍽️",
        order=order,
        is_active=is_active,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


def _make_product_in_branch(
    db_session,
    *,
    tenant_id,
    category_id,
    branch_id,
    name="Product",
    is_available=True,
    bp_is_active=True,
    product_is_active=True,
):
    """Helper: create a Product with an associated BranchProduct."""
    product = Product(
        id=next_id(),
        tenant_id=tenant_id,
        category_id=category_id,
        name=name,
        is_active=product_is_active,
    )
    db_session.add(product)
    db_session.flush()

    bp = BranchProduct(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        product_id=product.id,
        price_cents=1000,
        is_available=is_available,
        is_active=bp_is_active,
    )
    db_session.add(bp)
    db_session.commit()
    db_session.refresh(product)
    return product


class TestFindAll:
    """Tests for CategoryRepository.find_all() (inherited)."""

    def test_find_all_returns_tenant_categories(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """Happy path: returns all active categories for the tenant."""
        c1 = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Bebidas", order=1,
        )
        c2 = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Postres", order=2,
        )

        results = category_repo.find_all(tenant_id=seed_tenant.id)

        ids = {c.id for c in results}
        assert c1.id in ids
        assert c2.id in ids
        assert len(results) == 2

    def test_find_all_orders_by_order_field(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """
        Regression for pase 3: ordering must use Category.order, NOT
        Category.display_order (which does not exist).
        """
        c_last = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Last", order=99,
        )
        c_first = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="First", order=1,
        )
        c_middle = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Middle", order=5,
        )

        results = list(category_repo.find_all(tenant_id=seed_tenant.id))
        ids_in_order = [c.id for c in results]

        assert ids_in_order == [c_first.id, c_middle.id, c_last.id]

    def test_find_all_excludes_inactive(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """Soft-deleted categories are excluded by default."""
        active = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Active",
        )
        _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Inactive", is_active=False,
        )

        results = category_repo.find_all(tenant_id=seed_tenant.id)
        ids = {c.id for c in results}
        assert active.id in ids
        assert len(results) == 1

    def test_find_all_tenant_isolation(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """
        Tenant isolation: categories from another tenant must not appear
        in find_all() for this tenant.
        """
        # Another tenant + branch (need branch because Category.branch_id is NOT NULL)
        from rest_api.models import Branch
        other_tenant = Tenant(
            id=999,
            name="Other Restaurant",
            slug="other",
            description="other",
            theme_color="#000000",
        )
        db_session.add(other_tenant)
        db_session.flush()

        other_branch = Branch(
            id=999,
            tenant_id=other_tenant.id,
            name="Other Branch",
            slug="other-branch",
            address="999 Other St",
            phone="+9999999999",
            opening_time="09:00",
            closing_time="22:00",
        )
        db_session.add(other_branch)
        db_session.commit()

        mine = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Mine",
        )
        _make_category(
            db_session, tenant_id=other_tenant.id, branch_id=other_branch.id,
            name="Theirs",
        )

        results = category_repo.find_all(tenant_id=seed_tenant.id)
        ids = {c.id for c in results}
        assert mine.id in ids
        # Other tenant's category must not leak in
        assert len(results) == 1


class TestFindWithProducts:
    """
    Tests for CategoryRepository.find_with_products().

    Regression coverage for pase 4 bug:
    - When branch_id was provided, the repo previously referenced
      Product.branch_id (does not exist). Fix routes branch scoping through
      BranchProduct JOIN.
    """

    def test_find_with_products_returns_categories_with_products(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """Happy path: categories that have at least one active product."""
        cat_with = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="HasProducts", order=1,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=cat_with.id, branch_id=seed_branch.id,
        )
        # Empty category
        _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Empty", order=2,
        )

        results = category_repo.find_with_products(tenant_id=seed_tenant.id)

        ids = {c.id for c in results}
        assert cat_with.id in ids
        assert len(results) == 1

    def test_find_with_products_branch_filter_via_branch_product_join(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """
        Regression for pase 4: with branch_id, the JOIN must go through
        BranchProduct, not Product.branch_id (which does not exist).
        """
        cat = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="HasProductsInBranch", order=1,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=cat.id, branch_id=seed_branch.id,
        )

        results = category_repo.find_with_products(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )

        ids = {c.id for c in results}
        assert cat.id in ids
        assert len(results) == 1


class TestFindForMenu:
    """
    Tests for CategoryRepository.find_for_menu().

    Regression coverage for pase 6: Category.is_visible predicate was
    removed from CategoryRepository (it referenced a column not present in
    the Category model — option 2 from the original triage applied).
    """

def test_find_for_menu_happy_path(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """Categories that have available products in the branch are returned."""
        cat = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="OnMenu", order=1,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=cat.id, branch_id=seed_branch.id, is_available=True,
        )

        results = category_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        ids = {c.id for c in results}
        assert cat.id in ids

def test_find_for_menu_excludes_categories_without_available_products(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """Categories whose only products are unavailable are excluded."""
        cat = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="AllUnavailable", order=1,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=cat.id, branch_id=seed_branch.id, is_available=False,
        )

        results = category_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []

def test_find_for_menu_orders_by_order_field(
        self, category_repo, db_session, seed_branch, seed_tenant
    ):
        """
        Regression for pase 3: ordering must use Category.order, NOT
        Category.display_order (which does not exist).
        """
        c_last = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="Last", order=99,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=c_last.id, branch_id=seed_branch.id, is_available=True,
        )

        c_first = _make_category(
            db_session, tenant_id=seed_tenant.id, branch_id=seed_branch.id,
            name="First", order=1,
        )
        _make_product_in_branch(
            db_session, tenant_id=seed_tenant.id,
            category_id=c_first.id, branch_id=seed_branch.id, is_available=True,
        )

        results = list(category_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        ))

        assert [c.id for c in results] == [c_first.id, c_last.id]
