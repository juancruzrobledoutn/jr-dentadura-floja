"""
Tests for PermissionStrategy implementations
(rest_api/services/permissions/strategies.py).

S3.3: Per-strategy behavior verification.
"""

import pytest
from sqlalchemy import select

from rest_api.services.permissions.strategies import (
    AdminStrategy,
    KitchenStrategy,
    ManagerStrategy,
    ReadOnlyStrategy,
    WaiterStrategy,
    get_highest_privilege_strategy,
    get_strategy_for_role,
)
from shared.config.constants import Roles


# =============================================================================
# Helpers
# =============================================================================


def _user(roles, branch_ids=None):
    return {
        "sub": 1,
        "tenant_id": 1,
        "branch_ids": branch_ids if branch_ids is not None else [],
        "roles": roles,
    }


class _FakeEntityMixin:
    """Build named fake entity classes for strategy tests."""

    @staticmethod
    def make(class_name, branch_id=None, **attrs):
        cls = type(class_name, (), {"branch_id": branch_id, **attrs})
        return cls()


# =============================================================================
# AdminStrategy
# =============================================================================


class TestAdminStrategy:
    def test_role_name(self):
        assert AdminStrategy().role_name == Roles.ADMIN

    def test_can_do_everything(self):
        s = AdminStrategy()
        entity = _FakeEntityMixin.make("AnyThing", branch_id=99)
        assert s.can_create({}, "AnyType") is True
        assert s.can_read({}, entity) is True
        assert s.can_update({}, entity) is True
        assert s.can_delete({}, entity) is True

    def test_filter_query_does_not_restrict(self):
        """Admin filter_query is a passthrough."""
        from rest_api.models import Product
        s = AdminStrategy()
        query = select(Product)
        out = s.filter_query(query, _user(["ADMIN"]), Product)
        assert out is query  # No transformation


# =============================================================================
# ManagerStrategy
# =============================================================================


class TestManagerStrategy:
    def test_role_name(self):
        assert ManagerStrategy().role_name == Roles.MANAGER

    def test_can_create_whitelisted_entity_in_assigned_branch(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1, 2])
        assert s.can_create(user, "Staff", branch_id=1) is True
        assert s.can_create(user, "Table", branch_id=2) is True

    def test_cannot_create_in_unassigned_branch(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1])
        assert s.can_create(user, "Staff", branch_id=99) is False

    def test_cannot_create_non_whitelisted_entity(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1])
        # Product is NOT in CREATABLE_ENTITIES for managers
        assert s.can_create(user, "Product", branch_id=1) is False

    def test_cannot_delete_anything(self):
        s = ManagerStrategy()
        entity = _FakeEntityMixin.make("Staff", branch_id=1)
        assert s.can_delete(_user(["MANAGER"], branch_ids=[1]), entity) is False

    def test_can_update_whitelisted_entity_in_assigned_branch(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1])
        staff = _FakeEntityMixin.make("Staff", branch_id=1)
        assert s.can_update(user, staff) is True

    def test_can_read_entity_in_assigned_branch(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1])
        entity = _FakeEntityMixin.make("AnyEntity", branch_id=1)
        assert s.can_read(user, entity) is True

    def test_cannot_read_entity_in_unassigned_branch(self):
        s = ManagerStrategy()
        user = _user(["MANAGER"], branch_ids=[1])
        entity = _FakeEntityMixin.make("AnyEntity", branch_id=99)
        assert s.can_read(user, entity) is False


# =============================================================================
# KitchenStrategy
# =============================================================================


class TestKitchenStrategy:
    def test_role_name(self):
        assert KitchenStrategy().role_name == Roles.KITCHEN

    def test_cannot_create_or_delete(self):
        s = KitchenStrategy()
        user = _user(["KITCHEN"], branch_ids=[1])
        entity = _FakeEntityMixin.make("Round", branch_id=1)
        assert s.can_create(user, "Round", branch_id=1) is False
        assert s.can_delete(user, entity) is False

    def test_can_read_whitelisted_entities_in_branch(self):
        s = KitchenStrategy()
        user = _user(["KITCHEN"], branch_ids=[1])
        round_ = _FakeEntityMixin.make("Round", branch_id=1)
        ticket = _FakeEntityMixin.make("KitchenTicket", branch_id=1)
        assert s.can_read(user, round_) is True
        assert s.can_read(user, ticket) is True

    def test_cannot_read_non_whitelisted_entities(self):
        s = KitchenStrategy()
        user = _user(["KITCHEN"], branch_ids=[1])
        payment = _FakeEntityMixin.make("Payment", branch_id=1)
        assert s.can_read(user, payment) is False

    def test_can_update_round_in_assigned_branch(self):
        s = KitchenStrategy()
        user = _user(["KITCHEN"], branch_ids=[1])
        round_ = _FakeEntityMixin.make("Round", branch_id=1)
        assert s.can_update(user, round_) is True


