"""
Tests for PermissionContext (rest_api/services/permissions/context.py).

S3.3: Unit tests covering:
- Strategy selection by highest privilege
- User property accessors (user_id, tenant_id, branch_ids, roles)
- require_admin / require_management / require_branch_access
- can_create / can_read / can_update / can_delete shorthand methods
- has_branch_access for cross-branch isolation
"""

import pytest

from rest_api.services.permissions.context import Action, PermissionContext
from rest_api.services.permissions.strategies import (
    AdminStrategy,
    KitchenStrategy,
    ManagerStrategy,
    ReadOnlyStrategy,
    WaiterStrategy,
)
from shared.utils.exceptions import ForbiddenError


def _user(roles, *, sub=1, tenant_id=1, branch_ids=None, email="u@test.com"):
    return {
        "sub": sub,
        "tenant_id": tenant_id,
        "branch_ids": branch_ids if branch_ids is not None else [],
        "roles": roles,
        "email": email,
    }


class TestStrategySelection:
    def test_admin_role_gets_admin_strategy(self):
        ctx = PermissionContext(_user(["ADMIN"]))
        assert isinstance(ctx.strategy, AdminStrategy)
        assert ctx.is_admin is True
        assert ctx.is_management is True

    def test_manager_role_gets_manager_strategy(self):
        ctx = PermissionContext(_user(["MANAGER"]))
        assert isinstance(ctx.strategy, ManagerStrategy)
        assert ctx.is_admin is False
        assert ctx.is_manager is True
        assert ctx.is_management is True

    def test_kitchen_role_gets_kitchen_strategy(self):
        ctx = PermissionContext(_user(["KITCHEN"]))
        assert isinstance(ctx.strategy, KitchenStrategy)
        assert ctx.is_management is False

    def test_waiter_role_gets_waiter_strategy(self):
        ctx = PermissionContext(_user(["WAITER"]))
        assert isinstance(ctx.strategy, WaiterStrategy)
        assert ctx.is_management is False

    def test_unknown_role_falls_back_to_read_only(self):
        ctx = PermissionContext(_user(["UNKNOWN"]))
        assert isinstance(ctx.strategy, ReadOnlyStrategy)

    def test_highest_privilege_wins_when_multiple_roles(self):
        """ADMIN beats MANAGER beats KITCHEN beats WAITER."""
        ctx = PermissionContext(_user(["WAITER", "ADMIN", "KITCHEN"]))
        assert isinstance(ctx.strategy, AdminStrategy)

        ctx2 = PermissionContext(_user(["WAITER", "MANAGER"]))
        assert isinstance(ctx2.strategy, ManagerStrategy)


class TestUserProperties:
    def test_user_id_returns_int_from_string_sub(self):
        ctx = PermissionContext(_user(["ADMIN"], sub="42"))
        assert ctx.user_id == 42

    def test_user_id_returns_int_from_int_sub(self):
        ctx = PermissionContext(_user(["ADMIN"], sub=99))
        assert ctx.user_id == 99

    def test_user_id_zero_when_sub_missing(self):
        ctx = PermissionContext({"roles": ["ADMIN"]})
        assert ctx.user_id == 0

    def test_user_email(self):
        ctx = PermissionContext(_user(["ADMIN"], email="boss@x.test"))
        assert ctx.user_email == "boss@x.test"

    def test_user_email_default_empty(self):
        ctx = PermissionContext({"roles": ["ADMIN"]})
        assert ctx.user_email == ""

    def test_tenant_id_and_branch_ids(self):
        ctx = PermissionContext(_user(["MANAGER"], tenant_id=7, branch_ids=[3, 5]))
        assert ctx.tenant_id == 7
        assert ctx.branch_ids == [3, 5]
        assert ctx.roles == ["MANAGER"]


class TestRequireAdmin:
    def test_admin_passes(self):
        ctx = PermissionContext(_user(["ADMIN"]))
        # Should not raise
        ctx.require_admin()

    def test_manager_raises(self):
        ctx = PermissionContext(_user(["MANAGER"]))
        with pytest.raises(ForbiddenError):
            ctx.require_admin()

    def test_waiter_raises(self):
        ctx = PermissionContext(_user(["WAITER"]))
        with pytest.raises(ForbiddenError):
            ctx.require_admin()


