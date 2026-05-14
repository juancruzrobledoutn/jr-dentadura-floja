"""
Tests for cash register domain service: sessions, movements, and reconciliation.
"""

import pytest
from tests.conftest import next_id
from rest_api.models import CashRegister, CashSession, CashMovement
from rest_api.services.domain.cash_service import CashService
from shared.utils.exceptions import NotFoundError, ValidationError


@pytest.fixture
def seed_register(db_session, seed_tenant, seed_branch):
    """Create a test cash register."""
    register = CashRegister(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        name="Caja Principal",
        is_open=False,
    )
    db_session.add(register)
    db_session.commit()
    db_session.refresh(register)
    return register


class TestCashService:
    """Test cash register session lifecycle."""

    def test_open_session(self, db_session, seed_tenant, seed_branch, seed_register):
        """Opening a session should set register to open state."""
        service = CashService(db_session)
        session = service.open_session(
            register_id=seed_register.id,
            opening_amount_cents=50000,
            user_id=1,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        assert session.status == "OPEN"
        assert session.opening_amount_cents == 50000

        db_session.refresh(seed_register)
        assert seed_register.is_open is True
        assert seed_register.current_session_id == session.id

    def test_open_session_already_open(self, db_session, seed_tenant, seed_branch, seed_register):
        """Opening a second session should raise ValidationError."""
        service = CashService(db_session)
        service.open_session(
            register_id=seed_register.id,
            opening_amount_cents=50000,
            user_id=1,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        with pytest.raises(ValidationError, match="ya está abierta"):
            service.open_session(
                register_id=seed_register.id,
                opening_amount_cents=10000,
                user_id=1,
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
            )

    def test_record_movement(self, db_session, seed_tenant, seed_branch, seed_register):
        """Recording a movement in an open session should succeed."""
        service = CashService(db_session)
        session = service.open_session(
            register_id=seed_register.id,
            opening_amount_cents=50000,
            user_id=1,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        movement = service.record_movement(
            session_id=session.id,
            movement_type="SALE",
            amount_cents=15000,
            payment_method="CASH",
            tenant_id=seed_tenant.id,
            description="Venta mesa 3",
        )

        assert movement.movement_type == "SALE"
        assert movement.amount_cents == 15000
        assert movement.payment_method == "CASH"

    def test_close_session_with_difference(self, db_session, seed_tenant, seed_branch, seed_register):
        """Closing a session calculates expected vs actual difference."""
        service = CashService(db_session)
        session = service.open_session(
            register_id=seed_register.id,
            opening_amount_cents=50000,
            user_id=1,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        # Record two CASH sales
        service.record_movement(
            session_id=session.id,
            movement_type="SALE",
            amount_cents=10000,
            payment_method="CASH",
            tenant_id=seed_tenant.id,
        )
        service.record_movement(
            session_id=session.id,
            movement_type="SALE",
            amount_cents=5000,
            payment_method="CASH",
            tenant_id=seed_tenant.id,
        )

        # Expected = 50000 + 10000 + 5000 = 65000
        # Actual count = 64000 (short by 1000)
        closed = service.close_session(
            session_id=session.id,
            actual_amount_cents=64000,
            user_id=1,
            tenant_id=seed_tenant.id,
        )

        assert closed.status == "CLOSED"
        assert closed.expected_amount_cents == 65000
        assert closed.actual_amount_cents == 64000
        assert closed.difference_cents == -1000

        db_session.refresh(seed_register)
        assert seed_register.is_open is False

    def test_invalid_movement_type(self, db_session, seed_tenant, seed_branch, seed_register):
        """Invalid movement type should raise ValidationError."""
        service = CashService(db_session)
        session = service.open_session(
            register_id=seed_register.id,
            opening_amount_cents=50000,
            user_id=1,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
        )

        with pytest.raises(ValidationError, match="Tipo de movimiento inválido"):
            service.record_movement(
                session_id=session.id,
                movement_type="INVALID",
                amount_cents=1000,
                payment_method="CASH",
                tenant_id=seed_tenant.id,
            )
