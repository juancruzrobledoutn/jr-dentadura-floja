"""
Menu cache for public menu endpoint.

Caches the full menu response per branch_slug in Redis with a 5-minute TTL.
Uses the sync Redis client since the public menu endpoint is synchronous.

Invalidation:
- All caches invalidated on product/category/subcategory create/update/delete
- All caches invalidated on product availability toggle
"""

import json
from typing import Any

from shared.config.logging import get_logger
from shared.infrastructure.redis.constants import PREFIX_CACHE_MENU, MENU_CACHE_TTL

logger = get_logger(__name__)


def _get_cache_key(slug: str) -> str:
    """Build Redis key for a branch menu cache."""
    return f"{PREFIX_CACHE_MENU}{slug}"


def get_cached_menu(slug: str) -> dict[str, Any] | None:
    """
    Get cached menu for a branch slug.

    Returns None on cache miss or Redis failure (fail-open).
    """
    try:
        from shared.infrastructure.events import get_redis_sync_client

        redis = get_redis_sync_client()
        cached = redis.get(_get_cache_key(slug))
        if cached:
            logger.debug("Menu cache hit", slug=slug)
            return json.loads(cached)
    except Exception as e:
        # Fail-open: if Redis is down, just query DB
        logger.warning("Menu cache read failed", slug=slug, error=str(e))
    return None


def set_cached_menu(slug: str, data: dict[str, Any]) -> None:
    """
    Cache menu data for a branch slug with TTL.

    Silently fails if Redis is unavailable (non-critical).
    """
    try:
        from shared.infrastructure.events import get_redis_sync_client

        redis = get_redis_sync_client()
        serialized = json.dumps(data, default=str, ensure_ascii=False)
        redis.setex(_get_cache_key(slug), MENU_CACHE_TTL, serialized)
        logger.debug("Menu cached", slug=slug)
    except Exception as e:
        logger.warning("Menu cache write failed", slug=slug, error=str(e))


def invalidate_menu_cache(slug: str) -> None:
    """
    Invalidate cached menu for a specific branch slug.

    Used when a change is known to affect only one branch (e.g., availability toggle).
    """
    try:
        from shared.infrastructure.events import get_redis_sync_client

        redis = get_redis_sync_client()
        deleted = redis.delete(_get_cache_key(slug))
        if deleted:
            logger.info("Menu cache invalidated", slug=slug)
    except Exception as e:
        logger.warning("Menu cache invalidation failed", slug=slug, error=str(e))


def invalidate_all_menu_caches() -> None:
    """
    Invalidate all cached menus.

    Used on product/category/subcategory CRUD operations where the
    affected branch slug may not be readily available.
    """
    try:
        from shared.infrastructure.events import get_redis_sync_client

        redis = get_redis_sync_client()
        cursor = 0
        total_deleted = 0
        pattern = f"{PREFIX_CACHE_MENU}*"

        while True:
            cursor, keys = redis.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                redis.delete(*keys)
                total_deleted += len(keys)
            if cursor == 0:
                break

        if total_deleted:
            logger.info("All menu caches invalidated", count=total_deleted)
    except Exception as e:
        logger.warning("Menu cache bulk invalidation failed", error=str(e))
