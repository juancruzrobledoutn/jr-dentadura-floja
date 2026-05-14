"""
Tests for S1.3 — Legacy HMAC table token deprecation.

Verifies that:
- With `allow_legacy_table_tokens=True` (default):
    * A valid JWT-format token verifies successfully and emits NO deprecation warning.
    * A valid legacy HMAC token verifies successfully but emits a DEPRECATION warning.
- With `allow_legacy_table_tokens=False`:
    * A valid JWT-format token still verifies successfully.
    * A valid legacy HMAC token is rejected with HTTP 401 (generic "Invalid table token").
- A totally invalid token (neither JWT nor HMAC) → HTTP 401 in both flag states.
- `validate_production_secrets()`:
    * In production with flag=True → warning logged, NO blocking error.
    * In production with flag=False → no warning related to this flag.

These tests do NOT require DB fixtures — they exercise `verify_table_token` directly.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

import pytest
from fastapi import HTTPException

from shared.config.settings import TABLE_TOKEN_SECRET, settings
from shared.security.auth import sign_table_token, verify_table_token


# =============================================================================
# Helpers
# =============================================================================


def _build_legacy_hmac_token(
    tenant_id: int = 1,
    branch_id: int = 1,
    table_id: int = 1,
    session_id: int = 1,
    ttl_seconds: int = 3 * 60 * 60,
) -> str:
    """
    Build a legacy HMAC-format table token matching the layout in
    `_verify_table_token_hmac`:
        {tenant_id}:{branch_id}:{table_id}:{session_id}:{expires_at}:{signature}
    where signature = first 32 hex chars of HMAC-SHA256(secret, data).
    """
    expires_at = int(time.time()) + ttl_seconds
    data = f"{tenant_id}:{branch_id}:{table_id}:{session_id}:{expires_at}"
    signature = hmac.new(
        TABLE_TOKEN_SECRET.encode(),
        data.encode(),
        hashlib.sha256,
    ).hexdigest()[:32]
    return f"{data}:{signature}"


def _build_jwt_token(
    tenant_id: int = 1,
    branch_id: int = 1,
    table_id: int = 1,
    session_id: int = 1,
) -> str:
    """Build a valid JWT-format table token via the production signer."""
    return sign_table_token(
        tenant_id=tenant_id,
        branch_id=branch_id,
        table_id=table_id,
        session_id=session_id,
    )


# =============================================================================
# Flag = True (default): both formats accepted
# =============================================================================


class TestLegacyFlagOnAcceptsBothFormats:
    """`allow_legacy_table_tokens=True` preserves current behaviour with a warning."""

    def test_jwt_token_accepted_when_flag_on(self, monkeypatch):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        token = _build_jwt_token(
            tenant_id=7, branch_id=3, table_id=42, session_id=99
        )
        claims = verify_table_token(token)

        assert claims == {
            "tenant_id": 7,
            "branch_id": 3,
            "table_id": 42,
            "session_id": 99,
        }

    def test_jwt_token_emits_no_deprecation_warning(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        token = _build_jwt_token()
        with caplog.at_level(logging.WARNING, logger="shared.security.auth"):
            verify_table_token(token)

        for rec in caplog.records:
            assert "DEPRECATED: legacy HMAC table token" not in rec.getMessage(), (
                "JWT token should NOT emit the HMAC deprecation warning."
            )

    def test_hmac_token_accepted_when_flag_on(self, monkeypatch):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        token = _build_legacy_hmac_token(
            tenant_id=2, branch_id=5, table_id=11, session_id=77
        )
        claims = verify_table_token(token)

        assert claims == {
            "tenant_id": 2,
            "branch_id": 5,
            "table_id": 11,
            "session_id": 77,
        }

    def test_hmac_token_emits_deprecation_warning(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        token = _build_legacy_hmac_token(
            tenant_id=2, branch_id=5, table_id=11, session_id=77
        )
        with caplog.at_level(logging.WARNING, logger="shared.security.auth"):
            verify_table_token(token)

        warning_records = [
            r for r in caplog.records
            if "DEPRECATED: legacy HMAC table token accepted" in r.getMessage()
        ]
        assert warning_records, (
            "Expected DEPRECATED warning when legacy HMAC token is accepted. "
            f"Got: {[r.getMessage() for r in caplog.records]}"
        )


# =============================================================================
# Flag = False: only JWT accepted
# =============================================================================


class TestLegacyFlagOffEnforcesJwtOnly:
    """`allow_legacy_table_tokens=False` rejects HMAC legacy tokens with 401."""

    def test_jwt_token_still_accepted_when_flag_off(self, monkeypatch):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", False)

        token = _build_jwt_token(
            tenant_id=4, branch_id=2, table_id=13, session_id=55
        )
        claims = verify_table_token(token)

        assert claims == {
            "tenant_id": 4,
            "branch_id": 2,
            "table_id": 13,
            "session_id": 55,
        }

    def test_hmac_token_rejected_when_flag_off(self, monkeypatch):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", False)

        token = _build_legacy_hmac_token()
        with pytest.raises(HTTPException) as exc_info:
            verify_table_token(token)

        assert exc_info.value.status_code == 401
        # Generic error — no fingerprinting of internal verifier choice.
        assert exc_info.value.detail == "Invalid table token"

    def test_hmac_rejection_logs_warning_without_token(self, monkeypatch, caplog):
        """Rejection path logs a warning without leaking the token contents."""
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", False)

        token = _build_legacy_hmac_token()
        with caplog.at_level(logging.WARNING, logger="shared.security.auth"):
            with pytest.raises(HTTPException):
                verify_table_token(token)

        rejected = [
            r for r in caplog.records
            if "Rejected legacy HMAC table token" in r.getMessage()
        ]
        assert rejected, "Expected rejection warning when flag is off."
        for rec in rejected:
            assert token not in rec.getMessage(), (
                "Token must NEVER appear in log messages."
            )


# =============================================================================
# Garbage tokens: always rejected
# =============================================================================


class TestInvalidTokensAlwaysRejected:
    """Tokens that match neither format raise 401 regardless of flag state."""

    @pytest.mark.parametrize("flag", [True, False])
    def test_completely_invalid_token_rejected(self, monkeypatch, flag):
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", flag)

        # Not a JWT (no dots) and not 6 colon-separated parts.
        with pytest.raises(HTTPException) as exc_info:
            verify_table_token("this-is-not-a-valid-token")

        assert exc_info.value.status_code == 401

    @pytest.mark.parametrize("flag", [True, False])
    def test_malformed_jwt_rejected_without_hmac_fallback(self, monkeypatch, flag):
        """
        A token with the JWT shape (2 dots) but invalid signature must raise 401
        directly — it must NOT fall through to the HMAC verifier even when the
        flag is on. This prevents an attacker from crafting a 6-colon HMAC payload
        and disguising it with dots/segments.
        """
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", flag)

        # Three segments separated by dots, but not a real JWT.
        with pytest.raises(HTTPException) as exc_info:
            verify_table_token("aaa.bbb.ccc")

        assert exc_info.value.status_code == 401

    def test_hmac_with_bad_signature_rejected_when_flag_on(self, monkeypatch):
        """Tampered HMAC signature → 401 even when flag is on."""
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        good = _build_legacy_hmac_token()
        # Flip the last char of the signature to break it
        tampered = good[:-1] + ("0" if good[-1] != "0" else "1")

        with pytest.raises(HTTPException) as exc_info:
            verify_table_token(tampered)

        assert exc_info.value.status_code == 401


# =============================================================================
# Production warning behaviour
# =============================================================================


class TestProductionWarning:
    """`validate_production_secrets` emits a non-blocking warning for the flag."""

    def _neutralize_other_prod_checks(self, monkeypatch):
        """Make every OTHER production check pass so we isolate this flag."""
        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "jwt_secret", "x" * 64)
        monkeypatch.setattr(settings, "table_token_secret", "x" * 64)
        monkeypatch.setattr(settings, "debug", False)
        monkeypatch.setattr(settings, "allowed_origins", "https://example.com")
        from cryptography.fernet import Fernet
        monkeypatch.setattr(
            settings, "totp_encryption_key", Fernet.generate_key().decode()
        )
        # Also keep the S1.2 flag off so its warning doesn't pollute caplog.
        monkeypatch.setattr(settings, "legacy_refresh_in_body", False)

    def test_flag_on_in_production_warns_but_does_not_block(
        self, monkeypatch, caplog
    ):
        self._neutralize_other_prod_checks(monkeypatch)
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", True)

        with caplog.at_level(logging.WARNING, logger="shared.config.settings"):
            errors = settings.validate_production_secrets()

        # MUST NOT fail-fast.
        assert not any("ALLOW_LEGACY_TABLE_TOKENS" in e for e in errors), (
            "allow_legacy_table_tokens must NOT be in the fail-fast errors list."
        )
        # MUST emit a warning.
        assert any(
            "ALLOW_LEGACY_TABLE_TOKENS=True in production" in rec.getMessage()
            for rec in caplog.records
        ), (
            "Expected production warning for allow_legacy_table_tokens=True. "
            f"Got: {[r.getMessage() for r in caplog.records]}"
        )

    def test_flag_off_in_production_does_not_warn(self, monkeypatch, caplog):
        self._neutralize_other_prod_checks(monkeypatch)
        monkeypatch.setattr(settings, "allow_legacy_table_tokens", False)

        with caplog.at_level(logging.WARNING, logger="shared.config.settings"):
            settings.validate_production_secrets()

        for rec in caplog.records:
            assert "ALLOW_LEGACY_TABLE_TOKENS=True in production" not in (
                rec.getMessage()
            )
