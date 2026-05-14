"""
Tests for WebhookRetryQueue (rest_api/services/payments/webhook_retry.py).

S3.3: Verifies enqueue/process behavior, exponential backoff, dead-letter
handling and handler dispatch — all with a fake in-memory Redis client.
"""

import json
import time
from unittest.mock import AsyncMock, patch

import pytest

from rest_api.services.payments.webhook_retry import (
    WebhookRetryQueue,
    WebhookRetryItem,
)


# =============================================================================
# Fake Redis client (minimal subset used by WebhookRetryQueue)
# =============================================================================


class FakeRedis:
    """In-memory async stub for redis methods used by WebhookRetryQueue."""

    def __init__(self):
        self.hashes: dict[str, dict[str, str]] = {}
        self.zsets: dict[str, dict[str, float]] = {}
        self.lists: dict[str, list[str]] = {}

    async def hset(self, key, mapping=None, **_):
        self.hashes.setdefault(key, {}).update(mapping or {})

    async def hget(self, key, field):
        return self.hashes.get(key, {}).get(field)

    async def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    async def zadd(self, key, mapping):
        self.zsets.setdefault(key, {}).update(mapping)

    async def zrangebyscore(self, key, min, max, start=0, num=None):
        zset = self.zsets.get(key, {})
        ordered = sorted(
            (m for m, s in zset.items() if min <= s <= max),
            key=lambda m: zset[m],
        )
        if num is not None:
            ordered = ordered[start:start + num]
        return ordered

    async def zrem(self, key, member):
        self.zsets.get(key, {}).pop(member, None)

    async def zcard(self, key):
        return len(self.zsets.get(key, {}))

    async def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, value)

    async def llen(self, key):
        return len(self.lists.get(key, []))

    async def ltrim(self, key, start, stop):
        if key in self.lists:
            self.lists[key] = self.lists[key][start:stop + 1]

    async def delete(self, key):
        self.hashes.pop(key, None)


@pytest.fixture
def fake_redis():
    """A fresh fake Redis for each test."""
    return FakeRedis()


@pytest.fixture
def patched_redis(fake_redis):
    """Patch get_redis_pool inside webhook_retry to return our fake Redis."""
    with patch(
        "rest_api.services.payments.webhook_retry.get_redis_pool",
        new=AsyncMock(return_value=fake_redis),
    ):
        yield fake_redis


# =============================================================================
# Enqueue / backoff
# =============================================================================


class TestEnqueue:
    async def test_enqueue_creates_item_in_pending(self, patched_redis):
        """A new failure is stored as a hash + sorted set entry."""
        queue = WebhookRetryQueue()
        item_id = await queue.enqueue(
            webhook_type="mercadopago",
            payload={"data": {"id": "p-1"}},
            error="timeout",
        )

        assert item_id.startswith("mercadopago:")
        # Pending set should have one entry
        assert await queue.get_pending_count() == 1
        # Hash should contain the payload
        hash_key = f"{WebhookRetryQueue.ITEM_PREFIX}{item_id}"
        stored = patched_redis.hashes[hash_key]
        assert stored["webhook_type"] == "mercadopago"
        assert json.loads(stored["payload"]) == {"data": {"id": "p-1"}}
        assert stored["attempt"] == "1"

    async def test_enqueue_uses_exponential_backoff(self, patched_redis):
        """Successive attempts double the delay (base * 2^attempt)."""
        queue = WebhookRetryQueue()
        item_id = await queue.enqueue(
            webhook_type="mp",
            payload={"x": 1},
            error="boom",
            attempt=0,
        )

        # attempt=0 (1st failure): delay = 10 * 2^0 = 10s
        # next_retry_at ~ now + 10
        first_score = patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id]
        approx_delta = first_score - time.time()
        assert 5 < approx_delta < 15  # 10s +/- tolerance

        # Re-enqueue with attempt=2: delay = 10 * 4 = 40s
        await queue.enqueue(
            webhook_type="mp",
            payload={"x": 1},
            error="boom",
            attempt=2,
            item_id=item_id,
        )
        second_score = patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id]
        delta = second_score - time.time()
        assert 30 < delta < 50

    async def test_enqueue_respects_max_delay(self, patched_redis):
        """Backoff is capped at MAX_DELAY_SECONDS."""
        queue = WebhookRetryQueue()
        # attempt=20 would otherwise be huge — should clamp to MAX_DELAY (3600s)
        item_id = await queue.enqueue(
            webhook_type="mp",
            payload={"x": 1},
            error="boom",
            attempt=20,
        )
        score = patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id]
        delta = score - time.time()
        assert delta <= WebhookRetryQueue.MAX_DELAY_SECONDS + 5


