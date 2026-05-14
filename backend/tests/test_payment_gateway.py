"""
Tests for the abstract PaymentGateway interface.

S3.3: Verifies that:
- PaymentGateway cannot be instantiated directly (ABC contract)
- PaymentResult and PaymentPreference dataclasses behave as expected
- Concrete subclasses must implement all abstract methods
"""

import pytest

from rest_api.services.payments.gateway import (
    PaymentGateway,
    PaymentPreference,
    PaymentResult,
)


class TestPaymentResultDataclass:
    """Tests for the PaymentResult dataclass."""

    def test_payment_result_defaults(self):
        """PaymentResult should default to unknown status and Nones."""
        result = PaymentResult(success=True)
        assert result.success is True
        assert result.payment_id is None
        assert result.external_id is None
        assert result.status == "unknown"
        assert result.redirect_url is None
        assert result.error_message is None
        assert result.amount_cents is None
        assert result.external_reference is None
        assert result.status_detail is None

    def test_payment_result_all_fields(self):
        """PaymentResult should preserve all assigned fields."""
        result = PaymentResult(
            success=False,
            payment_id="pid-1",
            external_id="ext-1",
            status="rejected",
            redirect_url="https://x.test/redir",
            error_message="card declined",
            amount_cents=1234,
            external_reference="ref-1",
            status_detail="cc_rejected",
        )
        assert result.success is False
        assert result.payment_id == "pid-1"
        assert result.external_id == "ext-1"
        assert result.status == "rejected"
        assert result.redirect_url == "https://x.test/redir"
        assert result.error_message == "card declined"
        assert result.amount_cents == 1234
        assert result.external_reference == "ref-1"
        assert result.status_detail == "cc_rejected"


class TestPaymentPreferenceDataclass:
    """Tests for the PaymentPreference dataclass."""

    def test_payment_preference_required_fields(self):
        """PaymentPreference requires title and amount_cents."""
        pref = PaymentPreference(title="Order #1", amount_cents=5000)
        assert pref.title == "Order #1"
        assert pref.amount_cents == 5000
        # Defaults
        assert pref.currency == "ARS"
        assert pref.external_reference == ""
        assert pref.payer_email is None
        assert pref.back_urls is None
        assert pref.notification_url is None

    def test_payment_preference_custom_fields(self):
        """PaymentPreference should preserve custom values."""
        back_urls = {"success": "https://x.test/ok"}
        pref = PaymentPreference(
            title="Order #2",
            amount_cents=12550,
            currency="USD",
            external_reference="ext-ref",
            payer_email="payer@test.com",
            back_urls=back_urls,
            notification_url="https://x.test/wh",
        )
        assert pref.currency == "USD"
        assert pref.external_reference == "ext-ref"
        assert pref.payer_email == "payer@test.com"
        assert pref.back_urls is back_urls
        assert pref.notification_url == "https://x.test/wh"


class TestPaymentGatewayABC:
    """Tests for the abstract PaymentGateway contract."""

    def test_cannot_instantiate_payment_gateway_directly(self):
        """PaymentGateway is abstract and cannot be instantiated."""
        with pytest.raises(TypeError):
            PaymentGateway()  # type: ignore[abstract]

    def test_subclass_missing_methods_cannot_instantiate(self):
        """A subclass that does not implement all abstracts must raise on init."""

        class IncompleteGateway(PaymentGateway):
            # Missing all abstract methods
            pass

        with pytest.raises(TypeError):
            IncompleteGateway()  # type: ignore[abstract]

    def test_subclass_partial_implementation_cannot_instantiate(self):
        """Partially-implemented subclass should still be abstract."""

        class PartialGateway(PaymentGateway):
            async def create_preference(self, preference):  # type: ignore[override]
                return PaymentResult(success=True)

            # Missing verify_payment, verify_webhook_signature, handle_webhook

        with pytest.raises(TypeError):
            PartialGateway()  # type: ignore[abstract]

    def test_complete_subclass_can_instantiate(self):
        """A fully-implemented subclass should instantiate cleanly."""

        class FakeGateway(PaymentGateway):
            async def create_preference(self, preference):
                return PaymentResult(success=True, redirect_url="x")

            async def verify_payment(self, payment_id):
                return PaymentResult(success=True, payment_id=payment_id)

            def verify_webhook_signature(self, signature, request_id, data_id):
                return True

            async def handle_webhook(self, payload):
                return PaymentResult(success=True)

        gw = FakeGateway()
        assert isinstance(gw, PaymentGateway)

    async def test_fake_gateway_methods_return_payment_results(self):
        """Sanity check: a complete subclass produces PaymentResult objects."""

        class FakeGateway(PaymentGateway):
            async def create_preference(self, preference):
                return PaymentResult(success=True, status="pending")

            async def verify_payment(self, payment_id):
                return PaymentResult(success=True, payment_id=payment_id, status="approved")

            def verify_webhook_signature(self, signature, request_id, data_id):
                return signature == "ok"

            async def handle_webhook(self, payload):
                return PaymentResult(success=True, status="approved")

        gw = FakeGateway()
        pref_result = await gw.create_preference(PaymentPreference(title="t", amount_cents=100))
        assert isinstance(pref_result, PaymentResult)
        assert pref_result.status == "pending"

        verify_result = await gw.verify_payment("pid-99")
        assert verify_result.payment_id == "pid-99"
        assert verify_result.status == "approved"

        assert gw.verify_webhook_signature("ok", "rid", "did") is True
        assert gw.verify_webhook_signature("nope", "rid", "did") is False

        wh_result = await gw.handle_webhook({"data": {"id": "1"}})
        assert wh_result.success is True
