"""
Outbox sweeper — rescues events stuck in PROCESSING state (S2.B).

OUTBOX-PATTERN bug fix:
The main `outbox_processor._process_batch` marks events as PROCESSING and commits
BEFORE publishing to Redis (see `outbox_processor.py:130`). If the process dies
between the commit and the publish (OOM kill, SIGTERM during deploy, hard crash),
the event stays in PROCESSING forever and never reaches Redis.

For financial/critical events (CHECK_REQUESTED, PAYMENT_APPROVED, CHECK_PAID,
ROUND_SUBMITTED) this causes "ghost tables" — payment is approved but the frontend
never receives the notification.

The sweeper runs periodically and reverts long-stuck PROCESSING events back to
PENDING so the main processor retries them. Events that have already exceeded the
maximum retry count are NOT rescued (they're treated as DLQ candidates and should
be inspected manually or escalated to the FAILED state by the processor).

Definition of a "zombie":
- `status = PROCESSING`
- `created_at < now() - INTERVAL '60 seconds'` (event has been around long enough
  that any healthy processor would have finished or moved it to PENDING/FAILED)
- `processed_at IS NULL` (not yet completed)
- `retry_count < MAX_RETRY_COUNT` (don't rescue events that have already failed
  many times — those are likely broken, not transient)

Note on the timing anchor:
The OutboxEvent model has no `updated_at` column (only `created_at` and
`processed_at`). PROCESSING is intended to be very short-lived (a single publish
call to Redis, normally <100ms). If `created_at + 60s < now()` and the event is
still PROCESSING with `processed_at IS NULL`, it's safe to assume the processor
died and we should rescue it. Worst case: a legitimate slow event is reset to
PENDING and retried — the publishers are designed to be idempotent (status-keyed
in the processor and at-most-once via Redis Streams).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from shared.config.logging import get_logger
from shared.infrastructure.db import SessionLocal
from rest_api.models import OutboxEvent, OutboxStatus

logger = get_logger(__name__)

# How often the sweeper wakes up.
SWEEP_INTERVAL_SECONDS = 30

# How long an event must have been PROCESSING before we consider it a zombie.
# PROCESSING is supposed to take <1s in a healthy system; 60s is conservative.
ZOMBIE_THRESHOLD_SECONDS = 60

# Events with retry_count >= this are NOT rescued — they're probably broken and
# should be inspected manually (DLQ candidates).
# Kept consistent with `outbox_processor.MAX_RETRIES`.
MAX_RETRY_COUNT = 5


def _sweep_once() -> int:
    """
    Sweep zombies once. Returns the count of events rescued.

    Synchronous (uses a sync DB session). Intended to be wrapped with
    `asyncio.to_thread` from the async loop.
    """
    threshold = datetime.now(timezone.utc) - timedelta(seconds=ZOMBIE_THRESHOLD_SECONDS)
    db = SessionLocal()
    try:
        # `with_for_update(skip_locked=True)` avoids contention with the main
        # processor: if the processor is currently holding a lock on a row
        # (i.e. legitimately working on it), we skip it.
        zombies = db.execute(
            select(OutboxEvent)
            .where(
                OutboxEvent.status == OutboxStatus.PROCESSING,
                OutboxEvent.created_at < threshold,
                OutboxEvent.processed_at.is_(None),
                OutboxEvent.retry_count < MAX_RETRY_COUNT,
            )
            .with_for_update(skip_locked=True)
        ).scalars().all()

        if not zombies:
            return 0

        count = 0
        for event in zombies:
            event.status = OutboxStatus.PENDING
            event.retry_count = (event.retry_count or 0) + 1
            event.last_error = (
                f"Stuck in PROCESSING for > {ZOMBIE_THRESHOLD_SECONDS}s; "
                "reverted to PENDING by sweeper"
            )
            count += 1

        db.commit()
        logger.warning(
            "Outbox sweeper rescued zombies",
            count=count,
            threshold_seconds=ZOMBIE_THRESHOLD_SECONDS,
        )
        return count
    except Exception as e:
        db.rollback()
        logger.error("Outbox sweeper failed", error=str(e))
        return 0
    finally:
        db.close()


async def sweeper_loop() -> None:
    """
    Run the sweeper forever until cancelled.

    Wrapped with `asyncio.to_thread` so the synchronous DB call doesn't block
    the FastAPI event loop.
    """
    logger.info(
        "Outbox sweeper started",
        interval_seconds=SWEEP_INTERVAL_SECONDS,
        threshold_seconds=ZOMBIE_THRESHOLD_SECONDS,
        max_retry_count=MAX_RETRY_COUNT,
    )
    try:
        while True:
            try:
                await asyncio.to_thread(_sweep_once)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # _sweep_once already logs internally; this is a defence-in-depth
                # catch so a single bad iteration doesn't kill the loop.
                logger.error("Outbox sweeper iteration failed", error=str(e))
            await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("Outbox sweeper cancelled")
        raise


# Module-level handle so lifespan shutdown can cancel the task cleanly.
_sweeper_task: asyncio.Task | None = None


async def start_outbox_sweeper() -> None:
    """Start the sweeper background task (call from FastAPI lifespan startup)."""
    global _sweeper_task
    if _sweeper_task is not None and not _sweeper_task.done():
        logger.warning("Outbox sweeper already running")
        return
    _sweeper_task = asyncio.create_task(sweeper_loop(), name="outbox-sweeper")


async def stop_outbox_sweeper() -> None:
    """Cancel the sweeper background task gracefully (call from lifespan shutdown)."""
    global _sweeper_task
    if _sweeper_task is None:
        return
    _sweeper_task.cancel()
    try:
        await _sweeper_task
    except asyncio.CancelledError:
        pass
    _sweeper_task = None
    logger.info("Outbox sweeper stopped")
