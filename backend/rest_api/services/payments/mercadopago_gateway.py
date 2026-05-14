"""Mercado Pago implementation of PaymentGateway."""
import hmac
import hashlib
from typing import Optional

import httpx

from shared.config.settings import settings
from .gateway import PaymentGateway, PaymentPreference, PaymentResult


class MercadoPagoGateway(PaymentGateway):
    """Mercado Pago payment gateway implementation."""

    def __init__(self):
        self.access_token = settings.mercadopago_access_token
        self.base_url = "https://api.mercadopago.com"

    async def create_preference(self, preference: PaymentPreference) -> PaymentResult:
        """Create MP checkout preference."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/checkout/preferences",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json={
                    "items": [{
                        "title": preference.title,
                        "quantity": 1,
                        "unit_price": preference.amount_cents / 100,
                        "currency_id": preference.currency,
                    }],
                    "external_reference": preference.external_reference,
                    "payer": {"email": preference.payer_email} if preference.payer_email else {},
                    "back_urls": preference.back_urls or {},
                    "notification_url": preference.notification_url,
                    "auto_return": "approved",
                },
            )

        if response.status_code in (200, 201):
            data = response.json()
            is_sandbox = (self.access_token or "").startswith("TEST-")
            return PaymentResult(
                success=True,
                external_id=str(data["id"]),
                status="pending",
                redirect_url=data["sandbox_init_point"] if is_sandbox else data["init_point"],
            )

        return PaymentResult(success=False, error_message=f"MP API error: {response.status_code}")

    async def verify_payment(self, payment_id: str) -> PaymentResult:
        """Get payment status from MP API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/v1/payments/{payment_id}",
                headers={"Authorization": f"Bearer {self.access_token}"},
            )

        if response.status_code == 200:
            data = response.json()
            return PaymentResult(
                success=data["status"] == "approved",
                payment_id=str(data["id"]),
                external_id=str(data.get("preference_id", "")),
                status=data["status"],
                # Use round() instead of int() to handle float precision.
                # Payments have <=2 decimals so round() is safe and avoids truncation.
                amount_cents=round(data.get("transaction_amount", 0) * 100),
                external_reference=data.get("external_reference", ""),
                status_detail=data.get("status_detail", ""),
            )

        return PaymentResult(success=False, error_message=f"MP API error: {response.status_code}")

    def verify_webhook_signature(self, signature: str, request_id: str, data_id: str) -> bool:
        """Verify MP webhook HMAC signature."""
        if not signature or not settings.mercadopago_webhook_secret:
            return False

        # Parse x-signature header
        parts = dict(p.split("=", 1) for p in signature.split(",") if "=" in p)
        ts = parts.get("ts", "")
        v1 = parts.get("v1", "")

        # Build manifest
        manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
        expected = hmac.new(
            settings.mercadopago_webhook_secret.encode(),
            manifest.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(v1, expected)

    async def handle_webhook(self, payload: dict) -> PaymentResult:
        """Process MP webhook -- fetch payment and return result."""
        payment_id = str(payload.get("data", {}).get("id", ""))
        if not payment_id:
            return PaymentResult(success=False, error_message="No payment ID in webhook")

        return await self.verify_payment(payment_id)
