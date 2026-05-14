"""
Tests for permission decorators
(rest_api/services/permissions/decorators.py).

S3.3: Verifies decorator behavior for sync and async routes:
- 401 raised when user is None
- ForbiddenError on insufficient permissions
- PermissionContext injected as _permission_ctx kwarg (when applicable)
- Decorators delegate to PermissionContext.require_* helpers
"""

import pytest
from fastapi import HTTPException

from rest_api.services.permissions.context import Action, PermissionContext
from rest_api.services.permissions.decorators import (
    check_branch_access,
    require_admin,
    require_management,
    require_permission,
)
from shared.utils.exceptions import ForbiddenError


def _user(roles, *, sub=1, branch_ids=None):
    return {
        "sub": sub,
        "tenant_id": 1,
        "branch_ids": branch_ids if branch_ids is not None else [],
        "roles": roles,
        "email": "u@test.com",
    }


# =============================================================================
# require_admin
# =============================================================================


class TestRequireAdmin:
    async def test_async_admin_passes(self):
        @require_admin
        async def handler(*, user):
            return {"ok": True}

        result = await handler(user=_user(["ADMIN"]))
        assert result == {"ok": True}

    async def test_async_non_admin_raises(self):
        @require_admin
        async def handler(*, user):
            return {"ok": True}

        with pytest.raises(ForbiddenError):
            await handler(user=_user(["WAITER"]))

    def test_sync_admin_passes(self):
        @require_admin
        def handler(*, user):
            return {"ok": True}

        result = handler(user=_user(["ADMIN"]))
        assert result == {"ok": True}

    def test_sync_no_user_raises_401(self):
        @require_admin
        def handler(*, user):
            return {"ok": True}

        with pytest.raises(HTTPException) as exc:
            handler(user=None)
        assert exc.value.status_code == 401


# =============================================================================
# require_management
# =============================================================================


class TestRequireManagement:
    async def test_admin_passes(self):
        @require_management
        async def handler(*, user):
            return "ok"

        assert await handler(user=_user(["ADMIN"])) == "ok"

    async def test_manager_passes(self):
        @require_management
        async def handler(*, user):
            return "ok"

        assert await handler(user=_user(["MANAGER"])) == "ok"

    async def test_waiter_raises_forbidden(self):
        @require_management
        async def handler(*, user):
            return "ok"

        with pytest.raises(ForbiddenError):
            await handler(user=_user(["WAITER"]))

    async def test_no_user_raises_401(self):
        @require_management
        async def handler(*, user):
            return "ok"

        with pytest.raises(HTTPException) as exc:
            await handler(user=None)
        assert exc.value.status_code == 401


# =============================================================================
# require_permission (CREATE)
# =============================================================================


class TestRequirePermissionCreate:
    async def test_admin_can_create_any_entity(self):
        @require_permission(Action.CREATE, "Product")
        async def handler(*, user, _permission_ctx=None):
            assert isinstance(_permission_ctx, PermissionContext)
            return "ok"

        assert await handler(user=_user(["ADMIN"])) == "ok"

    async def test_waiter_cannot_create_non_whitelisted_entity(self):
        @require_permission(Action.CREATE, "Product")
        async def handler(*, user, _permission_ctx=None):
            return "ok"

        with pytest.raises(ForbiddenError):
            await handler(user=_user(["WAITER"], branch_ids=[1]))

    async def test_no_user_raises_401(self):
        @require_permission(Action.CREATE, "Product")
        async def handler(*, user, _permission_ctx=None):
            return "ok"

        with pytest.raises(HTTPException) as exc:
            await handler(user=None)
        assert exc.value.status_code == 401

    async def test_context_is_injected(self):
        """The decorator must inject _permission_ctx into kwargs."""
        captured = {}

        @require_permission(Action.READ, None)
        async def handler(*, user, _permission_ctx=None):
            captured["ctx"] = _permission_ctx
            return "ok"

        await handler(user=_user(["ADMIN"]))
        assert isinstance(captured["ctx"], PermissionContext)
        assert captured["ctx"].is_admin is True


# =============================================================================
# check_branch_access
# =============================================================================


class TestCheckBranchAccess:
    async def test_admin_can_access_any_branch(self):
        @check_branch_access("branch_id")
        async def handler(branch_id, *, user):
            return branch_id

        # The decorator reads branch_id from kwargs — pass it as a keyword.
        result = await handler(branch_id=99, user=_user(["ADMIN"]))
        assert result == 99

    async def test_manager_denied_unassigned_branch(self):
        @check_branch_access("branch_id")
        async def handler(branch_id, *, user):
            return branch_id

        with pytest.raises(ForbiddenError):
            await handler(branch_id=99, user=_user(["MANAGER"], branch_ids=[1]))

    async def test_no_user_raises_401(self):
        @check_branch_access("branch_id")
        async def handler(branch_id, *, user):
            return branch_id

        with pytest.raises(HTTPException) as exc:
            await handler(branch_id=1, user=None)
        assert exc.value.status_code == 401

    async def test_missing_branch_id_param_is_passthrough(self):
        """If the named param is absent, the decorator should not block."""
        @check_branch_access("branch_id")
        async def handler(*, user):
            return "ok"

        assert await handler(user=_user(["WAITER"], branch_ids=[])) == "ok"
