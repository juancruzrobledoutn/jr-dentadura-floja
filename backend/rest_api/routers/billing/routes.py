"""
Billing router — aggregator.

Handles check requests, payments, and table clearing.
Includes Mercado Pago integration for digital payments.

REC-01 FIX: Uses circuit breaker for Mercado Pago API calls.
REC-02 FIX: Failed webhooks are queued for retry.

C8 PASS 6 REFACTOR (billing): This file is now a thin aggregator. Each feature
group lives in its own module; all share the `/api/billing` prefix and the
`billing` OpenAPI tag.

Public surface: the `router` symbol exported here is what `main.py` and
`billing/__init__.py` import. URLs, status codes, request/response bodies,
and detail strings are byte-identical to the pre-split monolith.

Feature modules:
    - checks.py         → /check/request, /check/{id}, /check/{id}/balances
    - payments_cash.py  → /cash/pay
    - tables.py         → /tables/{id}/clear
    - mercadopago.py    → /mercadopago/preference, /mercadopago/webhook

Shared helpers (private):
    - _audit_helpers.py → safe_audit_log (fire-and-forget audit chain writes)
    - _deps.py          → get_payment_gateway (PaymentGateway factory)

GOVERNANCE NOTE:
    The endpoints in this package are CRITICO (payments, refunds, outbox-driven
    financial events). The C8 PASS 6 refactor is STRUCTURAL ONLY — no business
    logic, validation ordering, lock acquisition, outbox writes, or detail
    strings have been changed. The only behavior delta is the encapsulation
    of the audit-log try/except block into `safe_audit_log`, which preserves
    fire-and-forget semantics byte-for-byte.
"""
from __future__ import annotations

from fastapi import APIRouter

from rest_api.routers.billing import (
    checks,
    mercadopago,
    payments_cash,
    tables,
)


router = APIRouter(prefix="/api/billing", tags=["billing"])

# Order is informational only — FastAPI dispatches by path, not registration order.
router.include_router(checks.router)
router.include_router(payments_cash.router)
router.include_router(tables.router)
router.include_router(mercadopago.router)


__all__ = ["router"]
