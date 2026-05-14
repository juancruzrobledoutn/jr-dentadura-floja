"""
S3.2 — Tests for expanded secrets validation.

Bug context (audit auditamayo12.md CRÍTICO #3):
- `jwt_secret` and `table_token_secret` shipped with FUNCTIONAL defaults
  ("dev-secret-change-me-in-production" / "table-token-secret-change-me"),
  so the application would happily sign real JWTs with them.
- `validate_production_secrets()` only ran when `environment == "production"`
  exactly. Deploying with `ENVIRONMENT=staging` / `prod` / typo'd / empty
  bypassed the check entirely.

These tests verify the new contract:
  1. Defaults are empty strings (no functional fallback).
  2. Protected environments (production, prod, staging) reject:
     - empty secrets
     - secrets shorter than 32 chars
     - known insecure default strings
  3. Dev-like environments (dev, development, test, local) auto-generate
     ephemeral secrets at construction time so existing dev workflows keep
     working without an explicit .env.
  4. The known-insecure-defaults helper exposes the exact list.
"""

from __future__ import annotations

import logging

import pytest
from cryptography.fernet import Fernet

from shared.config.settings import (
    Settings,
    _DEV_LIKE_ENVIRONMENTS,
    _KNOWN_INSECURE_DEFAULTS,
    _MIN_SECRET_LENGTH,
    _PROTECTED_ENVIRONMENTS,
)


# =============================================================================
# Helpers
# =============================================================================


def _prod_baseline(**overrides) -> dict:
    """
    Build the minimum dict needed for `Settings` to pass validation in
    production, then apply overrides for the field under test.
    """
    base = {
        "environment": "production",
        "debug": False,
        "jwt_secret": "j" * 64,
        "table_token_secret": "t" * 64,
        "allowed_origins": "https://app.example.com",
        "totp_encryption_key": Fernet.generate_key().decode(),
        # S3.1 — afip_environment must match production. Set explicitly so the
        # AFIP gate doesn't pollute our errors list.
        "afip_environment": "production",
        # S1.2 — silence the legacy_refresh_in_body warning (it's a log, not
        # an error, but keeps the test output clean).
        "legacy_refresh_in_body": False,
        # S1.3 — same rationale.
        "allow_legacy_table_tokens": False,
    }
    base.update(overrides)
    return base


# =============================================================================
# Defaults
# =============================================================================


class TestSecretDefaults:
    """The two symmetric secrets must default to empty strings (S3.2)."""

    def test_jwt_secret_default_is_empty_when_dev_skipped(self, monkeypatch):
        """
        Construct Settings with an environment that is NEITHER protected NOR
        dev-like (so the dev fallback does not fire). Default jwt_secret must
        be empty — confirming we removed the functional default.

        Note: we clear the JWT_SECRET / TABLE_TOKEN_SECRET env vars so a
        developer running tests with secrets in their shell env doesn't see a
        spurious failure here. The os.environ lookup is BaseSettings'
        responsibility; clearing it isolates the default-value check.
        """
        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("TABLE_TOKEN_SECRET", raising=False)
        s = Settings(environment="other")
        assert s.jwt_secret == ""

    def test_table_token_secret_default_is_empty_when_dev_skipped(self, monkeypatch):
        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("TABLE_TOKEN_SECRET", raising=False)
        s = Settings(environment="other")
        assert s.table_token_secret == ""


# =============================================================================
# Production / staging / prod — fail-fast
# =============================================================================


@pytest.mark.parametrize("env", sorted(_PROTECTED_ENVIRONMENTS))
class TestProtectedEnvironmentsValidate:
    """All three protected environments must apply the same strict checks."""

    def test_empty_secrets_emit_two_errors(self, env: str):
        """Empty jwt_secret + empty table_token_secret → 2 errors mentioning
        each variable name."""
        s = Settings(
            **_prod_baseline(
                environment=env,
                jwt_secret="",
                table_token_secret="",
            )
        )
        errors = s.validate_production_secrets()
        jwt_errs = [e for e in errors if "JWT_SECRET" in e]
        tbl_errs = [e for e in errors if "TABLE_TOKEN_SECRET" in e]
        assert len(jwt_errs) == 1, errors
        assert len(tbl_errs) == 1, errors
        assert "empty value is rejected" in jwt_errs[0]
        assert "empty value is rejected" in tbl_errs[0]

    def test_short_secrets_emit_two_errors(self, env: str):
        """< 32 chars → 2 errors that include the actual length to help the
        operator (so they don't have to guess by how much they were short)."""
        s = Settings(
            **_prod_baseline(
                environment=env,
                jwt_secret="too-short",   # 9 chars
                table_token_secret="x" * 31,
            )
        )
        errors = s.validate_production_secrets()
        jwt_errs = [e for e in errors if "JWT_SECRET" in e]
        tbl_errs = [e for e in errors if "TABLE_TOKEN_SECRET" in e]
        assert len(jwt_errs) == 1
        assert len(tbl_errs) == 1
        assert "at least 32 characters" in jwt_errs[0]
        assert "(got 9)" in jwt_errs[0]
        assert "(got 31)" in tbl_errs[0]

    def test_known_insecure_default_strings_emit_errors(self, env: str):
        """The exact strings that shipped as defaults must be rejected even if
        someone hard-codes them back in .env to silence the empty check."""
        s = Settings(
            **_prod_baseline(
                environment=env,
                jwt_secret="dev-secret-change-me-in-production",
                table_token_secret="table-token-secret-change-me",
            )
        )
        errors = s.validate_production_secrets()
        jwt_errs = [e for e in errors if "JWT_SECRET" in e]
        tbl_errs = [e for e in errors if "TABLE_TOKEN_SECRET" in e]
        assert len(jwt_errs) == 1
        assert len(tbl_errs) == 1
        assert "known insecure default value" in jwt_errs[0]
        assert "known insecure default value" in tbl_errs[0]

    def test_strong_random_secrets_pass_validation(self, env: str):
        """The happy path: 48-byte token_urlsafe values pass with zero errors
        from the symmetric-secret checks."""
        s = Settings(**_prod_baseline(environment=env))
        errors = s.validate_production_secrets()
        symmetric_errs = [
            e for e in errors
            if "JWT_SECRET" in e or "TABLE_TOKEN_SECRET" in e
        ]
        assert symmetric_errs == [], errors


