"""
Internal helpers for the diner router — event publishing wrappers.

C8 PASS 6 REFACTOR: Consolidates the repeated pattern used in
background tasks across the diner endpoints:

    try:
        redis = await get_redis_client()
        await publish_xxx_event(...)
        logger.info(...)
    except Exception as e:
        logger.error("Failed to publish XXX event (bg)", error=str(e))

These helpers are scheduled via `background_tasks.add_task(...)` from
each route — keeping them in the diner package preserves locality and
makes background side-effects discoverable inside the diner feature
folder.
"""
from __future__ import annotations

from typing import Any

from shared.config.logging import diner_logger as logger
from shared.infrastructure.events import (
    CART_CLEARED,
    get_redis_client,
    publish_cart_event,
    publish_round_event,
    publish_service_call_event,
)


async def _bg_publish_round_event(**kwargs: Any) -> None:
    """Background task to publish round event."""
    try:
        redis = await get_redis_client()
        await publish_round_event(redis_client=redis, **kwargs)
        logger.info("ROUND_PENDING published (bg)", round_id=kwargs.get("round_id"))
    except Exception as e:
        logger.error("Failed to publish ROUND_PENDING event (bg)", error=str(e))


async def _bg_publish_service_call_event(**kwargs: Any) -> None:
    """Background task to publish service call event."""
    try:
        redis = await get_redis_client()
        await publish_service_call_event(redis_client=redis, **kwargs)
        logger.info(
            "SERVICE_CALL_CREATED published (bg)",
            call_id=kwargs.get("call_id"),
        )
    except Exception as e:
        logger.error(
            "Failed to publish SERVICE_CALL_CREATED event (bg)", error=str(e)
        )


async def _bg_publish_cart_cleared(**kwargs: Any) -> None:
    """Background task to publish cart cleared event after round submission."""
    try:
        redis = await get_redis_client()
        await publish_cart_event(
            redis_client=redis,
            event_type=CART_CLEARED,
            **kwargs,
        )
        logger.info(
            "CART_CLEARED published (bg)", session_id=kwargs.get("session_id")
        )
    except Exception as e:
        logger.error("Failed to publish CART_CLEARED event (bg)", error=str(e))


async def _bg_publish_cart_event(
    event_type: str,
    tenant_id: int,
    branch_id: int,
    session_id: int,
    entity: dict,
    actor_diner_id: int | None = None,
) -> None:
    """
    Background task to publish a generic cart event.

    C8 PASS 7 REFACTOR: Moved from `cart.py` so all background event
    publishers live in one module. Used by add/update/remove/clear cart
    endpoints with any CART_* event type.
    """
    try:
        redis = await get_redis_client()
        await publish_cart_event(
            redis_client=redis,
            event_type=event_type,
            tenant_id=tenant_id,
            branch_id=branch_id,
            session_id=session_id,
            entity=entity,
            actor_diner_id=actor_diner_id,
        )
        logger.info(f"{event_type} published (bg)", session_id=session_id)
    except Exception as e:
        logger.error(f"Failed to publish {event_type} event (bg)", error=str(e))


__all__ = [
    "_bg_publish_round_event",
    "_bg_publish_service_call_event",
    "_bg_publish_cart_cleared",
    "_bg_publish_cart_event",
]
