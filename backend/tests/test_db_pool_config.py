"""
S2.E — Tests for database pool configuration.

Verifies the pool sizing constants resolve correctly from environment variables
and that defaults match the documented 25/25 sizing for 100 concurrent users.

The engine itself is created at import time using `DATABASE_URL` from settings,
so we test the module-level constants (POOL_SIZE, MAX_OVERFLOW, ...) and the
resulting engine attributes by reloading the module under different env values.
"""

import importlib
import os
from unittest.mock import patch

import pytest


@pytest.fixture
def reload_db_module():
    """
    Reload shared.infrastructure.db so it re-reads environment variables.

    The engine is built at module import, so any os.environ override has to
    happen BEFORE reload(). We yield the freshly reloaded module and restore
    the original state on teardown so other tests are unaffected.
    """
    from shared.infrastructure import db as db_module

    original = db_module
    yield importlib.reload(db_module)
    # Restore: reload once more with the test env vars cleared.
    importlib.reload(original)


def test_default_pool_sizing(reload_db_module):
    """Defaults should match the documented 25/25 sizing for 100 concurrent users."""
    # Ensure no override is set so we get defaults.
    for key in ("DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_TIMEOUT", "DB_POOL_RECYCLE"):
        os.environ.pop(key, None)

    db = importlib.reload(reload_db_module)

    assert db.POOL_SIZE == 25, "Default DB_POOL_SIZE should be 25 (S2.E)"
    assert db.MAX_OVERFLOW == 25, "Default DB_MAX_OVERFLOW should be 25 (S2.E)"
    assert db.POOL_TIMEOUT == 30, "Default DB_POOL_TIMEOUT should be 30 seconds"
    assert db.POOL_RECYCLE == 1800, "Default DB_POOL_RECYCLE should be 1800 seconds (30 min)"


def test_pool_size_override_via_env(reload_db_module):
    """DB_POOL_SIZE env var should override the default."""
    with patch.dict(os.environ, {"DB_POOL_SIZE": "10"}):
        db = importlib.reload(reload_db_module)
        assert db.POOL_SIZE == 10


def test_max_overflow_override_via_env(reload_db_module):
    """DB_MAX_OVERFLOW env var should override the default."""
    with patch.dict(os.environ, {"DB_MAX_OVERFLOW": "5"}):
        db = importlib.reload(reload_db_module)
        assert db.MAX_OVERFLOW == 5


def test_pool_timeout_override_via_env(reload_db_module):
    """DB_POOL_TIMEOUT env var should override the default."""
    with patch.dict(os.environ, {"DB_POOL_TIMEOUT": "15"}):
        db = importlib.reload(reload_db_module)
        assert db.POOL_TIMEOUT == 15


def test_pool_recycle_override_via_env(reload_db_module):
    """DB_POOL_RECYCLE env var should override the default."""
    with patch.dict(os.environ, {"DB_POOL_RECYCLE": "900"}):
        db = importlib.reload(reload_db_module)
        assert db.POOL_RECYCLE == 900


def test_engine_uses_configured_pool_size(reload_db_module):
    """The SQLAlchemy engine should reflect the configured pool_size."""
    with patch.dict(os.environ, {"DB_POOL_SIZE": "12", "DB_MAX_OVERFLOW": "8"}):
        db = importlib.reload(reload_db_module)
        # Note: QueuePool.size() returns the configured pool_size.
        assert db.engine.pool.size() == 12


def test_pool_pre_ping_enabled(reload_db_module):
    """pool_pre_ping must be True to detect stale connections (S2.E requirement)."""
    db = importlib.reload(reload_db_module)
    # SQLAlchemy stores this on the dialect's pool. Public-ish accessor.
    assert db.engine.pool._pre_ping is True, (
        "pool_pre_ping must be True so stale connections are caught before use"
    )


def test_session_local_uses_configured_engine(reload_db_module):
    """SessionLocal must bind to the same engine that holds the configured pool."""
    db = importlib.reload(reload_db_module)
    assert db.SessionLocal.kw["bind"] is db.engine