# =============================================================================
# Process retries
# =============================================================================


class TestProcessRetries:
    async def test_processes_due_item_and_removes_on_success(self, patched_redis):
        """A successful handler removes the item from the queue."""
        queue = WebhookRetryQueue()
        handler = AsyncMock(return_value=True)
        queue.register_handler("mercadopago", handler)

        item_id = await queue.enqueue(
            webhook_type="mercadopago",
            payload={"key": "value"},
            error="x",
        )
        # Force the item to be due NOW
        patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id] = time.time() - 1

        processed = await queue.process_retries(batch_size=10)

        assert processed == 1
        handler.assert_awaited_once_with({"key": "value"})
        # Item removed from pending and storage
        assert await queue.get_pending_count() == 0

    async def test_handler_returning_false_reenqueues_with_backoff(self, patched_redis):
        """If a handler returns False, the item is rescheduled (not removed)."""
        queue = WebhookRetryQueue()
        handler = AsyncMock(return_value=False)
        queue.register_handler("mp", handler)

        item_id = await queue.enqueue(
            webhook_type="mp",
            payload={"x": 1},
            error="initial",
            attempt=0,
        )
        # Make it due
        patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id] = time.time() - 1

        await queue.process_retries(batch_size=10)

        # Still in pending (rescheduled, attempt counter bumped)
        assert await queue.get_pending_count() == 1
        # Confirm the stored attempt incremented
        hash_key = f"{WebhookRetryQueue.ITEM_PREFIX}{item_id}"
        attempt = int(patched_redis.hashes[hash_key]["attempt"])
        assert attempt >= 2

    async def test_no_handler_moves_to_dead_letter(self, patched_redis):
        """An item with no registered handler should go straight to DLQ."""
        queue = WebhookRetryQueue()
        # No handler registered for "unknown_type"

        item_id = await queue.enqueue(
            webhook_type="unknown_type",
            payload={"x": 1},
            error="nope",
        )
        patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id] = time.time() - 1

        await queue.process_retries(batch_size=10)

        # Pending cleared
        assert await queue.get_pending_count() == 0
        # DLQ has one entry
        assert await queue.get_dead_letter_count() == 1

    async def test_max_attempts_exceeded_moves_to_dead_letter(self, patched_redis):
        """Once attempt >= max_attempts, item moves to dead letter on next failure."""
        queue = WebhookRetryQueue()
        handler = AsyncMock(return_value=False)
        queue.register_handler("mp", handler)

        # First enqueue (attempt 0 -> stored attempt = 1)
        item_id = await queue.enqueue(
            webhook_type="mp",
            payload={"x": 1},
            error="initial",
            attempt=0,
        )

        # Manually bump attempt to MAX_ATTEMPTS to short-circuit the failure path
        hash_key = f"{WebhookRetryQueue.ITEM_PREFIX}{item_id}"
        patched_redis.hashes[hash_key]["attempt"] = str(WebhookRetryQueue.MAX_ATTEMPTS)
        patched_redis.zsets[WebhookRetryQueue.PENDING_KEY][item_id] = time.time() - 1

        await queue.process_retries(batch_size=10)

        assert await queue.get_pending_count() == 0
        assert await queue.get_dead_letter_count() == 1


class TestQueueStats:
    async def test_get_stats_returns_handler_names(self, patched_redis):
        queue = WebhookRetryQueue()
        queue.register_handler("mp", AsyncMock(return_value=True))
        queue.register_handler("stripe", AsyncMock(return_value=True))

        stats = await queue.get_stats()
        assert stats["pending_count"] == 0
        assert stats["dead_letter_count"] == 0
        assert set(stats["registered_handlers"]) == {"mp", "stripe"}


# =============================================================================
# WebhookRetryItem dataclass
# =============================================================================


class TestWebhookRetryItem:
    def test_dataclass_default_max_attempts(self):
        item = WebhookRetryItem(
            id="x",
            webhook_type="mp",
            payload={},
            error="",
            attempt=0,
            created_at=0.0,
            next_retry_at=0.0,
        )
        assert item.max_attempts == 5