class TestRequireManagement:
    def test_admin_passes(self):
        ctx = PermissionContext(_user(["ADMIN"]))
        ctx.require_management()

    def test_manager_passes(self):
        ctx = PermissionContext(_user(["MANAGER"]))
        ctx.require_management()

    def test_kitchen_raises(self):
        ctx = PermissionContext(_user(["KITCHEN"]))
        with pytest.raises(ForbiddenError):
            ctx.require_management()

    def test_waiter_raises(self):
        ctx = PermissionContext(_user(["WAITER"]))
        with pytest.raises(ForbiddenError):
            ctx.require_management()


class TestBranchAccess:
    def test_admin_has_access_to_any_branch(self):
        ctx = PermissionContext(_user(["ADMIN"], branch_ids=[1]))
        assert ctx.has_branch_access(99) is True
        ctx.require_branch_access(99)  # no raise

    def test_admin_has_access_when_branch_is_none(self):
        ctx = PermissionContext(_user(["ADMIN"], branch_ids=[]))
        assert ctx.has_branch_access(None) is True

    def test_manager_has_access_to_assigned_branch(self):
        ctx = PermissionContext(_user(["MANAGER"], branch_ids=[1, 2]))
        assert ctx.has_branch_access(1) is True
        assert ctx.has_branch_access(2) is True

    def test_manager_denied_unassigned_branch(self):
        ctx = PermissionContext(_user(["MANAGER"], branch_ids=[1]))
        assert ctx.has_branch_access(99) is False
        with pytest.raises(ForbiddenError):
            ctx.require_branch_access(99)

    def test_branch_none_always_allowed(self):
        """branch_id=None means tenant-wide entity, accessible to anyone."""
        ctx = PermissionContext(_user(["WAITER"], branch_ids=[1]))
        assert ctx.has_branch_access(None) is True


class TestCanShorthand:
    def test_admin_can_create_anything(self):
        ctx = PermissionContext(_user(["ADMIN"]))
        assert ctx.can_create("Product") is True
        assert ctx.can_create("AnythingElse", branch_id=42) is True

    def test_admin_can_delete_anything(self):
        ctx = PermissionContext(_user(["ADMIN"]))

        class FakeEntity:
            branch_id = 1

        assert ctx.can_delete(FakeEntity()) is True

    def test_manager_cannot_delete(self):
        ctx = PermissionContext(_user(["MANAGER"], branch_ids=[1]))

        class FakeEntity:
            branch_id = 1

        # ManagerStrategy uses NoDeleteMixin
        assert ctx.can_delete(FakeEntity()) is False

    def test_waiter_can_create_service_call_in_assigned_branch(self):
        ctx = PermissionContext(_user(["WAITER"], branch_ids=[1]))
        assert ctx.can_create("ServiceCall", branch_id=1) is True
        # Outside assigned branches
        assert ctx.can_create("ServiceCall", branch_id=99) is False

    def test_kitchen_cannot_create(self):
        ctx = PermissionContext(_user(["KITCHEN"], branch_ids=[1]))
        assert ctx.can_create("Round", branch_id=1) is False

    def test_can_with_action_enum_create(self):
        """can(Action.CREATE, "Product") should accept entity type as string."""
        ctx = PermissionContext(_user(["ADMIN"]))
        assert ctx.can(Action.CREATE, "Product") is True

    def test_can_with_action_enum_read(self):
        ctx = PermissionContext(_user(["ADMIN"]))

        class FakeEntity:
            branch_id = 1

        assert ctx.can(Action.READ, FakeEntity()) is True

    def test_can_unknown_action_returns_false(self):
        """Passing an unsupported value to can() returns False."""
        ctx = PermissionContext(_user(["ADMIN"]))

        # Use a sentinel value that doesn't match any Action branch
        # by constructing an enum-like with an unexpected name
        class FakeAction:
            pass

        # Should fall through all branches and return False
        assert ctx.can(FakeAction(), "Product") is False  # type: ignore[arg-type]
