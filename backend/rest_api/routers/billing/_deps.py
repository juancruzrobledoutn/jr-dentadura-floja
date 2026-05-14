"""
Shared dependencies/factories for the billing router.

C8 PASS 6 REFACTOR (billing): The payment-gateway factory is used by both the
MP preference creation endpoint and the MP webhook endpoint. Centralizing the
factory keeps the swap-point in a single place (e.g., to inject a fake gateway
in tests).

Behavior is identical to the previous `_get_payment_gateway()` function inline
in routes.py.
"""
from __future__ import annotations

from rest_api.services.payments.gateway import PaymentGateway
from rest_api.services.payments.mercadopago_gateway import MercadoPagoGateway


def get_payment_gateway() -> PaymentGateway:
    """Factory for payment gateway. Swap implementation here for testing or new providers."""
    return MercadoPagoGateway()


__all__ = ["get_payment_gateway"]
