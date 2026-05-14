"""
Tests for MercadoPagoGateway implementation.

S3.3: Verifies that MercadoPagoGateway:
- Builds preference requests correctly
- Selects sandbox vs production redirect URLs
- Handles HTTP errors gracefully
- Verifies HMAC webhook signatures
- Routes handle_webhook through verify_payment

External HTTP calls are mocked via httpx.AsyncClient patching.
"""

import hmac
import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from rest_api.services.payments.gateway import (
    PaymentPreference,
    PaymentResult,
)
from rest_api.services.payments.mercadopago_gateway import MercadoPagoGateway


def _mock_response(status_code: int, json_payload: dict | None = None):
    """Build a fake httpx Response with .status_code and .json()."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json = MagicMock(return_value=json_payload or {})
    return resp


class TestCreatePreference:
    """Tests for MercadoPagoGateway.create_preference."""

    async def test_create_preference_success_production_url(self):
        """Non-TEST access token returns init_point (production URL)."""
        gw = MercadoPagoGateway()
        gw.access_token = "PROD-AAAA"

        fake_resp = _mock_response(
            201,
            {
                "id": "pref-1",
                "init_point": "https://mp.test/prod",
                "sandbox_init_point": "https://mp.test/sandbox",
            },
        )

        fake_client = AsyncMock()
        fake_client.post = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.create_preference(
                PaymentPreference(title="Pizza", amount_cents=12550, external_reference="ext-1")
            )

        assert isinstance(result, PaymentResult)
        assert result.success is True
        assert result.external_id == "pref-1"
        assert result.status == "pending"
        assert result.redirect_url == "https://mp.test/prod"

    async def test_create_preference_success_sandbox_url(self):
        """TEST- prefix access token returns sandbox_init_point."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(
            201,
            {
                "id": "pref-2",
                "init_point": "https://mp.test/prod",
                "sandbox_init_point": "https://mp.test/sbx",
            },
        )

        fake_client = AsyncMock()
        fake_client.post = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.create_preference(
                PaymentPreference(title="Pizza", amount_cents=12550)
            )

        assert result.success is True
        assert result.redirect_url == "https://mp.test/sbx"

    async def test_create_preference_passes_payer_and_back_urls(self):
        """Payer email and back_urls should be included in MP request body."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(
            200,
            {
                "id": "pref-3",
                "init_point": "https://mp.test/p",
                "sandbox_init_point": "https://mp.test/sbx",
            },
        )

        fake_client = AsyncMock()
        fake_client.post = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            await gw.create_preference(
                PaymentPreference(
                    title="Burger",
                    amount_cents=5000,
                    external_reference="ref-99",
                    payer_email="payer@x.test",
                    back_urls={"success": "https://x/ok"},
                    notification_url="https://x/wh",
                )
            )

        # Inspect the JSON sent to MP
        kwargs = fake_client.post.call_args.kwargs
        body = kwargs["json"]
        assert body["external_reference"] == "ref-99"
        assert body["payer"] == {"email": "payer@x.test"}
        assert body["back_urls"] == {"success": "https://x/ok"}
        assert body["notification_url"] == "https://x/wh"
        assert body["items"][0]["title"] == "Burger"
        # 5000 cents == $50.00
        assert body["items"][0]["unit_price"] == 50.0
        assert body["items"][0]["currency_id"] == "ARS"

    async def test_create_preference_http_error_returns_failure(self):
        """A non-2xx MP API response returns a failed PaymentResult."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(500, {})

        fake_client = AsyncMock()
        fake_client.post = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.create_preference(
                PaymentPreference(title="x", amount_cents=100)
            )

        assert result.success is False
        assert result.error_message is not None
        assert "500" in result.error_message

    async def test_create_preference_sets_authorization_header(self):
        """The Authorization header should carry the access token as Bearer."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-ABC123"

        fake_resp = _mock_response(
            201,
            {"id": "p", "init_point": "x", "sandbox_init_point": "y"},
        )

        fake_client = AsyncMock()
        fake_client.post = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            await gw.create_preference(PaymentPreference(title="t", amount_cents=100))

        kwargs = fake_client.post.call_args.kwargs
        assert kwargs["headers"]["Authorization"] == "Bearer TEST-ABC123"


class TestVerifyPayment:
    """Tests for MercadoPagoGateway.verify_payment."""

    async def test_verify_payment_approved(self):
        """Approved payment maps to success=True and amount_cents conversion."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(
            200,
            {
                "id": 999,
                "preference_id": "pref-1",
                "status": "approved",
                "transaction_amount": 125.5,
                "external_reference": "ext-1",
                "status_detail": "accredited",
            },
        )

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.verify_payment("999")

        assert result.success is True
        assert result.payment_id == "999"
        assert result.external_id == "pref-1"
        assert result.status == "approved"
        # Float * 100 rounding: 125.5 -> 12550 (int conversion)
        assert result.amount_cents == 12550
        assert result.external_reference == "ext-1"
        assert result.status_detail == "accredited"

    async def test_verify_payment_rejected(self):
        """Non-approved status keeps success=False."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(
            200,
            {
                "id": "abc",
                "status": "rejected",
                "transaction_amount": 50.0,
            },
        )

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.verify_payment("abc")

        assert result.success is False
        assert result.status == "rejected"

    async def test_verify_payment_http_error_returns_failure(self):
        """An HTTP failure returns a structured error PaymentResult."""
        gw = MercadoPagoGateway()
        gw.access_token = "TEST-XYZ"

        fake_resp = _mock_response(404, {})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=fake_resp)
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = False

        with patch("rest_api.services.payments.mercadopago_gateway.httpx.AsyncClient", return_value=fake_client):
            result = await gw.verify_payment("missing")

        assert result.success is False
        assert "404" in result.error_message


class TestVerifyWebhookSignature:
    """Tests for HMAC signature verification (synchronous)."""

    def test_verify_signature_returns_false_when_empty_signature(self):
        """Missing signature header should always fail closed."""
        gw = MercadoPagoGateway()
        assert gw.verify_webhook_signature("", "req-1", "data-1") is False

    def test_verify_signature_returns_false_when_no_secret_configured(self, monkeypatch):
        """If webhook secret is not configured, verification fails closed."""
        from shared.config import settings as settings_mod
        monkeypatch.setattr(settings_mod, "mercadopago_webhook_secret", "")
        gw = MercadoPagoGateway()
        assert gw.verify_webhook_signature("ts=1,v1=abc", "req", "data") is False

    def test_verify_signature_valid_hmac_returns_true(self, monkeypatch):
        """Correctly-built HMAC should validate."""
        secret = "supersecret"
        from shared.config import settings as settings_mod
        monkeypatch.setattr(settings_mod, "mercadopago_webhook_secret", secret)

        ts = "1700000000"
        data_id = "data-1"
        request_id = "req-1"
        manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
        v1 = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        signature = f"ts={ts},v1={v1}"

        gw = MercadoPagoGateway()
        assert gw.verify_webhook_signature(signature, request_id, data_id) is True

    def test_verify_signature_tampered_returns_false(self, monkeypatch):
        """Tampered v1 should fail verification."""
        secret = "supersecret"
        from shared.config import settings as settings_mod
        monkeypatch.setattr(settings_mod, "mercadopago_webhook_secret", secret)

        signature = "ts=1700000000,v1=deadbeef"
        gw = MercadoPagoGateway()
        assert gw.verify_webhook_signature(signature, "req-1", "data-1") is False


class TestHandleWebhook:
    """Tests for handle_webhook routing."""

    async def test_handle_webhook_missing_payment_id_returns_error(self):
        """A webhook without data.id should fail without making HTTP calls."""
        gw = MercadoPagoGateway()
        result = await gw.handle_webhook({"data": {}})
        assert result.success is False
        assert "No payment ID" in (result.error_message or "")

    async def test_handle_webhook_delegates_to_verify_payment(self):
        """A valid webhook should call verify_payment with the data.id."""
        gw = MercadoPagoGateway()

        async def fake_verify(payment_id):
            return PaymentResult(success=True, payment_id=payment_id, status="approved")

        with patch.object(gw, "verify_payment", side_effect=fake_verify) as mock_verify:
            result = await gw.handle_webhook({"data": {"id": "pay-123"}})

        mock_verify.assert_awaited_once_with("pay-123")
        assert result.success is True
        assert result.payment_id == "pay-123"
