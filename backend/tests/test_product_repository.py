"""
Tests for ProductRepository - data access layer for products.

These tests cover regressions for bugs fixed in pase 4:
- Product.branch_id (does NOT exist) — was used wrongly in find_by_branch (FIXED)
- Product.is_available (does NOT exist) — is_available lives on BranchProduct (FIXED)
- Product.is_available in find_for_menu (FIXED)

Methods covered:
- find_by_category
- find_by_branch (via _apply_filters branch JOIN)
- find_with_allergen
- find_for_menu

REQUIREMENTS:
- Run with: cd backend && python -m pytest tests/test_product_repository.py -v
- Uses SQLite in-memory via conftest.py db_session fixture.
- For full empirical verification with PostgreSQL, docker compose must be up
  (see CLAUDE.md > Testing section). SQLite is sufficient for these repository
  shape/JOIN tests because they don't rely on PostgreSQL-only features.
"""

import pytest
from rest_api.models import (
    Product,
    Category,
    BranchProduct,
    Allergen,
    ProductAllergen,
)
from rest_api.repositories.product import ProductRepository, ProductFilters
from tests.conftest import next_id


@pytest.fixture
def product_repo(db_session):
    """Get a ProductRepository instance."""
    return ProductRepository(db_session)


@pytest.fixture
def category(db_session, seed_branch, seed_tenant):
    """Create a base category for product tests."""
    cat = Category(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Burgers",
        icon="🍔",
        order=1,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


@pytest.fixture
def other_category(db_session, seed_branch, seed_tenant):
    """A second category, used to verify filtering."""
    cat = Category(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Drinks",
        icon="🥤",
        order=2,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


@pytest.fixture
def allergen(db_session, seed_tenant):
    """Create a base allergen."""
    al = Allergen(
        id=next_id(),
        tenant_id=seed_tenant.id,
        name="Gluten",
        icon="🌾",
        severity="severe",
        is_mandatory=True,
    )
    db_session.add(al)
    db_session.commit()
    db_session.refresh(al)
    return al


def _make_product(
    db_session,
    *,
    tenant_id,
    category_id,
    name="Test Product",
    branch_id=None,
    price_cents=1000,
    is_available=True,
    bp_is_active=True,
    product_is_active=True,
):
    """
    Helper: create a Product (+ optional BranchProduct).
    Keeps the test bodies focused on the assertion, not the boilerplate.
    """
    product = Product(
        id=next_id(),
        tenant_id=tenant_id,
        category_id=category_id,
        name=name,
        is_active=product_is_active,
    )
    db_session.add(product)
    db_session.flush()

    if branch_id is not None:
        bp = BranchProduct(
            id=next_id(),
            tenant_id=tenant_id,
            branch_id=branch_id,
            product_id=product.id,
            price_cents=price_cents,
            is_available=is_available,
            is_active=bp_is_active,
        )
        db_session.add(bp)
    db_session.commit()
    db_session.refresh(product)
    return product


class TestFindByCategory:
    """Tests for ProductRepository.find_by_category()."""

    def test_find_by_category_returns_products(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Happy path: returns all active products in a category."""
        p1 = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Burger A", branch_id=seed_branch.id,
        )
        p2 = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Burger B", branch_id=seed_branch.id,
        )

        results = product_repo.find_by_category(
            tenant_id=seed_tenant.id, category_id=category.id,
        )

        ids = {p.id for p in results}
        assert p1.id in ids
        assert p2.id in ids
        assert len(results) == 2

    def test_find_by_category_nonexistent_returns_empty(
        self, product_repo, seed_tenant
    ):
        """Category that does not exist (or has no products) returns empty list."""
        results = product_repo.find_by_category(
            tenant_id=seed_tenant.id, category_id=999999,
        )
        assert list(results) == []

    def test_find_by_category_excludes_inactive_products(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Soft-deleted products are excluded by default."""
        active = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Active", branch_id=seed_branch.id,
        )
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Inactive", branch_id=seed_branch.id,
            product_is_active=False,
        )

        results = product_repo.find_by_category(
            tenant_id=seed_tenant.id, category_id=category.id,
        )

        ids = {p.id for p in results}
        assert active.id in ids
        assert len(results) == 1


class TestFindByBranch:
    """
    Tests for ProductRepository.find_by_branch().

    Regression coverage for pase 4 bug:
    - find_by_branch used Product.branch_id (does not exist).
    - The fix routes the branch filter through BranchProduct JOIN.
    """

    def test_find_by_branch_returns_products_via_branch_product_join(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """
        Happy path. Verifies the JOIN with BranchProduct works correctly
        (this is the pase 4 fix — previously this query referenced
        Product.branch_id which does not exist).
        """
        p_in_branch = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="InBranch", branch_id=seed_branch.id,
        )
        # Product without any BranchProduct row → not in any branch
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="NoBranch", branch_id=None,
        )

        results = product_repo.find_by_branch(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )

        ids = {p.id for p in results}
        assert p_in_branch.id in ids
        assert len(results) == 1

    def test_find_by_branch_with_is_available_true_filter(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """
        Regression: is_available is a column on BranchProduct, not Product.
        Filter must apply on the joined BranchProduct.is_available.
        """
        available = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Available", branch_id=seed_branch.id, is_available=True,
        )
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Unavailable", branch_id=seed_branch.id, is_available=False,
        )

        filters = ProductFilters(is_available=True)
        results = product_repo.find_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            filters=filters,
        )

        ids = {p.id for p in results}
        assert available.id in ids
        assert len(results) == 1

    def test_find_by_branch_with_is_available_false_filter(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Negation: is_available=False returns only unavailable products."""
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Available", branch_id=seed_branch.id, is_available=True,
        )
        unavailable = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Unavailable", branch_id=seed_branch.id, is_available=False,
        )

        filters = ProductFilters(is_available=False)
        results = product_repo.find_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            filters=filters,
        )

        ids = {p.id for p in results}
        assert unavailable.id in ids
        assert len(results) == 1

    def test_find_by_branch_empty_branch_returns_empty(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Branch with no products returns empty list."""
        # No products created in this branch
        results = product_repo.find_by_branch(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []

    def test_find_by_branch_excludes_inactive_branch_product(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """
        The JOIN explicitly filters by BranchProduct.is_active.is_(True),
        so soft-deleted BranchProduct rows must not surface the product.
        """
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="HiddenViaBP", branch_id=seed_branch.id,
            bp_is_active=False,
        )

        results = product_repo.find_by_branch(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []


class TestFindWithAllergen:
    """Tests for ProductRepository.find_with_allergen()."""

    def test_find_with_allergen_returns_matching_products(
        self, product_repo, db_session, category, allergen, seed_branch, seed_tenant
    ):
        """Happy path: returns products that have the given allergen."""
        p_with = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Has gluten", branch_id=seed_branch.id,
        )
        pa = ProductAllergen(
            id=next_id(),
            tenant_id=seed_tenant.id,
            product_id=p_with.id,
            allergen_id=allergen.id,
            presence_type="contains",
            risk_level="standard",
        )
        db_session.add(pa)

        # Another product without the allergen
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="No allergen", branch_id=seed_branch.id,
        )
        db_session.commit()

        results = product_repo.find_with_allergen(
            tenant_id=seed_tenant.id, allergen_id=allergen.id,
        )

        ids = {p.id for p in results}
        assert p_with.id in ids
        assert len(results) == 1

    def test_find_with_allergen_filters_by_presence_type(
        self, product_repo, db_session, category, allergen, seed_branch, seed_tenant
    ):
        """presence_type filter narrows results to a specific kind of presence."""
        p_contains = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Contains gluten", branch_id=seed_branch.id,
        )
        p_may = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="May contain gluten", branch_id=seed_branch.id,
        )
        db_session.add_all([
            ProductAllergen(
                id=next_id(),
                tenant_id=seed_tenant.id,
                product_id=p_contains.id,
                allergen_id=allergen.id,
                presence_type="contains",
                risk_level="standard",
            ),
            ProductAllergen(
                id=next_id(),
                tenant_id=seed_tenant.id,
                product_id=p_may.id,
                allergen_id=allergen.id,
                presence_type="may_contain",
                risk_level="low",
            ),
        ])
        db_session.commit()

        results = product_repo.find_with_allergen(
            tenant_id=seed_tenant.id,
            allergen_id=allergen.id,
            presence_type="contains",
        )

        ids = {p.id for p in results}
        assert p_contains.id in ids
        assert p_may.id not in ids
        assert len(results) == 1


