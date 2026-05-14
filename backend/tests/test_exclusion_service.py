"""
Tests for ExclusionService - atomic replace-all of branch exclusions.

Tests cover:
- Happy path: replace_category_exclusions persists new + soft-deletes old.
- Atomicity: ValidationError on invalid branch_id leaves the database
  pristine (no soft-deletes, no inserts) -- pre-validation MUST happen
  BEFORE any mutation.
- Empty list semantics: passing [] clears all exclusions.
- entity_type discriminator: invalid type raises ValidationError.
"""

import pytest
from sqlalchemy import select

from rest_api.models import (
    Branch,
    BranchCategoryExclusion,
    BranchSubcategoryExclusion,
    Category,
    Subcategory,
)
from rest_api.services.domain import ExclusionService
from shared.utils.exceptions import NotFoundError, ValidationError
from tests.conftest import next_id


@pytest.fixture
def seed_second_branch(db_session, seed_tenant):
    """A second branch to use as exclusion target."""
    branch = Branch(
        id=next_id(),
        tenant_id=seed_tenant.id,
        name="Second Branch",
        slug="second-branch",
        address="X",
        phone="X",
        opening_time="09:00",
        closing_time="22:00",
    )
    db_session.add(branch)
    db_session.commit()
    db_session.refresh(branch)
    return branch


@pytest.fixture
def seed_subcategory(db_session, seed_tenant, seed_category):
    """A subcategory under seed_category."""
    sub = Subcategory(
        id=next_id(),
        tenant_id=seed_tenant.id,
        category_id=seed_category.id,
        name="Subcat",
        order=1,
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


class TestReplaceCategoryExclusions:
    """Happy path + atomicity for category replace-all."""

    def test_replace_creates_new_exclusions(
        self, db_session, seed_tenant, seed_category, seed_branch, seed_second_branch
    ):
        """Empty -> 2 branches: creates 2 exclusion rows."""
        service = ExclusionService(db_session)
        result = service.replace_category_exclusions(
            category_id=seed_category.id,
            branch_ids=[seed_branch.id, seed_second_branch.id],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert len(result) == 2
        # Verify persistence
        rows = db_session.execute(
            select(BranchCategoryExclusion).where(
                BranchCategoryExclusion.category_id == seed_category.id,
                BranchCategoryExclusion.is_active.is_(True),
            )
        ).scalars().all()
        assert len(rows) == 2

    def test_replace_soft_deletes_existing(
        self, db_session, seed_tenant, seed_category, seed_branch, seed_second_branch
    ):
        """Existing exclusion on branch1 is soft-deleted; new one on branch2 is created."""
        # Seed an existing exclusion
        existing = BranchCategoryExclusion(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            category_id=seed_category.id,
        )
        db_session.add(existing)
        db_session.commit()

        service = ExclusionService(db_session)
        service.replace_category_exclusions(
            category_id=seed_category.id,
            branch_ids=[seed_second_branch.id],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        # Old row -> inactive
        db_session.refresh(existing)
        assert existing.is_active is False

        # Only second branch is in the active set
        active = db_session.execute(
            select(BranchCategoryExclusion).where(
                BranchCategoryExclusion.category_id == seed_category.id,
                BranchCategoryExclusion.is_active.is_(True),
            )
        ).scalars().all()
        assert [r.branch_id for r in active] == [seed_second_branch.id]

    def test_replace_with_empty_list_clears_all(
        self, db_session, seed_tenant, seed_category, seed_branch
    ):
        """Passing branch_ids=[] removes all exclusions."""
        existing = BranchCategoryExclusion(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            category_id=seed_category.id,
        )
        db_session.add(existing)
        db_session.commit()

        service = ExclusionService(db_session)
        result = service.replace_category_exclusions(
            category_id=seed_category.id,
            branch_ids=[],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result == []
        db_session.refresh(existing)
        assert existing.is_active is False

    def test_replace_unknown_branch_atomic_rollback(
        self, db_session, seed_tenant, seed_category, seed_branch
    ):
        """ValidationError on unknown branch => NO soft-deletes, NO inserts.

        CRITICAL atomicity test: pre-validation runs BEFORE any mutation,
        so the failure must leave existing rows untouched.
        """
        # Seed a pre-existing exclusion that MUST remain active after failure
        existing = BranchCategoryExclusion(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            category_id=seed_category.id,
        )
        db_session.add(existing)
        db_session.commit()

        service = ExclusionService(db_session)
        with pytest.raises(ValidationError):
            service.replace_category_exclusions(
                category_id=seed_category.id,
                branch_ids=[seed_branch.id, 999999],  # 999999 is invalid
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        # Rollback semantics: original row STILL active
        db_session.refresh(existing)
        assert existing.is_active is True, "Pre-validation failure must NOT soft-delete existing rows"

        # No new rows created
        all_rows = db_session.execute(
            select(BranchCategoryExclusion).where(
                BranchCategoryExclusion.category_id == seed_category.id,
            )
        ).scalars().all()
        assert len(all_rows) == 1  # Just the original

    def test_replace_unknown_category_raises_not_found(
        self, db_session, seed_tenant, seed_branch
    ):
        """Unknown category => NotFoundError."""
        service = ExclusionService(db_session)
        with pytest.raises(NotFoundError):
            service.replace_category_exclusions(
                category_id=999999,
                branch_ids=[seed_branch.id],
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )


class TestReplaceSubcategoryExclusions:
    """Happy path for subcategory variant (shares the engine)."""

    def test_replace_subcategory_happy_path(
        self, db_session, seed_tenant, seed_subcategory, seed_branch
    ):
        service = ExclusionService(db_session)
        result = service.replace_subcategory_exclusions(
            subcategory_id=seed_subcategory.id,
            branch_ids=[seed_branch.id],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert len(result) == 1
        rows = db_session.execute(
            select(BranchSubcategoryExclusion).where(
                BranchSubcategoryExclusion.subcategory_id == seed_subcategory.id,
                BranchSubcategoryExclusion.is_active.is_(True),
            )
        ).scalars().all()
        assert len(rows) == 1


class TestEntityTypeDiscriminator:
    """replace_for_entity dispatches on entity_type."""

    def test_invalid_entity_type_raises(
        self, db_session, seed_tenant
    ):
        service = ExclusionService(db_session)
        with pytest.raises(ValidationError):
            service.replace_for_entity(
                entity_type="bogus",
                entity_id=1,
                branch_ids=[],
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )
