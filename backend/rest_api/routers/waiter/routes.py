"""
Waiter router — aggregator.

Handles operations performed by waiters:
    - PWAW-C001: Service call acknowledge/resolve endpoints.
    - HU-WAITER-MESA: Waiter-managed table flow (activate, order, payment, close).

C8 PASS 5 REFACTOR: This file is now a thin aggregator. Each feature group
lives in its own module; all share the `/api/waiter` prefix and the `waiter`
OpenAPI tag.

Public surface: the `router` symbol exported here is what `main.py` and
`waiter/__init__.py` import. URLs and contracts are byte-identical to the
pre-split monolith.

Feature modules:
    - service_calls.py  → /service-calls/*
    - assignments.py    → /my-assignments, /verify-branch-assignment, /my-tables
    - tables.py         → /tables/*  (activate, close, session, transfer, move-to)
    - rounds.py         → /sessions/{id}/rounds, /rounds/items/{id}/*, /sessions/{id}/summary
    - billing.py        → /sessions/{id}/check, /payments/manual, /sessions/{id}/discount
    - menu.py           → /branches/{id}/menu

Schemas and exception helpers:
    - _schemas.py       → Pydantic models (request/response)
    - _exceptions.py    → translate_app_exceptions, pick_detail
    - _event_helpers.py → _safe_publish_*_event wrappers
"""
from __future__ import annotations

from fastapi import APIRouter

from rest_api.routers.waiter import (
    assignments,
    billing,
    menu,
    rounds,
    service_calls,
    tables,
)


router = APIRouter(prefix="/api/waiter", tags=["waiter"])

# Order is informational only — FastAPI dispatches by path, not registration order.
router.include_router(service_calls.router)
router.include_router(assignments.router)
router.include_router(tables.router)
router.include_router(rounds.router)
router.include_router(billing.router)
router.include_router(menu.router)


__all__ = ["router"]
