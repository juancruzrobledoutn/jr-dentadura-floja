"""
Internal helpers for the waiter router — event publishing wrappers.

C8 PASS 4 REFACTOR: Consolidates the repetitive pattern:

    try:
        redis = await get_redis_client()
        await publish_xxx_event(...)
        logger.info(...)
    except Exception as e:
        logger.error("Failed to publish XXX event", error=str(e))

Each helper acquires the Redis client, invokes the corresponding publisher,
logs a success line on the structured logger, and swallows any exception
with a single warning log entry. Routes call these helpers instead of
duplicating the try/except boilerplate.

Keeping the helpers in the waiter package preserves the existing import
surface (no public API changes) and keeps event publication side-effects
visible inside the waiter feature folder.
"""
from __future__ import annotations

from typing import Any, Optional

from shared.config.logging import waiter_logger as logger
from shared.infrastructure.events import (
    get_redis_client,
    publish_check_event,
    publish_round_event,
    publish_service_call_event,
    publish_table_event,
)


async def _safe_publish_table_event(
    *,
    event_type: str,
    tenant_id: Any,
    branch_id: int,
    table_id: int,
    session_id: int,
    table_code: str,
    table_status: str,
    actor_user_id: int,
    actor_role: str,
    sector_id: Optional[int],
    log_message: str,
    log_extra: Optional[dict[str, Any]] = None,
) -> None:
    """Publish a TABLE_* event, swallowing transport errors."""
    try:
        redis = await get_redis_client()
        await publish_table_event(
            redis_client=redis,
            event_type=event_type,
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_id=table_id,
            session_id=session_id,
            table_code=table_code,
            table_status=table_status,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            sector_id=sector_id,
        )
        logger.info(log_message, **(log_extra or {}))
    except Exception as e:
        logger.error(f"Failed to publish {event_type} event", error=str(e))


async def _safe_publish_service_call_event(
    *,
    event_type: str,
    tenant_id: Any,
    branch_id: int,
    table_id: int,
    session_id: int,
    call_id: int,
    call_type: str,
    actor_user_id: int,
    actor_role: str,
    sector_id: Optional[int],
    log_message: str,
    log_extra: Optional[dict[str, Any]] = None,
) -> None:
    """Publish a SERVICE_CALL_* event, swallowing transport errors."""
    try:
        redis = await get_redis_client()
        await publish_service_call_event(
            redis_client=redis,
            event_type=event_type,
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_id=table_id,
            session_id=session_id,
            call_id=call_id,
            call_type=call_type,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            sector_id=sector_id,
        )
        logger.info(log_message, **(log_extra or {}))
    except Exception as e:
        logger.error(f"Failed to publish {event_type} event", error=str(e))


async def _safe_publish_round_event(
    *,
    event_type: str,
    tenant_id: Any,
    branch_id: int,
    table_id: int,
    session_id: int,
    round_id: int,
    round_number: int,
    actor_user_id: int,
    actor_role: str,
    sector_id: Optional[int],
    log_message: str,
    log_extra: Optional[dict[str, Any]] = None,
) -> None:
    """Publish a ROUND_* event, swallowing transport errors."""
    try:
        redis = await get_redis_client()
        await publish_round_event(
            redis_client=redis,
            event_type=event_type,
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_id=table_id,
            session_id=session_id,
            round_id=round_id,
            round_number=round_number,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            sector_id=sector_id,
        )
        logger.info(log_message, **(log_extra or {}))
    except Exception as e:
        logger.error(f"Failed to publish {event_type} event", error=str(e))


async def _safe_publish_check_event(
    *,
    event_type: str,
    tenant_id: Any,
    branch_id: int,
    table_id: int,
    session_id: int,
    check_id: int,
    total_cents: int,
    paid_cents: int,
    actor_user_id: int,
    actor_role: str,
    sector_id: Optional[int],
    log_message: Optional[str] = None,
    log_extra: Optional[dict[str, Any]] = None,
) -> None:
    """Publish a CHECK_*/PAYMENT_* event, swallowing transport errors."""
    try:
        redis = await get_redis_client()
        await publish_check_event(
            redis_client=redis,
            event_type=event_type,
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_id=table_id,
            session_id=session_id,
            check_id=check_id,
            total_cents=total_cents,
            paid_cents=paid_cents,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            sector_id=sector_id,
        )
        if log_message:
            logger.info(log_message, **(log_extra or {}))
    except Exception as e:
        logger.error(f"Failed to publish {event_type} event", error=str(e))
