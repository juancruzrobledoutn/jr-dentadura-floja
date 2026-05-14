"""
Tests for S1.2 — refresh token migration to cookie-only.

Verifies that:
- The HttpOnly cookie is ALWAYS set on /auth/login and /auth/refresh (regardless of flag).
- The `refresh_token` body field is conditional on `settings.legacy_refresh_in_body`:
    * flag=True  → refresh_token present in body (legacy/back-compat).
    * flag=False → refresh_token absent (None) in body (cookie-only).
- Schemas serialize `None` correctly when the flag is off.
- A deprecation warning is logged each time the body field is emitted.
"""

import logging

import pytest

from shared.config.settings import settings
from rest_api.routers.auth.routes import (
    LoginWithRefreshResponse,
    TokenRefreshResponse,
)
from shared.utils.schemas import UserInfo


# =============================================================================
# Schema-level tests (no DB required)
# =============================================================================


class TestRefreshTokenSchemaSerialization:
    """Verify Pydantic schemas accept None for refresh_token (S1.2 contract)."""

    def test_login_response_serializes_refresh_token_none_as_null(self):
        """When refresh_token is None, the serialized response has it as null/None."""
        resp = LoginWithRefreshResponse(
            access_token="access-abc",
            refresh_token=None,
            token_type="Bearer",
            expires_in=900,
            user=UserInfo(
                id=1,
                email="x@y.com",
                tenant_id=1,
                branch_ids=[1],
                roles=["ADMIN"],
            ),
        )
        dumped = resp.model_dump()
        assert dumped["refresh_token"] is None
        assert dumped["access_token"] == "access-abc"

    def test_login_response_accepts_refresh_token_string(self):
        """Legacy path: refresh_token can still be a string."""
        resp = LoginWithRefreshResponse(
            access_token="access-abc",
            refresh_token="refresh-xyz",
            token_type="Bearer",
            expires_in=900,
            user=UserInfo(
                id=1,
                email="x@y.com",
                tenant_id=1,
                branch_ids=[1],
                roles=["ADMIN"],
            ),
        )
        assert resp.refresh_token == "refresh-xyz"

    def test_login_response_refresh_token_defaults_to_none(self):
        """When the field is omitted entirely, default is None."""
        resp = LoginWithRefreshResponse(
            access_token="access-abc",
            token_type="Bearer",
            expires_in=900,
            user=UserInfo(
                id=1,
                email="x@y.com",
                tenant_id=1,
                branch_ids=[1],
                roles=["ADMIN"],
            ),
        )
        assert resp.refresh_token is None

    def test_token_refresh_response_serializes_none(self):
        """TokenRefreshResponse with refresh_token=None serializes as null."""
        resp = TokenRefreshResponse(
            access_token="access-abc",
            refresh_token=None,
            token_type="Bearer",
            expires_in=900,
        )
        dumped = resp.model_dump()
        assert dumped["refresh_token"] is None

    def test_token_refresh_response_accepts_string(self):
        """TokenRefreshResponse with refresh_token=str (legacy) still works."""
        resp = TokenRefreshResponse(
            access_token="access-abc",
            refresh_token="refresh-xyz",
            token_type="Bearer",
            expires_in=900,
        )
        assert resp.refresh_token == "refresh-xyz"


# =============================================================================
# Integration tests — exercise the real /api/auth/login endpoint
# =============================================================================


def _login(client, email="admin@test.com", password="testpass123"):
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


class TestLoginRefreshTokenInBody:
    """Verify the conditional body field on /api/auth/login."""

    def test_login_with_legacy_flag_includes_refresh_token_in_body(
        self, client, seed_admin_user, monkeypatch
    ):
        """flag=True (default) → refresh_token IS present in response body."""
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)

        response = _login(client)

        assert response.status_code == 200
        body = response.json()
        assert body.get("refresh_token") is not None
        assert isinstance(body["refresh_token"], str)
        assert len(body["refresh_token"]) > 0

    def test_login_without_legacy_flag_excludes_refresh_token_from_body(
        self, client, seed_admin_user, monkeypatch
    ):
        """flag=False → refresh_token is null/absent in body (cookie-only)."""
        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)

        response = _login(client)

        assert response.status_code == 200
        body = response.json()
        # Body MUST NOT contain a real refresh token
        assert body.get("refresh_token") is None
        # But the rest of the auth response is intact
        assert body.get("access_token")
        assert body.get("token_type") == "Bearer"
        assert body.get("user", {}).get("email") == "admin@test.com"

    def test_login_always_sets_httponly_cookie_regardless_of_flag(
        self, client, seed_admin_user, monkeypatch
    ):
        """The HttpOnly cookie MUST be set in BOTH flag states (defense-in-depth)."""
        # Case A: legacy flag ON
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)
        response_legacy = _login(client)
        assert response_legacy.status_code == 200
        assert "refresh_token" in response_legacy.cookies, (
            "Cookie missing with flag=True — defense-in-depth broken"
        )

        # Case B: legacy flag OFF
        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)
        response_cookie_only = _login(client)
        assert response_cookie_only.status_code == 200
        assert "refresh_token" in response_cookie_only.cookies, (
            "Cookie missing with flag=False — refresh would be lost entirely"
        )

    def test_login_logs_deprecation_warning_when_legacy_flag_on(
        self, client, seed_admin_user, monkeypatch, caplog
    ):
        """flag=True → deprecation warning is logged for each login."""
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)

        with caplog.at_level(logging.WARNING):
            response = _login(client)
        assert response.status_code == 200

        # The warning string is shared between /login and /refresh, search for it.
        warning_emitted = any(
            "DEPRECATED: refresh_token returned in response body" in rec.message
            or "DEPRECATED: refresh_token returned in response body" in str(rec)
            for rec in caplog.records
        )
        assert warning_emitted, (
            "Expected deprecation warning when legacy_refresh_in_body=True. "
            f"Captured records: {[r.message for r in caplog.records]}"
        )

    def test_login_does_not_log_deprecation_when_flag_off(
        self, client, seed_admin_user, monkeypatch, caplog
    ):
        """flag=False → no deprecation warning (the migration is complete for this caller)."""
        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)

        with caplog.at_level(logging.WARNING):
            response = _login(client)
        assert response.status_code == 200

        for rec in caplog.records:
            assert "DEPRECATED: refresh_token returned in response body" not in (
                rec.message if isinstance(rec.message, str) else str(rec.message)
            )


