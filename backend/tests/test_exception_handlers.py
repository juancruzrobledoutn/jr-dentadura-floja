"""
Tests for the global FastAPI exception handlers registered in
``rest_api.core.exception_handlers``.

These tests build a standalone FastAPI app with the handlers attached and a
set of dummy routes that raise each kind of exception, so we can verify the
status code and JSON shape without needing the full DB stack.

S4.2 — Exception handling unificado.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from rest_api.core.exception_handlers import register_exception_handlers
from shared.utils.exceptions import (
    AlreadyPaidError,
    ConflictError,
    ExternalServiceError,
    ForbiddenError,
    InternalError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)


# ---------------------------------------------------------------------------
# App fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def app_with_handlers() -> FastAPI:
    """Build a FastAPI app with handlers + dummy routes covering all branches."""
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/raise/not-found")
    def _raise_not_found():
        raise NotFoundError("Producto", 42)

    @app.get("/raise/forbidden")
    def _raise_forbidden():
        raise ForbiddenError("eliminar productos")

    @app.get("/raise/validation")
    def _raise_validation():
        raise ValidationError("El precio debe ser positivo")

    @app.get("/raise/external-unavailable")
    def _raise_external_unavailable():
        raise ExternalServiceError("MercadoPago", is_unavailable=True, retry_after=30)

    @app.get("/raise/external-bad-gateway")
    def _raise_external_bad_gateway():
        raise ExternalServiceError("AFIP", is_unavailable=False)

    @app.get("/raise/conflict")
    def _raise_conflict():
        # ConflictError is an AppException -> caught by the AppException handler
        raise ConflictError("La mesa ya tiene una sesión activa")

    @app.get("/raise/already-paid")
    def _raise_already_paid():
        raise AlreadyPaidError(123)

    @app.get("/raise/internal")
    def _raise_internal():
        raise InternalError("Failed to process payment")

    @app.get("/raise/rate-limit")
    def _raise_rate_limit():
        raise RateLimitError(retry_after=15, context="Login")

    @app.get("/raise/generic")
    def _raise_generic():
        # Non-HTTP exception: caught by last-resort handler
        raise RuntimeError("simulated crash with sensitive details")

    return app


@pytest.fixture(scope="module")
def client(app_with_handlers: FastAPI) -> TestClient:
    return TestClient(app_with_handlers, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Domain exception tests
# ---------------------------------------------------------------------------

def test_not_found_error_maps_to_404(client: TestClient) -> None:
    response = client.get("/raise/not-found")
    assert response.status_code == 404
    body = response.json()
    assert "detail" in body
    assert body["type"] == "not_found"
    # The domain message must be preserved
    assert "42" in body["detail"]


def test_forbidden_error_maps_to_403(client: TestClient) -> None:
    response = client.get("/raise/forbidden")
    assert response.status_code == 403
    body = response.json()
    assert body["type"] == "forbidden"
    assert "eliminar productos" in body["detail"]


def test_validation_error_maps_to_400(client: TestClient) -> None:
    response = client.get("/raise/validation")
    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "validation"
    assert "precio" in body["detail"].lower()


def test_external_service_unavailable_maps_to_503_with_retry_after(client: TestClient) -> None:
    response = client.get("/raise/external-unavailable")
    assert response.status_code == 503
    body = response.json()
    assert body["type"] == "external_service"
    assert "MercadoPago" in body["detail"]
    # The original exception sets Retry-After; the handler must propagate it.
    assert response.headers.get("retry-after") == "30"


def test_external_service_bad_gateway_maps_to_502(client: TestClient) -> None:
    response = client.get("/raise/external-bad-gateway")
    assert response.status_code == 502
    body = response.json()
    assert body["type"] == "external_service"
    assert "AFIP" in body["detail"]


# ---------------------------------------------------------------------------
# AppException catch-all
# ---------------------------------------------------------------------------

def test_conflict_error_maps_to_409_via_app_handler(client: TestClient) -> None:
    response = client.get("/raise/conflict")
    assert response.status_code == 409
    body = response.json()
    # type comes from class name lowered + "error" suffix removed
    assert body["type"] == "conflict"
    assert "sesión activa" in body["detail"]


def test_already_paid_error_maps_to_409(client: TestClient) -> None:
    # AlreadyPaidError inherits from ConflictError -> AppException
    response = client.get("/raise/already-paid")
    assert response.status_code == 409
    body = response.json()
    # AlreadyPaidError is not a specific handler, so it falls through to
    # AppException. The class-based type discriminator should be derived.
    assert body["type"] in {"alreadypaid", "conflict"}
    assert "123" in body["detail"]


def test_internal_error_maps_to_500_via_app_handler(client: TestClient) -> None:
    response = client.get("/raise/internal")
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "internal"
    assert "process payment" in body["detail"].lower()


def test_rate_limit_error_propagates_retry_after(client: TestClient) -> None:
    response = client.get("/raise/rate-limit")
    assert response.status_code == 429
    assert response.headers.get("retry-after") == "15"
    body = response.json()
    assert "Login" in body["detail"]


# ---------------------------------------------------------------------------
# Last-resort handler for non-HTTP exceptions
# ---------------------------------------------------------------------------

def test_generic_exception_returns_500_without_leaking_details(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generic Exception in production env returns sanitized 500."""
    from shared.config import settings as settings_module

    # Force production-like settings: detail must NOT include the runtime message
    monkeypatch.setattr(settings_module, "environment", "production")
    monkeypatch.setattr(settings_module, "debug", False)

    response = client.get("/raise/generic")
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "internal"
    # MUST NOT leak the runtime exception message
    assert "simulated crash" not in body["detail"]
    assert "sensitive" not in body["detail"]
    # Generic Spanish message is acceptable
    assert "Error interno" in body["detail"]


def test_generic_exception_in_dev_includes_debug_info(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """In development with debug=True, exception type/message are surfaced."""
    from shared.config import settings as settings_module

    monkeypatch.setattr(settings_module, "environment", "development")
    monkeypatch.setattr(settings_module, "debug", True)

    response = client.get("/raise/generic")
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "internal"
    assert "RuntimeError" in body["detail"]


# ---------------------------------------------------------------------------
# Regression: response shape stays backward compatible
# ---------------------------------------------------------------------------

def test_response_always_contains_detail_key(client: TestClient) -> None:
    """Frontends parse response.json()['detail']. The shape must stay stable."""
    for path in [
        "/raise/not-found",
        "/raise/forbidden",
        "/raise/validation",
        "/raise/conflict",
        "/raise/internal",
    ]:
        response = client.get(path)
        body = response.json()
        assert "detail" in body, f"Missing 'detail' in response for {path}"
        assert isinstance(body["detail"], str)
        # Additional discriminator is allowed but not required by frontends
        assert "type" in body
