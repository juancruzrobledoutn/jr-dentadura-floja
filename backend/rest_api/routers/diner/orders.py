"""
Diner router — aggregator.

Handles operations performed by diners (customers) at tables.
Uses table token authentication (X-Table-Token header) instead of JWT.

C8 PASS 6 REFACTOR: This file is now a thin aggregator. Each feature group
lives in its own module; all share the `/api/diner` prefix and the `diner`
OpenAPI tag.

Public surface: the `router` symbol exported here is what `main.py` and
`diner/__init__.py` import. URLs and contracts are byte-identical to the
pre-split monolith.

Feature modules:
    - registration.py   → /register, /session/{id}/diners
    - rounds.py         → /rounds/submit, /session/{id}/rounds
    - service_calls.py  → /service-call
    - billing.py        → /session/{id}/total, /check
    - device.py         → /device/{id}/history, /preferences,
                          /device/{id}/preferences
    - feedback.py       → /feedback

Schemas and helpers:
    - _schemas.py       → Pydantic models defined inline (FeedbackRequest/Response)
    - _event_helpers.py → _bg_publish_*_event background-task wrappers

Note: cart endpoints live in `cart.py` (separate router prefix /api/diner/cart)
and are already mounted independently by main.py.
"""
from __future__ import annotations

from fastapi import APIRouter

from rest_api.routers.diner import (
    billing,
    device,
    feedback,
    registration,
    rounds,
    service_calls,
)


router = APIRouter(prefix="/api/diner", tags=["diner"])

# Order is informational only — FastAPI dispatches by path, not registration order.
router.include_router(registration.router)
router.include_router(rounds.router)
router.include_router(service_calls.router)
router.include_router(billing.router)
router.include_router(device.router)
router.include_router(feedback.router)


__all__ = ["router"]
