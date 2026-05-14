"""
Event Catch-up Storage for WebSocket Reconnection.

Stores recent events in Redis sorted sets per branch so that clients
can retrieve missed events after a brief disconnection (e.g., WiFi drop).

Events are stored with their timestamp as score, trimmed to a max count,
and expire after 5 minutes (stale events are not useful for catch-up).
"""

from __future__ import annotations

import json
import time

import redis.asyncio as redis

from shared.config.logging import get_logger

logger = get_logger(__name__)

# Configuration
CATCHUP_MAX_EVENTS = 100
CATCHUP_TTL_SECONDS = 300  # 5 minutes


def _catchup_key(branch_id: int) -> str:
    """Redis key for branch catch-up sorted set."""
    return f"catchup:branch:{branch_id}"


async def store_event_for_catchup(
    redis_client: redis.Redis,
    branch_id: int,
    event: dict,
    max_events: int = CATCHUP_MAX_EVENTS,
) -> None:
    """
    Store event in Redis sorted set for catch-up on reconnect.

    Args:
        redis_client: Async Redis client.
        branch_id: Branch ID to scope the catch-up buffer.
        event: Event dict to store.
        max_events: Maximum events to retain per branch.
    """
    key = _catchup_key(branch_id)
    timestamp = time.time()

    try:
        # Add event with timestamp as score
        await redis_client.zadd(key, {json.dumps(event, ensure_ascii=False): timestamp})
        # Trim to keep only last max_events (remove oldest)
        await redis_client.zremrangebyrank(key, 0, -(max_events + 1))
        # Set TTL so stale buffers auto-expire
        await redis_client.expire(key, CATCHUP_TTL_SECONDS)
    except Exception as e:
        logger.warning(
            "Failed to store event for catchup",
            branch_id=branch_id,
            error=str(e),
        )


async def get_missed_events(
    redis_client: redis.Redis,
    branch_id: int,
    since_timestamp: float,
) -> list[dict]:
    """
    Get events since a timestamp for catch-up after reconnection.

    Args:
        redis_client: Async Redis client.
        branch_id: Branch ID.
        since_timestamp: Unix timestamp; events after this are returned.

    Returns:
        List of event dicts ordered by timestamp (oldest first).
    """
    key = _catchup_key(branch_id)

    try:
        raw_events = await redis_client.zrangebyscore(key, since_timestamp, "+inf")
        return [json.loads(e) for e in raw_events]
    except Exception as e:
        logger.warning(
            "Failed to get missed events for catchup",
            branch_id=branch_id,
            error=str(e),
        )
        return []
