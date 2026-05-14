"""
Database configuration and session management.
Uses SQLAlchemy 2.0 async-compatible patterns.
"""

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from shared.config.settings import DATABASE_URL

import os


# S2.E — Pool sizing for 100 concurrent users.
# The previous formula (cores*2+1, capped at 20) gave only 9 base connections on a
# 4-core dev host, with max_overflow=15 → 24 max per instance. Under load
# (submit_round + cart sync + admin + outbox processor sharing the pool) this caused
# pool_timeout=30s → cascade of 500/503.
#
# New defaults: 25 base + 25 overflow = 50 max per backend instance.
# With 2 backend replicas (prod overlay): 100 max DB connections from backends.
# Postgres prod overlay sets max_connections=200 (see devOps/docker-compose.prod.yml),
# leaving margin for pgAdmin, monitoring exporters, and ad-hoc queries.
# Dev (1 instance) → 50 max ≤ Postgres default 100.
#
# All values are env-configurable so prod can tune without re-deploy.
DEFAULT_POOL_SIZE = 25
DEFAULT_MAX_OVERFLOW = 25
DEFAULT_POOL_TIMEOUT = 30  # seconds — how long a request waits for a free connection
DEFAULT_POOL_RECYCLE = 1800  # 30 min — rotate to handle network blips / NAT timeouts

POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", DEFAULT_POOL_SIZE))
MAX_OVERFLOW = int(os.environ.get("DB_MAX_OVERFLOW", DEFAULT_MAX_OVERFLOW))
POOL_TIMEOUT = int(os.environ.get("DB_POOL_TIMEOUT", DEFAULT_POOL_TIMEOUT))
POOL_RECYCLE = int(os.environ.get("DB_POOL_RECYCLE", DEFAULT_POOL_RECYCLE))


# Create engine with connection pooling and timeouts
# BACK-HIGH-01: Added timeout and pool settings for production reliability
# S2.E: Pool sized for 100 concurrent users (was cores*2+1 → 9, capped at 20).
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using (catches stale conns)
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    connect_args={"connect_timeout": 10},  # Connection establishment timeout
    echo=False,  # Set to True for SQL logging in development
)

# Session factory
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency for database sessions.

    Usage:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()

    The session is automatically closed after the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions outside of FastAPI.

    Usage:
        with get_db_context() as db:
            db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def safe_commit(db: Session) -> None:
    """
    HIGH-01 FIX: Safe commit with automatic rollback on failure.

    Usage:
        from shared.db import safe_commit
        safe_commit(db)

    Raises the original exception after rolling back.
    """
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
