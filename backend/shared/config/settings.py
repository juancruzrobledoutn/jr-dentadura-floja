"""
Application settings loaded from environment variables.
Uses pydantic-settings for type-safe configuration.
"""

from functools import lru_cache
import os
import secrets as _secrets
from pydantic import model_validator
from pydantic_settings import BaseSettings


# S3.2 — Environments considered "protected" (strict secret validation).
# Anything in this set MUST provide all required secrets explicitly via env vars,
# otherwise `validate_production_secrets()` returns errors and lifespan refuses
# to start the app.
_PROTECTED_ENVIRONMENTS = frozenset({"production", "prod", "staging"})

# S3.2 — Environments where missing secrets are auto-generated (ephemeral,
# in-memory, never persisted) with a warning. Keeps dev/test ergonomic.
_DEV_LIKE_ENVIRONMENTS = frozenset({"dev", "development", "test", "testing", "local"})

# S3.2 — Minimum length for symmetric secrets (JWT_SECRET, TABLE_TOKEN_SECRET).
# 32 chars matches industry baseline (256 bits of entropy when hex-encoded).
_MIN_SECRET_LENGTH = 32

# S3.2 — Known insecure default values that have ever appeared in this codebase
# or example .env files. If any of these is present in a protected environment,
# the deployment is rejected — they indicate the operator forgot to set the real
# secret. The empty string is also included (covers the new default).
_KNOWN_INSECURE_DEFAULTS: frozenset[str] = frozenset({
    "",
    "dev-secret-change-me-in-production",
    "table-token-secret-change-me",
    "changeme",
    "change-me",
    "secret",
    "password",
    "default",
    "your-secret-here",
    "CHANGE_ME",
})


