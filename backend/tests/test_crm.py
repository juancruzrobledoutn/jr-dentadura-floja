"""
Tests for CRM domain service: customer profiles, visits, loyalty points, and tier upgrades.
"""

import pytest
from tests.conftest import next_id
from rest_api.models.crm import CustomerProfile, LoyaltyRule, LoyaltyTransaction
from rest_api.services.domain.crm_service import CRMService, DEFAULT_SILVER, DEFAULT_GOLD, DEFAULT_PLATINUM
from shared.utils.exceptions import NotFoundError, ValidationError


class TestCRMService:
    """Test CRM customer profiles and loyalty."""

    def test_create_customer_profile(self, db_session, seed_tenant):
        """Creating a new customer profile should set default tier to BRONZE."""
        service = CRMService(db_session)
        profile = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="Juan Pérez",
            email="juan@example.com",
            phone="+5491155551234",
        )

        assert profile["name"] == "Juan Pérez"
        assert profile["loyalty_tier"] == "BRONZE"
        assert profile["loyalty_points"] == 0
        assert profile["total_visits"] == 0

    def test_get_existing_profile_by_email(self, db_session, seed_tenant):
        """Looking up an existing profile by email should return it, not create a new one."""
        service = CRMService(db_session)

        profile1 = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="Juan Pérez",
            email="juan@example.com",
        )
        profile2 = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="Juan P.",
            email="juan@example.com",
        )

        assert profile1["id"] == profile2["id"]

    def test_record_visit_updates_aggregates(self, db_session, seed_tenant, seed_branch):
        """Recording a visit should increment total_visits and total_spent_cents."""
        service = CRMService(db_session)
        profile = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="María López",
        )

        visit = service.record_visit(
            profile_id=profile["id"],
            branch_id=seed_branch.id,
            tenant_id=seed_tenant.id,
            total_cents=25000,
            party_size=4,
        )

        assert visit["total_spent_cents"] == 25000
        assert visit["party_size"] == 4

        # Verify profile aggregates updated
        updated = service.get_profile(profile["id"], seed_tenant.id)
        assert updated["total_visits"] == 1
        assert updated["total_spent_cents"] == 25000

    def test_earn_loyalty_points(self, db_session, seed_tenant, seed_branch):
        """Earning points based on active rule should award correct amount."""
        service = CRMService(db_session)

        # Create loyalty rule: 1 point per $100 (10000 cents)
        rule = LoyaltyRule(
            id=next_id(),
            tenant_id=seed_tenant.id,
            name="Regla base",
            rule_type="SPEND_BASED",
            points_per_unit=1,
            unit_amount_cents=10000,
            silver_threshold=DEFAULT_SILVER,
            gold_threshold=DEFAULT_GOLD,
            platinum_threshold=DEFAULT_PLATINUM,
        )
        db_session.add(rule)
        db_session.commit()

        profile = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="Carlos Test",
        )

        # Spend $500 (50000 cents) -> should earn 5 points
        result = service.earn_points(
            profile_id=profile["id"],
            check_total_cents=50000,
            tenant_id=seed_tenant.id,
        )

        assert result["points_earned"] == 5
        assert result["new_balance"] == 5

    def test_tier_upgrade(self, db_session, seed_tenant):
        """Reaching silver threshold should upgrade tier from BRONZE to SILVER."""
        service = CRMService(db_session)
        profile = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="VIP Customer",
        )

        # Manually set points above silver threshold
        db_profile = db_session.get(CustomerProfile, profile["id"])
        db_profile.loyalty_points = DEFAULT_SILVER + 100
        db_session.commit()

        new_tier = service.update_tier(profile["id"], seed_tenant.id)
        assert new_tier == "SILVER"

        # Verify in DB
        updated = service.get_profile(profile["id"], seed_tenant.id)
        assert updated["loyalty_tier"] == "SILVER"

    def test_redeem_points_insufficient(self, db_session, seed_tenant):
        """Redeeming more points than available should raise ValidationError."""
        service = CRMService(db_session)
        profile = service.get_or_create_profile(
            tenant_id=seed_tenant.id,
            name="Pobre Customer",
        )

        with pytest.raises(ValidationError, match="Puntos insuficientes"):
            service.redeem_points(
                profile_id=profile["id"],
                points=100,
                tenant_id=seed_tenant.id,
            )
