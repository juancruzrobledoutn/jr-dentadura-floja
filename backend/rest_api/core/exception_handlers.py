"""
Global FastAPI exception handlers (S4.2 — Exception handling unificado).

This module registers application-wide exception handlers so domain exceptions
defined in ``shared.utils.exceptions`` are mapped to JSON responses with the
correct HTTP status code WITHOUT requiring each router to wrap calls in
``try/except`` blocks that simply re-package the same exception.

Background
----------
``AppException`` (and all its subclasses: ``NotFoundError``, ``ForbiddenError``,
``ValidationError``, ``ConflictError``, ``InternalError``, ``ExternalServiceError``,
``RateLimitError``) already inherit from ``fastapi.HTTPException``. FastAPI's
default ``http_exception_handler`` already propagates those correctly. The
handlers below add three things on top of that:

1. A *type* discriminator in the response body so the frontend can react to
   the kind of error without parsing the localized ``detail`` string.
2. A catch-all for non-HTTP ``Exception`` instances so we never leak a stack
   trace in production responses (returns a generic 500).
3. A central place to evolve error shape if needed.

Response shape
--------------
All handlers return ``{"detail": "...", "type": "..."}``. Tests and frontends
that already look at ``response.json()["detail"]`` keep working — the ``type``
field is purely additive.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from shared.config.logging import rest_api_logger as logger
from shared.config.settings import settings
from shared.utils.exceptions import (
    AppException,
    ExternalServiceError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)


def _error_response(status_code: int, detail: str, error_type: str) -> JSONResponse:
    """Build the canonical error response payload."""
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "type": error_type},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application.

    Specific handlers MUST be registered before more generic ones. FastAPI
    resolves the handler by walking the exception's MRO and picking the most
    specific match, but registering specific-first also keeps the intent
    obvious to readers.
    """

    # ------------------------------------------------------------------
    # Domain exceptions — specific handlers first
    # ------------------------------------------------------------------
    @app.exception_handler(NotFoundError)
    async def not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
        # NotFoundError already logs itself on construction (AppException.__init__)
        return _error_response(
            status_code=exc.status_code,
            detail=str(exc.detail),
            error_type="not_found",
        )

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(_request: Request, exc: ForbiddenError) -> JSONResponse:
        return _error_response(
            status_code=exc.status_code,
            detail=str(exc.detail),
            error_type="forbidden",
        )

    @app.exception_handler(ValidationError)
    async def validation_handler(_request: Request, exc: ValidationError) -> JSONResponse:
        return _error_response(
            status_code=exc.status_code,
            detail=str(exc.detail),
            error_type="validation",
        )

    @app.exception_handler(ExternalServiceError)
    async def external_service_handler(
        _request: Request, exc: ExternalServiceError
    ) -> JSONResponse:
        # Honor Retry-After if the exception set it
        headers = exc.headers or {}
        response = _error_response(
            status_code=exc.status_code,
            detail=str(exc.detail),
            error_type="external_service",
        )
        for k, v in headers.items():
            response.headers[k] = v
        return response

    # Catch-all for any other AppException subclass (ConflictError,
    # InternalError, RateLimitError, etc.). Must be registered AFTER the
    # specific handlers so they win the dispatch race.
    @app.exception_handler(AppException)
    async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
        headers = exc.headers or {}
        response = _error_response(
            status_code=exc.status_code,
            detail=str(exc.detail),
            error_type=type(exc).__name__.lower().replace("error", ""),
        )
        for k, v in headers.items():
            response.headers[k] = v
        return response

    # ------------------------------------------------------------------
    # Last-resort handler for non-HTTP exceptions
    # ------------------------------------------------------------------
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch unexpected, non-HTTP exceptions and return a sanitized 500.

        We deliberately do NOT include the exception message in production
        responses — it may contain internal details (SQL text, file paths, etc.).
        The full traceback is logged for operators.
        """
        # FastAPI's default HTTP exception path already handled HTTPException
        # subclasses; we only land here for genuinely uncaught errors.
        logger.error(
            "Unhandled exception in request",
            path=str(request.url.path),
            method=request.method,
            exc_type=type(exc).__name__,
            error=str(exc),
            exc_info=True,
        )

        # In dev/test surface the message to make debugging easier; in
        # production return a generic message to avoid leaking internals.
        if settings.environment in {"development", "test"} and settings.debug:
            detail = f"Internal server error: {type(exc).__name__}: {exc}"
        else:
            detail = "Error interno del servidor"

        return _error_response(
            status_code=500,
            detail=detail,
            error_type="internal",
        )