class Settings(BaseSettings):
    """Application settings with defaults for development."""

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/menu_ops"

    # Redis
    # Default matches docker-compose.yml which exposes Redis on 6380
    redis_url: str = "redis://localhost:6380"

    # JWT Configuration
    # S3.2 — Default is empty: no functional fallback. In protected environments
    # (production/prod/staging) the app refuses to start. In dev/test the
    # `_ensure_dev_secrets` model_validator generates an ephemeral random value.
    jwt_secret: str = ""
    jwt_issuer: str = "menu-ops"
    jwt_audience: str = "menu-ops-users"
    # SEC-01: Short-lived access tokens (15 min) reduce window of exposure if token is compromised
    # Refresh tokens (7 days) allow seamless re-authentication without user intervention
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    # SEC-09: HttpOnly Cookie settings for refresh token
    # secure=True requires HTTPS (automatically False in development)
    # samesite="lax" allows cookies on top-level navigation (good balance of security/usability)
    cookie_secure: bool = False  # Set to True in production (.env)
    cookie_samesite: str = "lax"  # "lax" or "strict"
    cookie_domain: str = ""  # Empty = current domain only, set for cross-subdomain

    # S1.2 — Refresh token migration to cookie-only (DEPRECATED FLAG).
    # All three frontends (Dashboard, pwaWaiter, pwaMenu) are migrated and rely
    # exclusively on the HttpOnly cookie set by the backend. The default is now
    # False — `refresh_token` is NEVER returned in the response body of
    # /auth/login or /auth/refresh under normal operation.
    # The flag is retained (rather than dropped) as an emergency rollback knob:
    # set LEGACY_REFRESH_IN_BODY=true via env if a stale frontend deployment
    # is discovered post-migration. It will be removed entirely in a future
    # version once we have confidence no clients need it.
    legacy_refresh_in_body: bool = False

    # Table Token (HMAC for diner authentication)
    # S3.2 — Default is empty: see jwt_secret rationale.
    table_token_secret: str = ""
    # CRIT-04 FIX: Reduced from 8h to 3h to limit token exposure window
    jwt_table_token_expire_hours: int = 3

    # S1.3 — Legacy HMAC table tokens deprecation. Default True for backward compat.
    # When True, `verify_table_token()` falls back to the legacy HMAC verifier if the
    # token does not parse as a JWT (3-segment dot-separated format). Each acceptance
    # is logged with a DEPRECATION warning so operators can identify legacy clients.
    # Set to False once all clients (pwaMenu) emit JWT-format table tokens; then HMAC
    # legacy tokens are rejected with 401. Will be removed in a future version once
    # the legacy verifier is dropped entirely.
    allow_legacy_table_tokens: bool = True

    # S3.1 — AFIP electronic invoicing mode.
    # Possible values:
    #   "stub"       (default) Simulated CAE for dev/test. Refuses to run if
    #                ENVIRONMENT=production (raises 503 at request time AND
    #                validate_production_secrets() blocks startup).
    #   "production" Real AFIP WSFE call (requires pyafipws + AFIP certificates).
    #                NOT YET IMPLEMENTED in this codebase — `_call_afip_wsfe` raises
    #                NotImplementedError until the real integration ships.
    # Defaulting to "stub" is explicit: a deployment must opt-in to production AFIP.
    afip_environment: str = "stub"

    # S1.1.A — TOTP secret encryption at rest (Fernet AES-128-CBC + HMAC-SHA256).
    # 32-byte URL-safe base64 key. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # REQUIRED in production. Optional in dev (2FA features fail if missing).
    totp_encryption_key: str = ""

    # CRIT-03 FIX: CORS configuration for production
    # Comma-separated list of allowed origins (empty uses default localhost list)
    allowed_origins: str = ""

    # Ollama (RAG)
    ollama_url: str = "http://localhost:11434"
    embed_model: str = "nomic-embed-text"
    chat_model: str = "qwen2.5:7b"

    # Mercado Pago
    mercadopago_access_token: str = ""
    mercadopago_webhook_secret: str = ""
    mercadopago_notification_url: str = ""

    # Server ports
    rest_api_port: int = 8000
    ws_gateway_port: int = 8001

    # Base URL for payment redirects
    base_url: str = "http://localhost:5176"

    # SMTP (optional — email is no-op if not configured)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Environment
    environment: str = "development"
    debug: bool = True

    # Rate limiting - SHARED-LOW-01 FIX: Moved from hardcoded values
    login_rate_limit: int = 5  # Max login attempts per window
    login_rate_window: int = 60  # Window in seconds

    # WebSocket - WS-MED-02 FIX: Moved from hardcoded values
    # LOAD-LEVEL1: Reduced per-user limit to control total connections
    ws_max_connections_per_user: int = 3  # Was 5, reduced to limit total connections
    ws_heartbeat_timeout: int = 60  # Consider connection dead after this many seconds
    ws_max_message_size: int = 64 * 1024  # 64 KB
    # LOAD-LEVEL2: Global connection limit to prevent resource exhaustion
    # SCALE-CONFIG: Adjusted for 100-table/20-waiter branch (~430 connections + margin)
    ws_max_total_connections: int = 500  # Maximum total WebSocket connections
    # LOAD-LEVEL2: Rate limiting for WebSocket messages
    ws_message_rate_limit: int = 30  # Max messages per window per connection
    ws_message_rate_window: int = 1  # Window in seconds
    # LOAD-LEVEL2: Broadcast optimization
    ws_broadcast_batch_size: int = 50  # Connections to send to in parallel
    # HIGH-WS-01 FIX: Configurable callback timeout for event processing
    ws_event_callback_timeout: int = 5  # Timeout in seconds for event callbacks

    # Redis - REDIS-MED-03 FIX: Moved from hardcoded values
    # LOAD-LEVEL1: Increased pool sizes for 400+ users
    redis_pool_max_connections: int = 50  # Was 20, increased for higher concurrency
    redis_sync_pool_max_connections: int = 20  # New: Pool for sync operations
    redis_socket_timeout: int = 5  # Socket timeout in seconds (for both connect and read/write)
    # MED-WS-03 FIX: Reduced from 100 to 20 - with exponential backoff, this is ~10 min of retries
    redis_max_reconnect_attempts: int = 20  # Max reconnection attempts for subscriber
    # LOAD-LEVEL1: Queue and batch sizes for event processing
    # SCALE-CONFIG: Reduced from 5000 to 500 for 100-table branch
    redis_event_queue_size: int = 500  # Sufficient for ~430 connections
    redis_event_batch_size: int = 50  # Was 10, increased for faster processing
    redis_publish_max_retries: int = 3  # Max retries for event publishing
    redis_publish_retry_delay: float = 0.1  # Delay between retries in seconds
    # HIGH-05 FIX: Configurable timeouts for pubsub operations
    redis_pubsub_cleanup_timeout: float = 5.0  # Timeout for pubsub cleanup operations (unsubscribe/close)
    redis_pubsub_reconnect_total_timeout: float = 15.0  # Total timeout for reconnection attempts
    # MED-01 FIX: Event processing order configuration
    redis_event_strict_ordering: bool = False  # If True, retried events go to front of queue (strict FIFO)
    redis_event_staleness_threshold: float = 5.0  # Warn if event waited > N seconds in queue

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @model_validator(mode="after")
    def _ensure_dev_secrets(self) -> "Settings":
        """
        S3.2 — Dev/test ergonomics: if running under a dev-like environment
        and a symmetric secret is empty, generate an ephemeral random value
        in memory so the app can boot. The value does NOT persist across
        restarts; operators wanting stable dev tokens must set the env var.

        IMPORTANT: this branch runs ONLY for environments in
        `_DEV_LIKE_ENVIRONMENTS`. Protected environments (production / prod /
        staging) are left untouched — they will fail validation later in
        `validate_production_secrets()` which lifespan.py converts to a
        startup RuntimeError.

        Logging note: we use stdlib `logging` here on purpose. This validator
        runs during `Settings()` construction, which happens at module import
        time of `shared.config.settings`. Our structured logger
        (`shared.config.logging.get_logger`) imports `settings` to read
        `settings.debug`, so importing it here would create a circular import.
        """
        if self.environment in _DEV_LIKE_ENVIRONMENTS:
            generated: list[str] = []

            if not self.jwt_secret:
                # token_urlsafe(48) yields 64 chars (well above 32-char minimum).
                self.jwt_secret = _secrets.token_urlsafe(48)
                generated.append("JWT_SECRET")

            if not self.table_token_secret:
                self.table_token_secret = _secrets.token_urlsafe(48)
                generated.append("TABLE_TOKEN_SECRET")

            if generated:
                import logging as _stdlib_logging  # noqa: WPS433
                _stdlib_logging.getLogger("shared.config.settings").warning(
                    "S3.2: Generated ephemeral %s for environment=%r. "
                    "These secrets do NOT persist across restarts — set them "
                    "explicitly in .env for stable tokens.",
                    ", ".join(generated),
                    self.environment,
                )

        return self

    @staticmethod
    def _known_insecure_defaults() -> frozenset[str]:
        """
        S3.2 — Strings that were ever defaults or are common placeholders.
        These must NEVER appear as actual secrets in protected environments.

        Exposed as a method (not just the module constant) so tests and other
        modules can assert against the exact list without depending on the
        private symbol.
        """
        return _KNOWN_INSECURE_DEFAULTS

    def _validate_symmetric_secret(
        self,
        name: str,
        value: str,
        errors: list[str],
    ) -> None:
        """
        S3.2 — Apply the three protected-environment checks to a symmetric
        secret (JWT_SECRET, TABLE_TOKEN_SECRET):
          1. Must not be empty.
          2. Must not be a known insecure default value.
          3. Must be at least `_MIN_SECRET_LENGTH` characters long.

        Failures append a precise message to `errors`. Returns nothing.
        """
        if not value:
            errors.append(
                f"{name} must be set in production/staging environments "
                "(empty value is rejected)."
            )
            return
        if value in self._known_insecure_defaults():
            errors.append(
                f"{name} is using a known insecure default value. "
                "Generate a real secret with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
            return
        if len(value) < _MIN_SECRET_LENGTH:
            errors.append(
                f"{name} must be at least {_MIN_SECRET_LENGTH} characters "
                f"(got {len(value)})."
            )

    def validate_production_secrets(self) -> list[str]:
        """
        SHARED-CRIT-03 FIX / S3.2: Validate that secrets are properly configured
        for non-dev environments. Returns a list of validation errors. Empty list
        means all checks pass.

        S3.2 — Broadened to cover production, prod, AND staging environments.
        Previously only an exact match on "production" triggered validation,
        which allowed `ENVIRONMENT=staging` or `ENVIRONMENT=prod` to boot with
        dev defaults.
        """
        errors: list[str] = []

        # S3.2 — Any "protected" environment must be fully configured.
        is_protected = self.environment in _PROTECTED_ENVIRONMENTS

        if is_protected:
            # Symmetric secrets (JWT + table token): empty / weak / short → error.
            self._validate_symmetric_secret(
                "JWT_SECRET", self.jwt_secret, errors,
            )
            self._validate_symmetric_secret(
                "TABLE_TOKEN_SECRET", self.table_token_secret, errors,
            )

            # Check debug is disabled
            if self.debug:
                errors.append("DEBUG must be False in production")

            # Check Mercado Pago if using payments
            if self.mercadopago_access_token and not self.mercadopago_webhook_secret:
                errors.append(
                    "MERCADOPAGO_WEBHOOK_SECRET must be set when using Mercado Pago"
                )

            # CRIT-03 FIX: Check CORS is configured for production
            if not self.allowed_origins:
                errors.append(
                    "ALLOWED_ORIGINS must be set in production (comma-separated list of allowed domains)"
                )

            # S1.1.A — TOTP encryption key MUST be set & valid in production
            if not self.totp_encryption_key:
                errors.append("TOTP_ENCRYPTION_KEY must be set in production")
            else:
                # Import locally to avoid circular dependency at module load time
                try:
                    from cryptography.fernet import Fernet  # noqa: WPS433
                    Fernet(self.totp_encryption_key.encode())
                except Exception:
                    errors.append(
                        "TOTP_ENCRYPTION_KEY must be a valid 32-byte URL-safe base64 Fernet key"
                    )

        # S1.2 — Warn (not fail-fast) when legacy refresh-in-body is enabled in production.
        # This is intentionally a non-blocking warning during the migration period: returning
        # the refresh token in the body remains the default while frontends transition to
        # the HttpOnly cookie. Once migration is complete, the default flips to False and
        # eventually this branch will become an error.
        if self.environment in ("production", "prod") and self.legacy_refresh_in_body:
            # Use logging directly here — `validate_production_secrets` is called from
            # lifespan.py BEFORE setup_logging() has finished wiring our structured logger,
            # so we use stdlib logging to avoid coupling and circular imports.
            import logging  # noqa: WPS433
            logging.getLogger("shared.config.settings").warning(
                "LEGACY_REFRESH_IN_BODY=True in production — refresh tokens are exposed in "
                "response body. This is deprecated. Migrate frontends to cookie-only and "
                "set LEGACY_REFRESH_IN_BODY=False."
            )

        # S3.1 — AFIP must be in production mode when ENVIRONMENT is production.
        # The stub returns a fake CAE ("00000000000000") which would be sent to real
        # customers and reported to AFIP as authoritative. AFIP penalises invalid CAEs
        # and the fiscal liability is on the restaurant. Fail-fast at boot.
        if self.environment in ("production", "prod") and self.afip_environment != "production":
            errors.append(
                "AFIP_ENVIRONMENT must be 'production' when ENVIRONMENT is production. "
                f"Current value '{self.afip_environment}' would emit fake CAEs to real "
                "customers. Configure pyafipws + AFIP certificates and set "
                "AFIP_ENVIRONMENT=production, or block this deployment."
            )

        # S1.3 — Warn (not fail-fast) when legacy HMAC table tokens are accepted in production.
        # HMAC legacy tokens lack iss/aud/jti and cannot be revoked, so they are a residual
        # fraud vector if any client device retained one. We keep accepting them by default
        # during the migration period so the cutover does not break in-flight pwaMenu sessions.
        # Cutover plan: monitor backend logs for "DEPRECATED: legacy HMAC table token accepted"
        # entries; once 1 week of zero such logs, set ALLOW_LEGACY_TABLE_TOKENS=False.
        if self.environment in ("production", "prod") and self.allow_legacy_table_tokens:
            import logging as _stdlib_logging  # noqa: WPS433
            _stdlib_logging.getLogger("shared.config.settings").warning(
                "ALLOW_LEGACY_TABLE_TOKENS=True in production — HMAC legacy table tokens are "
                "accepted. They are unrevocable and lack issuer/audience claims. This is "
                "deprecated. Regenerate all table tokens via JWT and set "
                "ALLOW_LEGACY_TABLE_TOKENS=False."
            )

        return errors


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience exports
settings = get_settings()

# Direct access to commonly used settings
DATABASE_URL = settings.database_url
REDIS_URL = settings.redis_url
JWT_SECRET = settings.jwt_secret
JWT_ISSUER = settings.jwt_issuer
JWT_AUDIENCE = settings.jwt_audience
TABLE_TOKEN_SECRET = settings.table_token_secret
OLLAMA_URL = settings.ollama_url
EMBED_MODEL = settings.embed_model
CHAT_MODEL = settings.chat_model