class TestStagingNoLongerBypasses:
    """
    Specific regression test for the audit finding:
    `ENVIRONMENT=staging` previously bypassed validation entirely.
    """

    def test_staging_with_empty_jwt_secret_blocks_boot(self):
        s = Settings(
            **_prod_baseline(
                environment="staging",
                jwt_secret="",
                table_token_secret="t" * 64,
            )
        )
        errors = s.validate_production_secrets()
        assert any("JWT_SECRET" in e for e in errors), (
            f"S3.2 regression: staging with empty JWT_SECRET must fail. "
            f"errors={errors!r}"
        )

    def test_prod_short_form_with_weak_secret_blocks_boot(self):
        s = Settings(
            **_prod_baseline(
                environment="prod",
                jwt_secret="dev-secret-change-me-in-production",
            )
        )
        errors = s.validate_production_secrets()
        assert any("JWT_SECRET" in e for e in errors)


# =============================================================================
# Dev / test fallback
# =============================================================================


@pytest.mark.parametrize("env", sorted(_DEV_LIKE_ENVIRONMENTS))
class TestDevEphemeralFallback:
    """In dev-like envs, missing secrets must be auto-generated at construction
    time so existing workflows keep working without a `.env` file."""

    def test_missing_secrets_are_auto_generated(self, env: str, caplog, monkeypatch):
        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("TABLE_TOKEN_SECRET", raising=False)
        with caplog.at_level(logging.WARNING, logger="shared.config.settings"):
            s = Settings(
                environment=env,
                jwt_secret="",
                table_token_secret="",
            )
        # The validator must have populated both, with values that would pass
        # the production-grade length check (defence in depth).
        assert len(s.jwt_secret) >= _MIN_SECRET_LENGTH
        assert len(s.table_token_secret) >= _MIN_SECRET_LENGTH
        # They must be different (separate calls to token_urlsafe).
        assert s.jwt_secret != s.table_token_secret
        # And a WARNING must be logged so operators see what happened.
        assert any(
            "Generated ephemeral" in rec.message for rec in caplog.records
        ), [r.message for r in caplog.records]

    def test_explicit_secrets_are_not_overwritten(self, env: str):
        """When the operator provides values, the validator must leave them
        alone — even in dev. Otherwise tests using monkeypatch / explicit
        construction would be unpredictable."""
        s = Settings(
            environment=env,
            jwt_secret="explicit-dev-secret-" + "x" * 40,
            table_token_secret="explicit-table-" + "y" * 40,
        )
        assert s.jwt_secret == "explicit-dev-secret-" + "x" * 40
        assert s.table_token_secret == "explicit-table-" + "y" * 40

    def test_validate_production_secrets_returns_empty_in_dev(
        self, env: str, monkeypatch,
    ):
        """Belt-and-braces: even after auto-generation, calling the validator
        in a dev-like env must produce zero errors (it short-circuits on
        `is_protected`)."""
        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("TABLE_TOKEN_SECRET", raising=False)
        s = Settings(environment=env)
        errors = s.validate_production_secrets()
        symmetric_errs = [
            e for e in errors
            if "JWT_SECRET" in e or "TABLE_TOKEN_SECRET" in e
        ]
        assert symmetric_errs == []


# =============================================================================
# Helper exposure
# =============================================================================


class TestKnownInsecureDefaults:
    """The `_known_insecure_defaults` classmethod is part of the public S3.2
    contract: callers (tests, audit scripts) need a stable way to enumerate
    the rejected strings."""

    def test_returns_frozenset_with_known_strings(self):
        defaults = Settings._known_insecure_defaults()
        assert isinstance(defaults, frozenset)
        # Must include the two original defaults from the audit.
        assert "dev-secret-change-me-in-production" in defaults
        assert "table-token-secret-change-me" in defaults
        # Must include the empty string (covers the new default).
        assert "" in defaults
        # And common placeholders we want to block.
        assert "changeme" in defaults
        assert "secret" in defaults

    def test_matches_module_level_constant(self):
        """The method must return the module-level frozenset verbatim so we
        don't drift between the two surfaces."""
        assert Settings._known_insecure_defaults() == _KNOWN_INSECURE_DEFAULTS
