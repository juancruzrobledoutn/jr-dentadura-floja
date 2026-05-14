"""
Tests for TableService - table management service.

Tests cover:
- CRUD operations (create, read, update, delete)
- Sector-based listing
- Sector validation on create
- Code-based lookup
- Edge cases and error handling
"""

import pytest
from rest_api.models import Table, BranchSector
from rest_api.services.domain import TableService
from shared.utils.exceptions import ValidationError, NotFoundError
from tests.conftest import next_id


class TestTableServiceCreate:
    """Tests for TableService.create()"""

    @pytest.fixture
    def table_service(self, db_session):
        """Get a TableService instance."""
        return TableService(db_session)

    @pytest.fixture
    def seed_sector(self, db_session, seed_branch, seed_tenant):
        """Create a test sector for table creation."""
        sector = BranchSector(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Main Floor",
            prefix="MF",
        )
        db_session.add(sector)
        db_session.commit()
        db_session.refresh(sector)
        return sector

    def test_create_table(
        self, table_service, seed_sector, seed_tenant
    ):
        """Can create a table with valid sector."""
        data = {
            "code": "MF-01",
            "capacity": 4,
            "sector_id": seed_sector.id,
            "status": "FREE",
        }

        result = table_service.create(
            data=data,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result.code == "MF-01"
        assert result.capacity == 4
        assert result.status == "FREE"
        assert result.is_active is True
        # branch_id should be copied from sector
        assert result.branch_id == seed_sector.branch_id

    def test_create_table_without_sector_id_fails(
        self, table_service, seed_tenant
    ):
        """Creating table without sector_id raises ValidationError."""
        data = {
            "code": "X-01",
            "capacity": 2,
            "status": "FREE",
        }

        with pytest.raises(ValidationError) as exc_info:
            table_service.create(
                data=data,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert "sector_id" in str(exc_info.value).lower()

    def test_create_table_invalid_sector_fails(
        self, table_service, seed_tenant
    ):
        """Creating table with non-existent sector raises ValidationError."""
        data = {
            "code": "X-02",
            "capacity": 2,
            "sector_id": 99999,
            "status": "FREE",
        }

        with pytest.raises(ValidationError) as exc_info:
            table_service.create(
                data=data,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert "sector_id" in str(exc_info.value).lower()


class TestTableServiceRead:
    """Tests for TableService listing and lookup methods."""

    @pytest.fixture
    def table_service(self, db_session):
        return TableService(db_session)

    @pytest.fixture
    def seed_sector(self, db_session, seed_branch, seed_tenant):
        """Create a test sector."""
        sector = BranchSector(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Terrace",
            prefix="TER",
        )
        db_session.add(sector)
        db_session.commit()
        db_session.refresh(sector)
        return sector

    @pytest.fixture
    def existing_tables(self, db_session, seed_sector, seed_branch, seed_tenant):
        """Create multiple tables for listing tests."""
        tables = []
        for i in range(1, 4):
            table = Table(
                id=next_id(),
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                sector_id=seed_sector.id,
                code=f"TR-{i:02d}",
                capacity=4,
                status="FREE",
            )
            db_session.add(table)
            tables.append(table)
        db_session.commit()
        for t in tables:
            db_session.refresh(t)
        return tables

    def test_list_tables_by_sector(
        self, table_service, existing_tables, seed_sector, seed_tenant
    ):
        """Can list all tables for a specific sector."""
        results = table_service.list_by_sector(
            tenant_id=seed_tenant.id,
            sector_id=seed_sector.id,
        )

        assert len(results) == 3
        codes = [t.code for t in results]
        assert "TR-01" in codes
        assert "TR-02" in codes
        assert "TR-03" in codes

    def test_list_tables_by_branch(
        self, table_service, existing_tables, seed_branch, seed_tenant
    ):
        """Can list all tables for a branch."""
        results = table_service.list_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        assert len(results) == 3

    def test_get_table_by_id(
        self, table_service, existing_tables, seed_tenant
    ):
        """Can get a single table by ID."""
        target = existing_tables[0]
        result = table_service.get_by_id(
            entity_id=target.id,
            tenant_id=seed_tenant.id,
        )

        assert result.id == target.id
        assert result.code == target.code

    def test_get_table_by_code(
        self, table_service, existing_tables, seed_branch, seed_tenant
    ):
        """Can look up a table by its code within a branch."""
        result = table_service.get_by_code(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code="TR-02",
        )

        assert result is not None
        assert result.code == "TR-02"

    def test_get_table_by_code_not_found(
        self, table_service, seed_branch, seed_tenant
    ):
        """Looking up non-existent code returns None."""
        result = table_service.get_by_code(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            code="NONEXISTENT",
        )

        assert result is None

    def test_get_table_not_found(self, table_service, seed_tenant):
        """Getting non-existent table raises NotFoundError."""
        with pytest.raises(NotFoundError):
            table_service.get_by_id(
                entity_id=99999,
                tenant_id=seed_tenant.id,
            )


class TestTableServiceUpdate:
    """Tests for TableService.update()"""

    @pytest.fixture
    def table_service(self, db_session):
        return TableService(db_session)

    @pytest.fixture
    def seed_sector(self, db_session, seed_branch, seed_tenant):
        sector = BranchSector(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Bar",
            prefix="BAR",
        )
        db_session.add(sector)
        db_session.commit()
        db_session.refresh(sector)
        return sector

    @pytest.fixture
    def existing_table(self, db_session, seed_sector, seed_branch, seed_tenant):
        """Create a table for update tests."""
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            sector_id=seed_sector.id,
            code="BAR-01",
            capacity=2,
            status="FREE",
        )
        db_session.add(table)
        db_session.commit()
        db_session.refresh(table)
        return table

    def test_update_table(
        self, table_service, existing_table, seed_tenant
    ):
        """Can update table capacity and code."""
        result = table_service.update(
            entity_id=existing_table.id,
            data={"capacity": 6, "code": "BAR-01-VIP"},
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result.capacity == 6
        assert result.code == "BAR-01-VIP"

    def test_update_nonexistent_table_fails(
        self, table_service, seed_tenant
    ):
        """Updating non-existent table raises NotFoundError."""
        with pytest.raises(NotFoundError):
            table_service.update(
                entity_id=99999,
                data={"capacity": 8},
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )


class TestTableServiceDelete:
    """Tests for TableService.delete()"""

    @pytest.fixture
    def table_service(self, db_session):
        return TableService(db_session)

    @pytest.fixture
    def seed_sector(self, db_session, seed_branch, seed_tenant):
        sector = BranchSector(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Patio",
            prefix="PAT",
        )
        db_session.add(sector)
        db_session.commit()
        db_session.refresh(sector)
        return sector

    @pytest.fixture
    def deletable_table(self, db_session, seed_sector, seed_branch, seed_tenant):
        """Create a table that can be deleted."""
        table = Table(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            sector_id=seed_sector.id,
            code="PT-01",
            capacity=4,
            status="FREE",
        )
        db_session.add(table)
        db_session.commit()
        db_session.refresh(table)
        return table

    def test_soft_delete_table(
        self, table_service, db_session, deletable_table, seed_tenant
    ):
        """Can soft delete a table."""
        table_service.delete(
            entity_id=deletable_table.id,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        db_session.refresh(deletable_table)
        assert deletable_table.is_active is False

    def test_deleted_table_excluded_from_list(
        self, table_service, db_session, deletable_table, seed_branch, seed_tenant
    ):
        """Soft-deleted tables are excluded from list by default."""
        table_service.delete(
            entity_id=deletable_table.id,
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        results = table_service.list_by_branch(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        ids = [t.id for t in results]
        assert deletable_table.id not in ids

    def test_delete_nonexistent_table_fails(
        self, table_service, seed_tenant
    ):
        """Deleting non-existent table raises NotFoundError."""
        with pytest.raises(NotFoundError):
            table_service.delete(
                entity_id=99999,
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )
