"""
Tests for the outbox sweeper (S2.B).

The sweeper rescues events stuck in PROCESSING state by reverting them to
PENDING so the main outbox processor retries them.

Tests use the project's standard `db_session` fixture (SQLite in-memory).
Because the sweeper opens its own `SessionLocal()` internally, we patch
`SessionLocal` in `outbox_sweeper` to return the test session so reads/writes
hit the same in-memory database.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from rest_api.models import OutboxEvent, OutboxStatus
from rest_api.services.events.outbox_sweeper import (
    MAX_RETRY_COUNT,
    ZOMBIE_THRESHOLD_SECONDS,
    _sweep_once,
)


def _make_event(
    db,
    *,
    status: OutboxStatus,
    created_at: datetime,
    retry_count: int = 0,
    processed_at: datetime | None = None,
    tenant_id: int = 1,
    event_type: str = "TEST",
    aggregate_type: str = "test",
    aggregate_id: int = 1,
) -> OutboxEvent:
    """Create + commit an OutboxEvent for testing."""
    event = OutboxEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=json.dumps({"branch_id": 1, "session_id": 1}),
        status=status,
        retry_count=retry_count,
        created_at=created_at,
        processed_at=processed_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@pytest.fixture
def patched_session(db_session):
    """
    Patch the sweeper's `SessionLocal` so it uses the in-memory test DB.

    The fixture yields the underlying db_session for direct assertions.
    """
    # The sweeper calls `SessionLocal()` to open its own session. We return
    # a callable that hands back the test session but ignores .close() so the
    # outer fixture can still tear it down.
    class _SessionFactory:
        def __call__(self):
            class _SessionProxy:
                def __init__(self, real):
                    self._real = real

                def execute(self, *a, **kw):
                    return self._real.execute(*a, **kw)

                def commit(self):
                    return self._real.commit()

                def rollback(self):
                    return self._real.rollback()

                def close(self):
                    # No-op: outer fixture owns the session lifecycle.
                    return None

            return _SessionProxy(db_session)

    with patch(
        "rest_api.services.events.outbox_sweeper.SessionLocal",
        new=_SessionFactory(),
    ):
        yield db_session


def test_no_events_no_action(patched_session):
    """If the table is empty, sweep does nothing."""
    count = _sweep_once()
    assert count == 0


def test_rescues_zombie(patched_session):
    """An event in PROCESSING with created_at > threshold is reverted to PENDING."""
    old = datetime.now(timezone.utc) - timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS + 60)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PROCESSING,
        created_at=old,
        retry_count=0,
    )

    count = _sweep_once()

    assert count == 1
    patched_session.refresh(event)
    assert event.status == OutboxStatus.PENDING
    assert event.retry_count == 1
    assert event.last_error is not None
    assert "PROCESSING" in event.last_error


def test_recent_processing_not_swept(patched_session):
    """An event PROCESSING for less than the threshold is NOT touched."""
    recent = datetime.now(timezone.utc) - timedelta(seconds=10)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PROCESSING,
        created_at=recent,
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    # Still PROCESSING — the legitimate processor is presumably working on it.
    assert event.status == OutboxStatus.PROCESSING
    assert event.retry_count == 0


def test_max_retry_not_rescued(patched_session):
    """Events that have already exhausted retries are NOT rescued (DLQ candidates)."""
    old = datetime.now(timezone.utc) - timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS + 60)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PROCESSING,
        created_at=old,
        retry_count=MAX_RETRY_COUNT,
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    assert event.status == OutboxStatus.PROCESSING


def test_published_events_not_swept(patched_session):
    """PUBLISHED events are never touched regardless of timing."""
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    processed = datetime.now(timezone.utc) - timedelta(hours=2)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PUBLISHED,
        created_at=old,
        processed_at=processed,
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    assert event.status == OutboxStatus.PUBLISHED


def test_failed_events_not_swept(patched_session):
    """FAILED events are never touched by the sweeper (only the processor moves them)."""
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    event = _make_event(
        patched_session,
        status=OutboxStatus.FAILED,
        created_at=old,
        retry_count=MAX_RETRY_COUNT,
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    assert event.status == OutboxStatus.FAILED


def test_pending_events_not_swept(patched_session):
    """PENDING events are not in the sweeper's scope; the processor handles them."""
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PENDING,
        created_at=old,
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    assert event.status == OutboxStatus.PENDING
    assert event.retry_count == 0


def test_processed_at_set_means_not_zombie(patched_session):
    """If processed_at is set, the event is NOT a zombie even if status is PROCESSING."""
    # This shouldn't happen in practice but the sweeper must be defensive.
    old = datetime.now(timezone.utc) - timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS + 60)
    event = _make_event(
        patched_session,
        status=OutboxStatus.PROCESSING,
        created_at=old,
        processed_at=datetime.now(timezone.utc),
    )

    count = _sweep_once()

    assert count == 0
    patched_session.refresh(event)
    assert event.status == OutboxStatus.PROCESSING


def test_rescues_multiple_zombies(patched_session):
    """The sweeper rescues all zombies in a single sweep."""
    old = datetime.now(timezone.utc) - timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS + 60)
    events = [
        _make_event(
            patched_session,
            status=OutboxStatus.PROCESSING,
            created_at=old,
            aggregate_id=i,
        )
        for i in range(3)
    ]

    count = _sweep_once()

    assert count == 3
    for event in events:
        patched_session.refresh(event)
        assert event.status == OutboxStatus.PENDING
        assert event.retry_count == 1
