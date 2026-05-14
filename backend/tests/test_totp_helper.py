"""Tests for TOTP dual-read helper (S1.1.B).

Covers the dual-read logic, lazy migration, pending-setup handling, and the
write/clear helpers. The User and Session are mocked so we don't need DB
infrastructure — the helper logic only touches user attributes and
db.commit/db.rollback.
"""
from unittest.mock import MagicMock

import pytest
from cryptography.fernet import Fernet

from rest_api.services.auth.totp_helper import (
    PENDING_PREFIX,
    clear_totp_secret,
    get_pending_setup_secret,
    get_totp_secret,
    is_2fa_enabled,
    is_2fa_pending,
    set_new_totp_secret,
    set_pending_setup_secret,
)
from shared.config.settings import settings
from shared.security.encryption import (
    decrypt_totp_secret,
    encrypt_totp_secret,
    reset_fernet_cache,
)


SECRET = "JBSWY3DPEHPK3PXP"  # canonical TOTP base32 example


@pytest.fixture(autouse=True)
def setup_encryption_key(monkeypatch):
    """Inject a fresh Fernet key for each test and reset the cached instance."""
    test_key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "totp_encryption_key", test_key)
    reset_fernet_cache()
    yield
    reset_fernet_cache()


def _make_user(*, totp_secret=None, totp_secret_encrypted=None, user_id=42):
    """Build a User-like mock with the two TOTP columns and an id."""
    user = MagicMock(spec=["id", "totp_secret", "totp_secret_encrypted"])
    user.id = user_id
    user.totp_secret = totp_secret
    user.totp_secret_encrypted = totp_secret_encrypted
    return user


def _make_db():
    """Build a Session-like mock that records commits/rollbacks."""
    db = MagicMock()
    db.commit = MagicMock()
    db.rollback = MagicMock()
    return db


# ---------------------------------------------------------------------------
# get_totp_secret
# ---------------------------------------------------------------------------


def test_get_totp_secret_prefers_encrypted_column():
    """If the encrypted column is populated, decrypt it and return the plain."""
    encrypted = encrypt_totp_secret(SECRET)
    user = _make_user(totp_secret="legacy-should-be-ignored", totp_secret_encrypted=encrypted)
    db = _make_db()

    result = get_totp_secret(user, db)

    assert result == SECRET
    # No lazy migration happens when encrypted already exists.
    db.commit.assert_not_called()


def test_get_totp_secret_lazy_migrates_legacy_plain():
    """A user with only the plain column gets the encrypted column populated."""
    user = _make_user(totp_secret=SECRET, totp_secret_encrypted=None)
    db = _make_db()

    result = get_totp_secret(user, db)

    assert result == SECRET
    # Encrypted column was set with a valid Fernet token that decrypts back to SECRET.
    assert user.totp_secret_encrypted is not None
    assert user.totp_secret_encrypted != SECRET
    assert decrypt_totp_secret(user.totp_secret_encrypted) == SECRET
    db.commit.assert_called_once()
    db.rollback.assert_not_called()


def test_get_totp_secret_lazy_migration_failure_still_returns_plain():
    """If lazy-migration commit fails, login MUST keep working (return plain, log + rollback)."""
    user = _make_user(totp_secret=SECRET, totp_secret_encrypted=None)
    db = _make_db()
    db.commit.side_effect = RuntimeError("DB write failed")

    result = get_totp_secret(user, db)

    # Login keeps working even when migration commit fails.
    assert result == SECRET
    db.rollback.assert_called_once()


def test_get_totp_secret_ignores_pending_setup():
    """A pending-setup row (prefix) MUST NOT be returned by get_totp_secret."""
    user = _make_user(totp_secret=f"{PENDING_PREFIX}{SECRET}", totp_secret_encrypted=None)
    db = _make_db()

    with pytest.raises(ValueError):
        get_totp_secret(user, db)
    # No commit attempted for pending rows.
    db.commit.assert_not_called()


def test_get_totp_secret_raises_when_no_secret():
    """User with both columns NULL raises ValueError."""
    user = _make_user(totp_secret=None, totp_secret_encrypted=None)
    db = _make_db()

    with pytest.raises(ValueError):
        get_totp_secret(user, db)


# ---------------------------------------------------------------------------
# set_new_totp_secret
# ---------------------------------------------------------------------------


def test_set_new_totp_secret_writes_encrypted_only():
    """New secrets go ONLY to the encrypted column; plain is nulled."""
    user = _make_user(totp_secret=f"{PENDING_PREFIX}{SECRET}", totp_secret_encrypted=None)
    db = _make_db()

    set_new_totp_secret(user, SECRET, db)

    assert user.totp_secret is None
    assert user.totp_secret_encrypted is not None
    assert decrypt_totp_secret(user.totp_secret_encrypted) == SECRET
    # Helper does NOT commit — caller is responsible.
    db.commit.assert_not_called()


# ---------------------------------------------------------------------------
# clear_totp_secret
# ---------------------------------------------------------------------------


def test_clear_totp_secret_nulls_both_columns():
    """Disable flow must wipe both legacy and encrypted columns."""
    encrypted = encrypt_totp_secret(SECRET)
    user = _make_user(totp_secret=SECRET, totp_secret_encrypted=encrypted)

    clear_totp_secret(user)

    assert user.totp_secret is None
    assert user.totp_secret_encrypted is None


# ---------------------------------------------------------------------------
# Pending-setup helpers
# ---------------------------------------------------------------------------


def test_set_and_get_pending_setup_secret_roundtrip():
    """set_pending_setup_secret stores with the prefix; get_pending_setup_secret strips it."""
    user = _make_user()
    set_pending_setup_secret(user, SECRET)

    assert user.totp_secret == f"{PENDING_PREFIX}{SECRET}"
    assert get_pending_setup_secret(user) == SECRET
    assert is_2fa_pending(user) is True


def test_get_pending_setup_secret_returns_none_when_not_pending():
    """No pending secret on a user with only an active (non-prefixed) plain row."""
    user = _make_user(totp_secret=SECRET)
    assert get_pending_setup_secret(user) is None
    assert is_2fa_pending(user) is False


# ---------------------------------------------------------------------------
# is_2fa_enabled — covers all state-machine combinations
# ---------------------------------------------------------------------------


def test_is_2fa_enabled_true_when_encrypted_present():
    user = _make_user(totp_secret=None, totp_secret_encrypted="ciphertext")
    assert is_2fa_enabled(user) is True


def test_is_2fa_enabled_true_when_legacy_plain_present():
    user = _make_user(totp_secret=SECRET)
    assert is_2fa_enabled(user) is True


def test_is_2fa_enabled_false_when_only_pending():
    """A pending-setup secret must NOT count as enabled."""
    user = _make_user(totp_secret=f"{PENDING_PREFIX}{SECRET}")
    assert is_2fa_enabled(user) is False


def test_is_2fa_enabled_false_when_both_null():
    user = _make_user()
    assert is_2fa_enabled(user) is False