# =============================================================================
# WaiterStrategy
# =============================================================================


class TestWaiterStrategy:
    def test_role_name(self):
        assert WaiterStrategy().role_name == Roles.WAITER

    def test_can_create_service_call_in_branch(self):
        s = WaiterStrategy()
        user = _user(["WAITER"], branch_ids=[1])
        assert s.can_create(user, "ServiceCall", branch_id=1) is True

    def test_cannot_create_non_whitelisted_entity(self):
        s = WaiterStrategy()
        user = _user(["WAITER"], branch_ids=[1])
        assert s.can_create(user, "Staff", branch_id=1) is False

    def test_cannot_delete_anything(self):
        s = WaiterStrategy()
        entity = _FakeEntityMixin.make("Round", branch_id=1)
        assert s.can_delete(_user(["WAITER"], branch_ids=[1]), entity) is False

    def test_can_read_table_in_branch(self):
        s = WaiterStrategy()
        user = _user(["WAITER"], branch_ids=[1])
        table = _FakeEntityMixin.make("Table", branch_id=1)
        assert s.can_read(user, table) is True

    def test_can_update_round_in_branch(self):
        s = WaiterStrategy()
        user = _user(["WAITER"], branch_ids=[1])
        round_ = _FakeEntityMixin.make("Round", branch_id=1)
        assert s.can_update(user, round_) is True


# =============================================================================
# ReadOnlyStrategy
# =============================================================================


class TestReadOnlyStrategy:
    def test_role_name(self):
        assert ReadOnlyStrategy().role_name == "READ_ONLY"

    def test_only_public_entities_readable(self):
        s = ReadOnlyStrategy()
        public_entity = _FakeEntityMixin.make("X", branch_id=None, is_public=True)
        private_entity = _FakeEntityMixin.make("Y", branch_id=None, is_public=False)
        assert s.can_read({}, public_entity) is True
        assert s.can_read({}, private_entity) is False

    def test_cannot_create_update_or_delete(self):
        s = ReadOnlyStrategy()
        entity = _FakeEntityMixin.make("X", is_public=True)
        assert s.can_create({}, "X") is False
        assert s.can_update({}, entity) is False
        assert s.can_delete({}, entity) is False


# =============================================================================
# Factory functions
# =============================================================================


class TestStrategyFactories:
    def test_get_strategy_for_role_known(self):
        assert isinstance(get_strategy_for_role(Roles.ADMIN), AdminStrategy)
        assert isinstance(get_strategy_for_role(Roles.MANAGER), ManagerStrategy)
        assert isinstance(get_strategy_for_role(Roles.KITCHEN), KitchenStrategy)
        assert isinstance(get_strategy_for_role(Roles.WAITER), WaiterStrategy)

    def test_get_strategy_for_role_unknown_returns_readonly(self):
        assert isinstance(get_strategy_for_role("BOGUS"), ReadOnlyStrategy)

    def test_get_highest_privilege_strategy_picks_admin_first(self):
        s = get_highest_privilege_strategy([Roles.WAITER, Roles.ADMIN])
        assert isinstance(s, AdminStrategy)

    def test_get_highest_privilege_strategy_picks_manager_over_kitchen(self):
        s = get_highest_privilege_strategy([Roles.KITCHEN, Roles.MANAGER])
        assert isinstance(s, ManagerStrategy)

    def test_get_highest_privilege_strategy_empty_returns_readonly(self):
        s = get_highest_privilege_strategy([])
        assert isinstance(s, ReadOnlyStrategy)

    def test_get_highest_privilege_strategy_unknown_role_returns_readonly(self):
        s = get_highest_privilege_strategy(["UNRECOGNIZED"])
        assert isinstance(s, ReadOnlyStrategy)
