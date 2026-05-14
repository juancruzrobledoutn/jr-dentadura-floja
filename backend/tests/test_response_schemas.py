"""
S4.4: Response schema validation tests.

Verifies that endpoints previously returning dict[str, Any] now have
Pydantic response_models in the OpenAPI schema. These tests are
contract tests for the OpenAPI document — they do NOT exercise the
actual endpoint logic (which is covered by domain/integration tests).

The shape preserved here is what frontends rely on. If you break shape,
you break frontends; OpenAPI codegen will silently produce wrong types.
"""

import pytest
from fastapi.testclient import TestClient

from rest_api.main import app
from shared.utils.schemas import (
    BillingCheckGetOutput,
    BillingCheckPaymentInfo,
    CashSessionOpenOutput,
    CashMovementOutput,
    CashSessionCloseOutput,
    CashCurrentSessionOutput,
    CashSessionInfo,
    CashSessionHistoryItem,
    TipRecordOutput,
    TipListItemOutput,
    CustomerDataExportOutput,
    DataExportMetadata,
    DataExportProfile,
    DataExportVisit,
    DataExportLoyaltyTx,
    PushSubscribeOutput,
    PushUnsubscribeOutput,
)


# -----------------------------------------------------------------------------
# Schema instantiation tests (validate shape, optional fields, type coercion).
# These are pure-Pydantic — no HTTP, no DB.
# -----------------------------------------------------------------------------


class TestBillingCheckGetOutput:
    """Shape preserved from `GET /api/billing/check/{check_id}`."""

    def test_full_payload_accepted(self):
        data = {
            "id": 1,
            "session_id": 2,
            "status": "OPEN",
            "total_cents": 12500,
            "paid_cents": 5000,
            "remaining_cents": 7500,
            "created_at": "2025-01-01T12:00:00+00:00",
            "payments": [
                {
                    "id": 10,
                    "provider": "MERCADO_PAGO",
                    "status": "APPROVED",
                    "amount_cents": 5000,
                    "created_at": "2025-01-01T12:05:00+00:00",
                }
            ],
        }
        out = BillingCheckGetOutput.model_validate(data)
        assert out.id == 1
        assert out.session_id == 2
        assert out.remaining_cents == 7500
        assert len(out.payments) == 1
        assert out.payments[0].provider == "MERCADO_PAGO"

    def test_empty_payments_list(self):
        out = BillingCheckGetOutput.model_validate({
            "id": 1, "session_id": 2, "status": "OPEN",
            "total_cents": 0, "paid_cents": 0, "remaining_cents": 0,
            "created_at": "2025-01-01T12:00:00",
            "payments": [],
        })
        assert out.payments == []

    def test_provider_is_free_form_string(self):
        # Endpoint returns whatever provider the DB stores — schema
        # MUST NOT restrict to a Literal (would reject unknown providers).
        info = BillingCheckPaymentInfo(
            id=1, provider="CUSTOM_GATEWAY", status="APPROVED",
            amount_cents=100, created_at="2025-01-01T00:00:00",
        )
        assert info.provider == "CUSTOM_GATEWAY"


class TestCashRegisterSchemas:
    """Shape preserved from /api/admin/cash/* endpoints."""

    def test_open_session_output(self):
        data = {
            "id": 1, "cash_register_id": 1, "status": "OPEN",
            "opened_at": "2025-01-01T08:00:00", "opening_amount_cents": 10000,
        }
        out = CashSessionOpenOutput.model_validate(data)
        assert out.opening_amount_cents == 10000

    def test_movement_output_allows_none_description(self):
        out = CashMovementOutput.model_validate({
            "id": 1, "movement_type": "SALE", "amount_cents": 500,
            "payment_method": "CASH", "description": None, "created_at": None,
        })
        assert out.description is None
        assert out.created_at is None

    def test_close_session_with_all_nullable_fields_none(self):
        # When a session has just been opened, closed_at/expected/actual are None.
        out = CashSessionCloseOutput.model_validate({
            "id": 1, "status": "CLOSED", "opened_at": None, "closed_at": None,
            "opening_amount_cents": 0, "expected_amount_cents": None,
            "actual_amount_cents": None, "difference_cents": None, "notes": None,
        })
        assert out.difference_cents is None

    def test_current_session_no_open_session(self):
        # Endpoint returns {"session": None} when no session is open.
        out = CashCurrentSessionOutput.model_validate({"session": None})
        assert out.session is None

    def test_current_session_with_open_session(self):
        out = CashCurrentSessionOutput.model_validate({
            "session": {
                "id": 1, "cash_register_id": 1, "status": "OPEN",
                "opened_at": "2025-01-01T08:00:00",
                "opening_amount_cents": 10000, "opened_by_id": 1,
            }
        })
        assert out.session is not None
        assert out.session.id == 1

    def test_history_item_partial_data(self):
        # Open sessions don't have closed_at/expected/actual yet.
        out = CashSessionHistoryItem.model_validate({
            "id": 1, "status": "OPEN", "opened_at": "2025-01-01T08:00:00",
            "closed_at": None, "opening_amount_cents": 10000,
            "expected_amount_cents": None, "actual_amount_cents": None,
            "difference_cents": None,
        })
        assert out.closed_at is None


