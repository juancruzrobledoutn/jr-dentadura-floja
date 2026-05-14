"""
Tests for AssignmentService - atomic bulk waiter-sector assignments.

Tests cover:
- Happy path: bulk create produces persisted entities + correct counts.
- Skip semantics: invalid sector_id / waiter_id / duplicate keys are skipped, NOT raised.
- Atomicity: NotFoundError on missing branch leaves DB untouched.
- copy_from_previous: copies source rows + skips already-existing tuples.
"""

from datetime import date

import pytest

from rest_api.models import (
    BranchSector,
    UserBranchRole,
    WaiterSectorAssignment,
)
from rest_api.services.domain import AssignmentService
from shared.security.password import hash_password
from shared.utils.exceptions import NotFoundError
from tests.conftest import next_id


@pytest.fixture
def seed_sector(db_session, seed_branch, seed_tenant):
    """Sector tied to seed_branch."""
    sector = BranchSector(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Interior",
        prefix="INT",
        display_order=1,
    )
    db_session.add(sector)
    db_session.commit()
    db_session.refresh(sector)
    return sector


@pytest.fixture
def seed_waiter_with_role(db_session, seed_tenant, seed_branch):
    """Waiter user with WAITER role on seed_branch."""
    from rest_api.models import User
    user = User(
        id=next_id(),
        tenant_id=seed_tenant.id,
        email="w1@test.com",
        password=hash_password("x"),
        first_name="Wai",
        last_name="Ter",
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


class TestCreateBulk:
    """Happy path + skip semantics for create_bulk()."""

    def test_create_bulk_happy_path(
        self, db_session, seed_tenant, seed_branch, seed_sector, seed_waiter_with_role
    ):
        """Single sector + single waiter => 1 persisted, 0 skipped."""
        service = AssignmentService(db_session)
        result = service.create_bulk(
            branch_id=seed_branch.id,
            assignment_date=date(2026, 5, 14),
            shift=None,
            assignments=[{"sector_id": seed_sector.id, "waiter_ids": [seed_waiter_with_role.id]}],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert len(result["created"]) == 1
        assert result["skipped_count"] == 0
        a = result["created"][0]
        assert a.id is not None  # refreshed -> PK assigned
        assert a.sector_id == seed_sector.id
        assert a.waiter_id == seed_waiter_with_role.id
        assert a.is_active is True

    def test_create_bulk_skips_invalid_sector(
        self, db_session, seed_tenant, seed_branch, seed_waiter_with_role
    ):
        """Unknown sector_id => waiter_ids all counted as skipped, nothing persisted."""
        service = AssignmentService(db_session)
        result = service.create_bulk(
            branch_id=seed_branch.id,
            assignment_date=date(2026, 5, 14),
            shift=None,
            assignments=[{"sector_id": 999999, "waiter_ids": [seed_waiter_with_role.id]}],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result["created"] == []
        assert result["skipped_count"] == 1

    def test_create_bulk_skips_duplicates(
        self, db_session, seed_tenant, seed_branch, seed_sector, seed_waiter_with_role
    ):
        """Same (sector, waiter) twice in one call => 1 created, 1 skipped."""
        service = AssignmentService(db_session)
        result = service.create_bulk(
            branch_id=seed_branch.id,
            assignment_date=date(2026, 5, 14),
            shift=None,
            assignments=[
                {"sector_id": seed_sector.id, "waiter_ids": [seed_waiter_with_role.id]},
                {"sector_id": seed_sector.id, "waiter_ids": [seed_waiter_with_role.id]},
            ],
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert len(result["created"]) == 1
        assert result["skipped_count"] == 1

    def test_create_bulk_unknown_branch_atomic_rollback(
        self, db_session, seed_tenant
    ):
        """Unknown branch => NotFoundError; no rows persisted (atomic)."""
        service = AssignmentService(db_session)
        with pytest.raises(NotFoundError):
            service.create_bulk(
                branch_id=999999,
                assignment_date=date(2026, 5, 14),
                shift=None,
                assignments=[{"sector_id": 1, "waiter_ids": [1]}],
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        # Verify no assignments persisted (atomic rollback verification)
        from sqlalchemy import select
        count = db_session.scalar(
            select(WaiterSectorAssignment).where(
                WaiterSectorAssignment.tenant_id == seed_tenant.id,
            )
        )
        assert count is None


class TestCopyFromPrevious:
    """Atomic copy of assignments between dates."""

    def test_copy_from_previous_happy_path(
        self, db_session, seed_tenant, seed_branch, seed_sector, seed_waiter_with_role
    ):
        """Source rows on 2026-05-13 are copied to 2026-05-14."""
        # Seed source row
        src = WaiterSectorAssignment(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            sector_id=seed_sector.id,
            waiter_id=seed_waiter_with_role.id,
            assignment_date=date(2026, 5, 13),
            shift=None,
        )
        db_session.add(src)
        db_session.commit()

        service = AssignmentService(db_session)
        result = service.copy_from_previous(
            branch_id=seed_branch.id,
            from_date=date(2026, 5, 13),
            to_date=date(2026, 5, 14),
            shift=None,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert len(result["created"]) == 1
        assert result["skipped_count"] == 0
        new_row = result["created"][0]
        assert new_row.assignment_date == date(2026, 5, 14)
        assert new_row.sector_id == seed_sector.id
        assert new_row.waiter_id == seed_waiter_with_role.id

    def test_copy_from_previous_skips_existing(
        self, db_session, seed_tenant, seed_branch, seed_sector, seed_waiter_with_role
    ):
        """If target date already has the same (sector, waiter, shift), skip it."""
        # Seed both source AND target with the same row
        for d in (date(2026, 5, 13), date(2026, 5, 14)):
            db_session.add(WaiterSectorAssignment(
                id=next_id(),
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                sector_id=seed_sector.id,
                waiter_id=seed_waiter_with_role.id,
                assignment_date=d,
                shift=None,
            ))
        db_session.commit()

        service = AssignmentService(db_session)
        result = service.copy_from_previous(
            branch_id=seed_branch.id,
            from_date=date(2026, 5, 13),
            to_date=date(2026, 5, 14),
            shift=None,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result["created"] == []
        assert result["skipped_count"] == 1

    def test_copy_from_previous_no_source(
        self, db_session, seed_tenant, seed_branch
    ):
        """No source rows => empty result, no error."""
        service = AssignmentService(db_session)
        result = service.copy_from_previous(
            branch_id=seed_branch.id,
            from_date=date(2026, 5, 13),
            to_date=date(2026, 5, 14),
            shift=None,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result["created"] == []
        assert result["skipped_count"] == 0
