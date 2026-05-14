"""
Cache package initialization.

REDIS-02: Cache utilities and warming.
"""

from shared.infrastructure.cache.warmer import (
    CacheWarmer,
    warm_caches_on_startup,
)
from shared.infrastructure.cache.menu_cache import (
    get_cached_menu,
    set_cached_menu,
    invalidate_menu_cache,
    invalidate_all_menu_caches,
)

__all__ = [
    "CacheWarmer",
    "warm_caches_on_startup",
    "get_cached_menu",
    "set_cached_menu",
    "invalidate_menu_cache",
    "invalidate_all_menu_caches",
]