class TestTipsSchemas:
    """Shape preserved from /api/admin/tips endpoints."""

    def test_record_tip_no_waiter(self):
        out = TipRecordOutput.model_validate({
            "id": 1, "amount_cents": 200, "payment_method": "CASH",
            "waiter_id": None, "created_at": "2025-01-01T20:00:00",
        })
        assert out.waiter_id is None

    def test_list_item_full(self):
        out = TipListItemOutput.model_validate({
            "id": 1, "branch_id": 1, "amount_cents": 500,
            "payment_method": "CARD", "waiter_id": 5,
            "table_session_id": 100, "check_id": 50,
            "created_at": "2025-01-01T20:00:00",
        })
        assert out.check_id == 50

    def test_list_item_only_required(self):
        # All optional fields can be None — tip might be branch-level without
        # any specific assignment.
        out = TipListItemOutput.model_validate({
            "id": 1, "branch_id": 1, "amount_cents": 500,
            "payment_method": "CASH", "waiter_id": None,
            "table_session_id": None, "check_id": None, "created_at": None,
        })
        assert out.waiter_id is None


class TestDataExportSchemas:
    """Shape preserved from GDPR /api/admin/data-export/customer/{id}."""

    def test_full_export_structure(self):
        data = {
            "export_metadata": {
                "exported_at": "2025-01-01T00:00:00",
                "exported_by_user_id": 1, "tenant_id": 1,
                "customer_id": 100, "format_version": "1.0",
            },
            "profile": {"id": 100, "name": "John"},
            "visits": [],
            "loyalty_transactions": [],
        }
        out = CustomerDataExportOutput.model_validate(data)
        assert out.export_metadata.format_version == "1.0"
        assert out.profile.name == "John"
        assert out.visits == []

    def test_profile_with_all_pii_none(self):
        # After anonymization, most PII fields become None.
        out = DataExportProfile.model_validate({
            "id": 100, "name": None, "email": None, "phone": None,
            "device_id": None, "loyalty_points": 0,
        })
        assert out.name is None

    def test_visit_with_optional_feedback(self):
        out = DataExportVisit.model_validate({
            "id": 1, "branch_id": 1, "visit_date": "2025-01-01",
            "party_size": 2, "total_spent_cents": 5000,
            "rating": None, "feedback": None, "created_at": None,
        })
        assert out.rating is None


class TestNotificationsSchemas:
    """Shape preserved from /api/waiter/notifications/* endpoints."""

    def test_subscribe_success(self):
        out = PushSubscribeOutput.model_validate({"status": "subscribed"})
        assert out.status == "subscribed"
        assert out.detail is None

    def test_subscribe_fail_open_with_detail(self):
        # Endpoint returns {"status": "error", "detail": "..."} on Redis fail.
        out = PushSubscribeOutput.model_validate({
            "status": "error", "detail": "Failed to persist subscription",
        })
        assert out.detail == "Failed to persist subscription"

    def test_unsubscribe(self):
        out = PushUnsubscribeOutput.model_validate({"status": "unsubscribed"})
        assert out.status == "unsubscribed"


# -----------------------------------------------------------------------------
# OpenAPI contract tests — verify that refactored endpoints now have a $ref
# in the OpenAPI schema (instead of falling back to inferred `any`).
# -----------------------------------------------------------------------------


@pytest.fixture(scope="module")
def openapi_schema():
    """Build the OpenAPI schema once for all OpenAPI contract tests."""
    client = TestClient(app)
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    return resp.json()


def _get_response_schema(openapi, path: str, method: str, status_code: str = "200"):
    """Helper: extract the JSON schema for a given path/method/status."""
    paths = openapi["paths"]
    assert path in paths, f"Path {path} not in OpenAPI"
    op = paths[path][method]
    responses = op["responses"]
    assert status_code in responses, f"Status {status_code} not in {path} {method}"
    content = responses[status_code].get("content", {})
    if not content:
        return None
    return content["application/json"]["schema"]


def _resolve_ref(openapi, ref: str) -> dict:
    """Resolve a $ref like '#/components/schemas/Foo'."""
    parts = ref.lstrip("#/").split("/")
    node = openapi
    for p in parts:
        node = node[p]
    return node


