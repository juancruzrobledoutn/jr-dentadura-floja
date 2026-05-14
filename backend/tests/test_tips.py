"""
Tests for tip domain service: recording, pools, and distribution.
"""

import pytest
from tests.conftest import next_id
from rest_api.models import Tip, TipPool, TipDistribution
from rest_api.services.domain.tip_service import TipService
from shared.utils.exceptions import NotFoundError, ValidationError


class TestTipService:
    """Test tip recording and distribution."""

    def test_record_tip(self, db_session, seed_tenant, seed_branch):
        """Recording a valid tip should create a Tip record."""
        service = TipService(db_session)
        tip = service.record_tip(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            amount_cents=5000,
            payment_method="CASH",
            waiter_id=1,
        )

        assert tip.amount_cents == 5000
        assert tip.payment_method == "CASH"
        assert tip.waiter_id == 1

    def test_record_tip_invalid_amount(self, db_session, seed_tenant, seed_branch):
        """Tip with zero or negative amount should raise ValidationError."""
        service = TipService(db_session)
        with pytest.raises(ValidationError, match="mayor a cero"):
            service.record_tip(
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                amount_cents=0,
                payment_method="CASH",
            )

    def test_record_tip_invalid_method(self, db_session, seed_tenant, seed_branch):
        """Tip with invalid payment method should raise ValidationError."""
        service = TipService(db_session)
        with pytest.raises(ValidationError, match="Método de pago inválido"):
            service.record_tip(
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                amount_cents=1000,
                payment_method="BITCOIN",
            )

    def test_create_pool_valid(self, db_session, seed_tenant, seed_branch):
        """Creating a pool with percentages summing to 100 should succeed."""
        service = TipService(db_session)
        pool = service.create_pool(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Pool Estándar",
            waiter_percent=70,
            kitchen_percent=20,
            other_percent=10,
        )

        assert pool.name == "Pool Estándar"
        assert pool.waiter_percent == 70
        assert pool.kitchen_percent == 20
        assert pool.other_percent == 10

    def test_create_pool_invalid_percentages(self, db_session, seed_tenant, seed_branch):
        """Pool percentages not summing to 100 should raise ValidationError."""
        service = TipService(db_session)
        with pytest.raises(ValidationError, match="sumar 100"):
            service.create_pool(
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                name="Pool Roto",
                waiter_percent=50,
                kitchen_percent=20,
                other_percent=10,
            )

    def test_distribute_tip(self, db_session, seed_tenant, seed_branch):
        """Distributing a tip via pool should split amounts by percentages."""
        service = TipService(db_session)

        # Create pool: 70% waiter, 20% kitchen, 10% other
        pool = service.create_pool(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Pool Test",
            waiter_percent=70,
            kitchen_percent=20,
            other_percent=10,
        )

        # Record tip of $100 (10000 cents)
        tip = service.record_tip(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            amount_cents=10000,
            payment_method="CASH",
            waiter_id=1,
        )

        # Distribute
        distributions = service.distribute_tip(
            tip_id=tip.id,
            pool_id=pool.id,
            tenant_id=seed_tenant.id,
        )

        amounts = {d.role: d.amount_cents for d in distributions}
        assert amounts["KITCHEN"] == 2000   # 20%
        assert amounts["MANAGER"] == 1000   # 10%
        assert amounts["WAITER"] == 7000    # remainder = 70%
        assert sum(amounts.values()) == 10000

    def test_distribute_tip_already_distributed(self, db_session, seed_tenant, seed_branch):
        """Distributing a tip twice should raise ValidationError."""
        service = TipService(db_session)

        pool = service.create_pool(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            name="Pool Test",
            waiter_percent=80,
            kitchen_percent=15,
            other_percent=5,
        )

        tip = service.record_tip(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            amount_cents=5000,
            payment_method="CARD",
            waiter_id=1,
        )

        service.distribute_tip(tip_id=tip.id, pool_id=pool.id, tenant_id=seed_tenant.id)

        with pytest.raises(ValidationError, match="ya fue distribuida"):
            service.distribute_tip(tip_id=tip.id, pool_id=pool.id, tenant_id=seed_tenant.id)
