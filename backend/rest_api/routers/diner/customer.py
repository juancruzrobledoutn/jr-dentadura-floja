"""
Customer Router — aggregator.

FASE 4: Handles customer registration, recognition, and preferences.
Customers are identified users who opted-in for personalized experience.

Uses table token authentication (X-Table-Token header). When endpoints
need a `device_id` it can come from either the `device_id` query param
or the `X-Device-Id` header (QA-CRIT-02).

C8 PASS 7 REFACTOR: This file is now a thin aggregator. Each feature group
lives in its own module; all share the `/api/customer` prefix and the
`customer` OpenAPI tag.

Public surface: the `router` symbol exported here is what `main.py` and
`diner/__init__.py` import. URLs and contracts are byte-identical to the
pre-split monolith.

Feature modules:
    - customer_registration.py → POST /register
    - customer_profile.py      → GET /recognize, GET /me, PATCH /me
    - customer_suggestions.py  → GET /suggestions

Helpers:
    - _customer_helpers.py → resolve_device_id, _customer_to_output,
                             _parse_json_list, get_device_id_from_header
"""
from __future__ import annotations

from fastapi import APIRouter

from rest_api.routers.diner import (
    customer_profile,
    customer_registration,
    customer_suggestions,
)


router = APIRouter(prefix="/api/customer", tags=["customer"])

# Order is informational only — FastAPI dispatches by path, not registration order.
router.include_router(customer_registration.router)
router.include_router(customer_profile.router)
router.include_router(customer_suggestions.router)


__all__ = ["router"]