class TestFindForMenu:
    """
    Tests for ProductRepository.find_for_menu() — the public menu query.

    Regression coverage for pase 4 bug:
    - find_for_menu used Product.is_available (does NOT exist on Product).
    - The fix moves the availability check to BranchProduct.is_available in
      the JOIN clause.
    """

    def test_find_for_menu_happy_path(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """
        Returns active products that have an active+available BranchProduct
        in the requested branch.
        """
        visible = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Visible", branch_id=seed_branch.id, is_available=True,
        )

        results = product_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )

        ids = {p.id for p in results}
        assert visible.id in ids
        assert len(results) == 1

    def test_find_for_menu_excludes_unavailable_branch_product(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """
        Regression for pase 4: availability comes from BranchProduct.is_available,
        not Product.is_available (which does not exist).
        """
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Off-menu", branch_id=seed_branch.id, is_available=False,
        )

        results = product_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []

    def test_find_for_menu_excludes_inactive_product(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Soft-deleted products do not appear on the menu."""
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Deleted", branch_id=seed_branch.id, is_available=True,
            product_is_active=False,
        )

        results = product_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []

    def test_find_for_menu_with_category_filter(
        self, product_repo, db_session, category, other_category, seed_branch, seed_tenant
    ):
        """category_id filter limits results to products in that category."""
        burger = _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="Burger", branch_id=seed_branch.id, is_available=True,
        )
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=other_category.id,
            name="Coke", branch_id=seed_branch.id, is_available=True,
        )

        results = product_repo.find_for_menu(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            category_id=category.id,
        )

        ids = {p.id for p in results}
        assert burger.id in ids
        assert len(results) == 1

    def test_find_for_menu_empty_branch_returns_empty(
        self, product_repo, db_session, category, seed_branch, seed_tenant
    ):
        """Branch with no available products returns empty list."""
        # Product exists but only as a non-available BranchProduct
        _make_product(
            db_session, tenant_id=seed_tenant.id, category_id=category.id,
            name="NotForSale", branch_id=seed_branch.id, is_available=False,
        )

        results = product_repo.find_for_menu(
            tenant_id=seed_tenant.id, branch_id=seed_branch.id,
        )
        assert list(results) == []