class TestOpenAPIContractsHaveResponseModels:
    """Endpoints refactored in S4.4 must have a Pydantic-based response schema."""

    def test_billing_get_check_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/billing/check/{check_id}", "get")
        # $ref means FastAPI generated a named schema instead of inline-any.
        assert schema is not None
        assert "$ref" in schema, f"Expected $ref, got: {schema}"
        assert "BillingCheckGetOutput" in schema["$ref"]

    def test_cash_open_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/cash/open", "post", "201")
        assert schema is not None and "$ref" in schema
        assert "CashSessionOpenOutput" in schema["$ref"]

    def test_cash_movement_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/cash/movement", "post", "201")
        assert schema is not None and "$ref" in schema
        assert "CashMovementOutput" in schema["$ref"]

    def test_cash_close_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/cash/close", "post")
        assert schema is not None and "$ref" in schema
        assert "CashSessionCloseOutput" in schema["$ref"]

    def test_cash_current_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/cash/current", "get")
        assert schema is not None and "$ref" in schema
        assert "CashCurrentSessionOutput" in schema["$ref"]

    def test_cash_sessions_list_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/cash/sessions", "get")
        # list[X] becomes {"type": "array", "items": {"$ref": "..."}}
        assert schema is not None
        assert schema.get("type") == "array"
        assert "$ref" in schema["items"]
        assert "CashSessionHistoryItem" in schema["items"]["$ref"]

    def test_tips_record_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/tips", "post", "201")
        assert schema is not None and "$ref" in schema
        assert "TipRecordOutput" in schema["$ref"]

    def test_tips_list_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/admin/tips", "get")
        assert schema is not None
        assert schema.get("type") == "array"
        assert "TipListItemOutput" in schema["items"]["$ref"]

    def test_data_export_customer_uses_pydantic_schema(self, openapi_schema):
        # Note: path is prefixed by /api/admin
        schema = _get_response_schema(openapi_schema, "/api/admin/data-export/customer/{customer_id}", "get")
        assert schema is not None and "$ref" in schema
        assert "CustomerDataExportOutput" in schema["$ref"]

    def test_notifications_subscribe_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/waiter/notifications/subscribe", "post")
        assert schema is not None and "$ref" in schema
        assert "PushSubscribeOutput" in schema["$ref"]

    def test_notifications_unsubscribe_uses_pydantic_schema(self, openapi_schema):
        schema = _get_response_schema(openapi_schema, "/api/waiter/notifications/unsubscribe", "delete")
        assert schema is not None and "$ref" in schema
        assert "PushUnsubscribeOutput" in schema["$ref"]


class TestBackwardCompatibility:
    """Verify schemas accept the *exact* shape produced by the endpoint code.

    These mirror the dict literals from the endpoint return statements.
    If a field changes here, the schema is out of sync with the endpoint.
    """

    def test_billing_get_check_matches_endpoint_dict(self):
        # Mirrors backend/rest_api/routers/billing/routes.py:545
        endpoint_return = {
            "id": 1,
            "session_id": 1,
            "status": "OPEN",
            "total_cents": 10000,
            "paid_cents": 0,
            "remaining_cents": 10000,
            "created_at": "2025-01-01T00:00:00+00:00",
            "payments": [
                {
                    "id": 1, "provider": "CASH", "status": "APPROVED",
                    "amount_cents": 0, "created_at": "2025-01-01T00:00:00+00:00",
                }
            ],
        }
        # Must not raise.
        BillingCheckGetOutput.model_validate(endpoint_return)

    def test_cash_movement_matches_endpoint_dict(self):
        # Mirrors backend/rest_api/routers/admin/cash_register.py:119
        endpoint_return = {
            "id": 1, "movement_type": "SALE", "amount_cents": 100,
            "payment_method": "CASH", "description": "venta",
            "created_at": "2025-01-01T00:00:00",
        }
        CashMovementOutput.model_validate(endpoint_return)

    def test_data_export_matches_endpoint_dict(self):
        # Mirrors backend/rest_api/routers/admin/data_export.py:66 (minimal).
        endpoint_return = {
            "export_metadata": {
                "exported_at": "2025-01-01T00:00:00",
                "exported_by_user_id": 1, "tenant_id": 1,
                "customer_id": 100, "format_version": "1.0",
            },
            "profile": {
                "id": 100, "name": "X", "email": "x@x.com", "phone": "0",
                "device_id": None, "dietary_preferences": None,
                "allergen_ids": None, "preferred_language": "es",
                "notes": None, "loyalty_points": 0, "loyalty_tier": "BRONZE",
                "total_visits": 0, "total_spent_cents": 0,
                "last_visit_at": None, "marketing_consent": False,
                "data_consent": False, "consent_date": None,
                "is_active": True, "created_at": "2025-01-01T00:00:00",
            },
            "visits": [],
            "loyalty_transactions": [],
        }
        CustomerDataExportOutput.model_validate(endpoint_return)