class TestRefreshEndpointRefreshTokenInBody:
    """Verify the conditional body field on /api/auth/refresh."""

    def _login_and_get_cookie(self, client, monkeypatch):
        """Log in to obtain a refresh-token cookie usable by /api/auth/refresh."""
        # Use legacy=True for the initial login so we can also grab the token from body
        # if needed, but we'll prefer the cookie which is always set.
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)
        response = _login(client)
        assert response.status_code == 200
        cookie = response.cookies.get("refresh_token")
        assert cookie, "Login did not set refresh_token cookie"
        return cookie

    def test_refresh_with_legacy_flag_includes_token_in_body(
        self, client, seed_admin_user, monkeypatch
    ):
        """flag=True → /refresh returns the rotated refresh_token in body."""
        cookie = self._login_and_get_cookie(client, monkeypatch)

        # Now flip the flag we care about for the refresh call (still True here)
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)
        client.cookies.set("refresh_token", cookie)
        response = client.post("/api/auth/refresh")

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body.get("refresh_token") is not None
        assert isinstance(body["refresh_token"], str)
        assert len(body["refresh_token"]) > 0

    def test_refresh_without_legacy_flag_excludes_token_from_body(
        self, client, seed_admin_user, monkeypatch
    ):
        """flag=False on /refresh → body has no refresh_token; cookie still set."""
        cookie = self._login_and_get_cookie(client, monkeypatch)

        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)
        client.cookies.set("refresh_token", cookie)
        response = client.post("/api/auth/refresh")

        assert response.status_code == 200, response.json()
        body = response.json()
        # Body MUST NOT contain a new refresh token
        assert body.get("refresh_token") is None
        # Access token is still rotated normally
        assert body.get("access_token")
        # The HttpOnly cookie MUST still be set (new rotated token lives only in cookie)
        assert "refresh_token" in response.cookies


# =============================================================================
# Settings tests — production warning behaviour
# =============================================================================


class TestProductionWarning:
    """Verify validate_production_secrets emits a warning (not an error) for the legacy flag."""

    def test_legacy_flag_in_production_does_not_block_startup(self, monkeypatch, caplog):
        """legacy_refresh_in_body=True in production should warn but NOT add to errors."""
        # We can't mutate `environment` after construction without re-creating Settings,
        # but we can monkeypatch the attribute on the existing instance for this test.
        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "legacy_refresh_in_body", True)
        # The other production checks would otherwise fail — neutralize them:
        monkeypatch.setattr(settings, "jwt_secret", "x" * 64)
        monkeypatch.setattr(settings, "table_token_secret", "x" * 64)
        monkeypatch.setattr(settings, "debug", False)
        monkeypatch.setattr(settings, "allowed_origins", "https://example.com")
        # Provide a valid Fernet key so the TOTP branch passes
        from cryptography.fernet import Fernet
        monkeypatch.setattr(settings, "totp_encryption_key", Fernet.generate_key().decode())

        with caplog.at_level(logging.WARNING, logger="shared.config.settings"):
            errors = settings.validate_production_secrets()

        # No production blocker
        assert not any("LEGACY_REFRESH_IN_BODY" in e for e in errors), (
            "legacy_refresh_in_body must NOT be in the fail-fast errors list"
        )
        # But there is a warning
        assert any(
            "LEGACY_REFRESH_IN_BODY=True in production" in rec.message
            for rec in caplog.records
        ), f"Expected warning. Got: {[r.message for r in caplog.records]}"

    def test_no_warning_when_flag_off_in_production(self, monkeypatch, caplog):
        """legacy_refresh_in_body=False in production → no warning."""
        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)
        monkeypatch.setattr(settings, "jwt_secret", "x" * 64)
        monkeypatch.setattr(settings, "table_token_secret", "x" * 64)
        monkeypatch.setattr(settings, "debug", False)
        monkeypatch.setattr(settings, "allowed_origins", "https://example.com")
        from cryptography.fernet import Fernet
        monkeypatch.setattr(settings, "totp_encryption_key", Fernet.generate_key().decode())

        with caplog.at_level(logging.WARNING, logger="shared.config.settings"):
            settings.validate_production_secrets()

        for rec in caplog.records:
            assert "LEGACY_REFRESH_IN_BODY=True in production" not in rec.message
