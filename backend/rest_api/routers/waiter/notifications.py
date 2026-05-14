"""Web Push notification management for waiters."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db, safe_commit
from shared.infrastructure.events import get_redis_sync_client
from shared.security.auth import current_user_context
from shared.config.logging import get_logger
from shared.utils.schemas import PushSubscribeOutput, PushUnsubscribeOutput

logger = get_logger("waiter-notifications")

router = APIRouter(prefix="/api/waiter/notifications", tags=["waiter-notifications"])


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # {p256dh: str, auth: str}


def _subscription_key(user_id: int) -> str:
    """Redis key for push subscriptions."""
    return f"push:subscriptions:{user_id}"


@router.post("/subscribe", response_model=PushSubscribeOutput)
def subscribe_push(
    body: PushSubscription,
    user: dict = Depends(current_user_context),
):
    """Register push subscription for waiter."""
    user_id = int(user["sub"])
    sub_data = json.dumps({"endpoint": body.endpoint, "keys": body.keys}, sort_keys=True)

    try:
        redis = get_redis_sync_client()
        redis.sadd(_subscription_key(user_id), sub_data)
    except Exception as e:
        logger.error("Failed to save push subscription to Redis", user_id=user_id, error=str(e))
        # Fail open — don't break the endpoint if Redis is down
        return {"status": "error", "detail": "Failed to persist subscription"}

    return {"status": "subscribed"}


@router.delete("/unsubscribe", response_model=PushUnsubscribeOutput)
def unsubscribe_push(
    body: PushSubscription,
    user: dict = Depends(current_user_context),
):
    """Remove push subscription."""
    user_id = int(user["sub"])
    sub_data = json.dumps({"endpoint": body.endpoint, "keys": body.keys}, sort_keys=True)

    try:
        redis = get_redis_sync_client()
        redis.srem(_subscription_key(user_id), sub_data)
    except Exception as e:
        logger.error("Failed to remove push subscription from Redis", user_id=user_id, error=str(e))

    return {"status": "unsubscribed"}


def get_subscriptions(user_id: int) -> list[dict]:
    """Get all push subscriptions for a user."""
    try:
        redis = get_redis_sync_client()
        members = redis.smembers(_subscription_key(user_id))
        return [json.loads(m) for m in members]
    except Exception as e:
        logger.error("Failed to get push subscriptions from Redis", user_id=user_id, error=str(e))
        return []
