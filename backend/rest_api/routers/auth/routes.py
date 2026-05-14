"""
Authentication router.
Handles login and token refresh.
"""

from typing import Optional
from fastapi import APIRouter, Cookie, Depends, HTTPException, status, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select

from shared.infrastructure.db import get_db
from rest_api.models import User, UserBranchRole, Branch
from shared.security.auth import sign_jwt, sign_refresh_token, verify_refresh_token
from shared.config.logging import rest_api_logger as logger, mask_email
from shared.utils.schemas import LoginRequest, LoginResponse, UserInfo, RefreshTokenRequest
from shared.config.settings import settings
from shared.security.rate_limit import limiter, set_rate_limit_email, check_email_rate_limit_sync
from shared.security.password import verify_password, needs_rehash, hash_password
from shared.security.token_blacklist import revoke_all_user_tokens, blacklist_token_sync, is_token_blacklisted_sync
from shared.security.auth import current_user_context
from rest_api.services.auth.totp_helper import (
    get_totp_secret,
    set_new_totp_secret,
    clear_totp_secret,
    is_2fa_enabled,
    is_2fa_pending,
    get_pending_setup_secret,
    set_pending_setup_secret,
)
from rest_api.services.auth.backup_codes import (
    BACKUP_CODE_COUNT,
    clear_all_codes,
    generate_backup_codes,
    remaining_codes_count,
    verify_and_consume_backup_code,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


# =============================================================================
# SEC-09: HttpOnly Cookie Helper
# =============================================================================

def set_refresh_token_cookie(response: Response, refresh_token: str) -> None:
    """
    SEC-09: Set refresh token as HttpOnly cookie with security flags.

    - httponly: Cannot be accessed by JavaScript (XSS protection)
    - secure: Only sent over HTTPS (configurable for dev)
    - samesite: CSRF protection (lax allows top-level navigation)
    - path: Only sent to /api/auth endpoints
    - max_age: 7 days (matches refresh token expiry)
    """
    max_age_seconds = settings.jwt_refresh_token_expire_days * 24 * 60 * 60

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=max_age_seconds,
        path="/api/auth",
        domain=settings.cookie_domain or None,
    )


def clear_refresh_token_cookie(response: Response) -> None:
    """SEC-09: Clear refresh token cookie on logout."""
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth",
        domain=settings.cookie_domain or None,
    )


class LogoutResponse(BaseModel):
    """Response for logout."""
    success: bool
    message: str


class TokenRefreshResponse(BaseModel):
    """Response for token refresh with rotated refresh token.

    S1.2: `refresh_token` is DEPRECATED in the response body. The token is always
    set as an HttpOnly cookie. This field is only populated when the
    `LEGACY_REFRESH_IN_BODY` setting is True (default during migration).
    When the flag is False the field is omitted (null) — clients MUST rely on the
    cookie (use `credentials: "include"` on fetch).
    """
    access_token: str
    # SEC-06: Always rotate refresh token (cookie is always set).
    # S1.2: Optional in body — see class docstring.
    refresh_token: Optional[str] = Field(
        default=None,
        description=(
            "DEPRECATED — refresh token is also set as an HttpOnly cookie. "
            "This field will be removed when LEGACY_REFRESH_IN_BODY=False is enforced."
        ),
    )
    token_type: str = "Bearer"
    expires_in: int


class LoginWithRefreshResponse(LoginResponse):
    """Login response including refresh token.

    S1.2: `refresh_token` is DEPRECATED in the response body. See TokenRefreshResponse.
    """
    # S1.2: Optional in body — only populated when LEGACY_REFRESH_IN_BODY=True.
    refresh_token: Optional[str] = Field(
        default=None,
        description=(
            "DEPRECATED — refresh token is also set as an HttpOnly cookie. "
            "This field will be removed when LEGACY_REFRESH_IN_BODY=False is enforced."
        ),
    )
    requires_2fa: bool = False  # True when user has 2FA and no code was provided


@router.post("/login", response_model=LoginWithRefreshResponse)
@limiter.limit("5/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)) -> LoginWithRefreshResponse:
    """
    Authenticate a staff member and return access + refresh tokens.

    The access token contains:
    - sub: user ID
    - tenant_id: restaurant tenant ID
    - branch_ids: list of branches the user has access to
    - roles: list of roles the user has
    - email: user's email

    The refresh token can be used to obtain new access tokens.

    CRIT-AUTH-02 FIX: Rate limited by both IP (5/min via slowapi) and
    email (5/min via Redis) to prevent credential stuffing attacks.
    QA-HIGH-01 FIX: Email-based rate limiting using Redis INCR with TTL.
    """
    # QA-HIGH-01 FIX: Check email-based rate limit using Redis
    check_email_rate_limit_sync(body.email)

    # Track email for logging purposes
    set_rate_limit_email(request, body.email)

    # Find user by email
    user = db.scalar(
        select(User).where(User.email == body.email, User.is_active.is_(True))
    )

    if not user:
        # HIGH-AUTH-05 FIX: Log failed login attempt (user not found)
        # SHARED-HIGH-02 FIX: Mask email to protect PII
        logger.warning("LOGIN_FAILED: User not found", email=mask_email(body.email))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verify password using bcrypt (supports legacy plain-text during migration)
    if not verify_password(body.password, user.password):
        # HIGH-AUTH-05 FIX: Log failed login attempt (wrong password)
        # SHARED-HIGH-02 FIX: Mask email to protect PII
        logger.warning("LOGIN_FAILED: Invalid password", email=mask_email(body.email), user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Rehash password if using legacy plain-text or outdated bcrypt rounds
    if needs_rehash(user.password):
        user.password = hash_password(body.password)
        db.commit()

    # Get user's roles and branches
    branch_roles = db.execute(
        select(UserBranchRole).where(UserBranchRole.user_id == user.id)
    ).scalars().all()

    branch_ids = sorted({r.branch_id for r in branch_roles})
    roles = sorted({r.role for r in branch_roles})

    if not branch_ids:
        # SHARED-HIGH-02 FIX: Mask email to protect PII
        logger.warning("LOGIN_FAILED: No branch assignments", email=mask_email(body.email), user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no branch assignments",
        )

    # CRIT-AUTH-05 FIX: Validate tenant isolation - all branches must belong to user's tenant
    branches = db.execute(
        select(Branch).where(Branch.id.in_(branch_ids))
    ).scalars().all()

    for branch in branches:
        if branch.tenant_id != user.tenant_id:
            logger.error(
                "SECURITY: Tenant isolation violation detected",
                user_id=user.id,
                user_tenant_id=user.tenant_id,
                branch_id=branch.id,
                branch_tenant_id=branch.tenant_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security error: tenant isolation violation",
            )

    # 2FA check: if user has TOTP enabled (ignore pending setup), verify code
    # S1.1.B: dual-read — encrypted column preferred, plain fallback with lazy migration.
    # S1.4: accept a `backup_code` as a single-use alternative to `totp_code`.
    #
    # PRECEDENCE: this endpoint accepts EITHER `totp_code` OR `backup_code`.
    # When both are provided, TOTP takes precedence: the backup_code is NOT
    # consumed when TOTP succeeds, preserving the recovery code for future use.
    # Both failure paths emit the same generic "Invalid 2FA code" error — we do
    # not reveal which factor was attempted (no info disclosure to attackers).
    if is_2fa_enabled(user):
        totp_code = getattr(body, 'totp_code', None)
        backup_code = getattr(body, 'backup_code', None)
        if not totp_code and not backup_code:
            # User has 2FA but didn't provide any second factor - signal frontend.
            # S1.2: refresh_token is None on this path (no token issued — cookie not set either).
            return LoginWithRefreshResponse(
                access_token="",
                refresh_token=None,
                token_type="Bearer",
                expires_in=0,
                user=UserInfo(
                    id=user.id,
                    email=user.email,
                    tenant_id=user.tenant_id,
                    branch_ids=branch_ids,
                    roles=roles,
                ),
                requires_2fa=True,
            )

        # TOTP takes precedence when provided.
        if totp_code:
            import pyotp
            try:
                totp_secret_plain = get_totp_secret(user, db)
            except Exception as e:
                # Decryption failure or no secret — fail closed.
                # (ValueError is already a subclass of Exception; the previous
                # `except (ValueError, Exception)` was redundant.)
                logger.error("LOGIN_FAILED: TOTP secret unavailable", user_id=user.id, error=type(e).__name__)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="2FA verification unavailable. Contact support.",
                )
            totp = pyotp.TOTP(totp_secret_plain)
            if not totp.verify(totp_code, valid_window=1):
                # S1.4: do NOT reveal which factor was attempted — same generic error
                # whether the user tried TOTP or a backup code.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid 2FA code",
                )
        else:
            # backup_code path: single-use recovery.
            ok = verify_and_consume_backup_code(user.id, backup_code, db)
            if not ok:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid 2FA code",
                )
            remaining = remaining_codes_count(user.id, db)
            logger.info(
                "LOGIN_2FA_BACKUP_CODE_USED",
                user_id=user.id,
                remaining_codes=remaining,
            )

    # Create access token
    access_token = sign_jwt({
        "sub": str(user.id),
        "tenant_id": user.tenant_id,
        "branch_ids": branch_ids,
        "roles": roles,
        "email": user.email,
    })

    # Create refresh token
    refresh_token = sign_refresh_token(user.id, user.tenant_id)

    # HIGH-AUTH-05 FIX: Log successful login
    # SHARED-HIGH-02 FIX: Mask email to protect PII
    logger.info("LOGIN_SUCCESS", email=mask_email(user.email), user_id=user.id, roles=roles, branch_count=len(branch_ids))

    # SEC-09: Set refresh token as HttpOnly cookie (always — regardless of legacy flag).
    set_refresh_token_cookie(response, refresh_token)

    # S1.2: Conditionally include refresh_token in the response body.
    # Default (legacy_refresh_in_body=True) preserves current behavior; logs a deprecation
    # warning so we can identify frontends still reading from the body during migration.
    if settings.legacy_refresh_in_body:
        logger.warning(
            "DEPRECATED: refresh_token returned in response body. "
            "Migrate to cookie-only. Will be removed when LEGACY_REFRESH_IN_BODY=False.",
            endpoint="/api/auth/login",
            user_id=user.id,
        )
        body_refresh_token: Optional[str] = refresh_token
    else:
        body_refresh_token = None

    return LoginWithRefreshResponse(
        access_token=access_token,
        refresh_token=body_refresh_token,  # S1.2: cookie-only when flag is False
        token_type="Bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=UserInfo(
            id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
            branch_ids=branch_ids,
            roles=roles,
        ),
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit("5/minute")  # SEC-07: Stricter rate limit for refresh endpoint
def refresh_token(
    request: Request,
    response: Response,
    body: Optional[RefreshTokenRequest] = None,
    refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token"),
    db: Session = Depends(get_db),
) -> TokenRefreshResponse:
    """
    Exchange a refresh token for new access + refresh tokens.

    SEC-06: Token Rotation - Always issues a new refresh token.
    SEC-08: Reuse Detection - Detects if refresh token was already used.
    SEC-09: Reads refresh token from HttpOnly cookie first, falls back to body.

    The old refresh token is blacklisted immediately after use.
    If a blacklisted refresh token is used, it indicates token theft
    and all user tokens are revoked for security.
    """
    from datetime import datetime, timezone

    # SEC-09: Get refresh token from cookie first, fallback to body
    token_value = refresh_token_cookie
    if not token_value and body and body.refresh_token:
        token_value = body.refresh_token

    if not token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not provided",
        )

    # Verify the refresh token
    payload = verify_refresh_token(token_value)
    user_id = int(payload["sub"])
    token_jti = payload.get("jti")
    token_exp = payload.get("exp")

    # SEC-08: Check if this refresh token was already used (reuse detection)
    if token_jti:
        try:
            is_already_used = is_token_blacklisted_sync(token_jti)
            if is_already_used:
                # SECURITY ALERT: Token reuse detected - possible theft
                logger.error(
                    "SECURITY: Refresh token reuse detected - revoking all user tokens",
                    user_id=user_id,
                    jti_hash=token_jti[:8] if token_jti else "N/A",
                )
                # Revoke ALL tokens for this user (nuclear option)
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # We're in an async context, can't use run_until_complete
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as pool:
                            pool.submit(asyncio.run, revoke_all_user_tokens(user_id)).result(timeout=5.0)
                    else:
                        loop.run_until_complete(revoke_all_user_tokens(user_id))
                except Exception as e:
                    logger.error("Failed to revoke user tokens after reuse detection", error=str(e))

                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token has been revoked. Please login again.",
                )
        except HTTPException:
            raise
        except Exception as e:
            # Fail closed - if we can't verify, deny access
            logger.error("Error checking refresh token reuse", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service temporarily unavailable",
            )

    # Fetch user to verify still active and get current roles
    user = db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Get current roles and branches
    branch_roles = db.execute(
        select(UserBranchRole).where(UserBranchRole.user_id == user.id)
    ).scalars().all()

    branch_ids = sorted({r.branch_id for r in branch_roles})
    roles = sorted({r.role for r in branch_roles})

    if not branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no branch assignments",
        )

    # SEC-06: Blacklist the OLD refresh token BEFORE issuing new one
    if token_jti and token_exp:
        try:
            expires_at = datetime.fromtimestamp(token_exp, tz=timezone.utc)
            blacklist_token_sync(token_jti, expires_at)
            logger.debug("Old refresh token blacklisted", user_id=user_id)
        except Exception as e:
            # Log but don't fail - the new token will be issued anyway
            logger.warning("Failed to blacklist old refresh token", error=str(e))

    # Create new access token
    access_token = sign_jwt({
        "sub": str(user.id),
        "tenant_id": user.tenant_id,
        "branch_ids": branch_ids,
        "roles": roles,
        "email": user.email,
    })

    # SEC-06: Create NEW refresh token (rotation)
    new_refresh_token = sign_refresh_token(user.id, user.tenant_id)

    # SEC-09: Set new refresh token as HttpOnly cookie (always — regardless of legacy flag).
    set_refresh_token_cookie(response, new_refresh_token)

    logger.info("Token refresh successful", user_id=user_id)

    # S1.2: Conditionally include refresh_token in the response body. See /login for rationale.
    if settings.legacy_refresh_in_body:
        logger.warning(
            "DEPRECATED: refresh_token returned in response body. "
            "Migrate to cookie-only. Will be removed when LEGACY_REFRESH_IN_BODY=False.",
            endpoint="/api/auth/refresh",
            user_id=user_id,
        )
        body_refresh_token: Optional[str] = new_refresh_token
    else:
        body_refresh_token = None

    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=body_refresh_token,  # S1.2: cookie-only when flag is False
        token_type="Bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserInfo)
def get_current_user(
    db: Session = Depends(get_db),
    ctx: dict = Depends(current_user_context),
) -> UserInfo:
    """Get current authenticated user info."""
    return UserInfo(
        id=int(ctx["sub"]),
        email=ctx["email"],
        tenant_id=ctx["tenant_id"],
        branch_ids=ctx["branch_ids"],
        roles=ctx["roles"],
    )


@router.post("/logout", response_model=LogoutResponse)
@limiter.limit("10/minute")
async def logout(
    request: Request,
    response: Response,
    ctx: dict = Depends(current_user_context),
) -> LogoutResponse:
    """
    Logout the current user by revoking all their tokens.

    This invalidates:
    - The current access token
    - The current refresh token
    - All other active sessions for this user

    The user will need to login again on all devices.

    HIGH-AUTH-01 FIX: Properly reports success/failure of token revocation.
    """
    user_id = int(ctx["sub"])
    user_email = ctx.get("email", "")

    # Revoke all tokens for this user
    success = await revoke_all_user_tokens(user_id)

    # SEC-09: Clear refresh token cookie
    clear_refresh_token_cookie(response)

    if success:
        # HIGH-AUTH-05 FIX: Log successful logout
        # SHARED-HIGH-02 FIX: Mask email to protect PII
        logger.info("LOGOUT_SUCCESS", email=mask_email(user_email), user_id=user_id)
        return LogoutResponse(
            success=True,
            message="Logged out successfully. All sessions have been invalidated.",
        )
    else:
        # HIGH-AUTH-01/05 FIX: Log and report failure
        # SHARED-HIGH-02 FIX: Mask email to protect PII
        logger.warning("LOGOUT_PARTIAL: Token revocation may have failed", email=mask_email(user_email), user_id=user_id)
        return LogoutResponse(
            success=False,
            message="Logout completed but token revocation may be delayed.",
        )


# =============================================================================
# 2FA (TOTP) Endpoints
# =============================================================================

import pyotp


class TwoFactorSetupResponse(BaseModel):
    """Response for 2FA setup - contains TOTP secret and provisioning URI."""
    secret: str
    otpauth_url: str
    qr_url: str  # URL for QR code generation (frontend can render)


class TwoFactorVerifyRequest(BaseModel):
    """Request to verify a TOTP code during 2FA setup."""
    code: str


class TwoFactorDisableRequest(BaseModel):
    """Request to disable 2FA - requires current TOTP code."""
    code: str


class TwoFactorStatusResponse(BaseModel):
    """Response with 2FA status."""
    enabled: bool
    message: str
    # S1.4: populated ONLY on the verify-activation response. Shown to the user
    # once and never returned again — losing them means the user has to call
    # /2fa/backup-codes/regenerate to get a fresh batch.
    backup_codes: list[str] | None = None


class BackupCodesRegenerateResponse(BaseModel):
    """Response from POST /api/auth/2fa/backup-codes/regenerate.

    Returns a fresh batch of single-use codes. All previous codes for this
    user are invalidated server-side. SHOW TO USER ONCE.
    """
    backup_codes: list[str]
    count: int


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def setup_2fa(
    db: Session = Depends(get_db),
    user: dict = Depends(current_user_context),
) -> TwoFactorSetupResponse:
    """
    Generate a TOTP secret for 2FA setup.
    Returns the secret and a provisioning URI for QR code generation.
    The 2FA is NOT enabled until verified with /2fa/verify.
    """
    user_id = int(user["sub"])
    user_email = user.get("email", "")

    db_user = db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # S1.1.B: check both columns (encrypted-only users would have been missed before).
    if is_2fa_enabled(db_user):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="2FA is already enabled. Disable it first.",
        )

    # Generate a new TOTP secret
    secret = pyotp.random_base32()

    # Store temporarily (not confirmed yet) - we store it on the user
    # and require verification before it takes effect.
    # Pending secrets stay in plain `totp_secret` with the "pending:" prefix
    # (short-lived; encrypting adds no value here and breaks the prefix protocol).
    set_pending_setup_secret(db_user, secret)
    db.commit()

    # Generate provisioning URI
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(
        name=user_email,
        issuer_name="Buen Sabor",
    )

    # Generate QR code URL using public API
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={otpauth_url}"

    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        qr_url=qr_url,
    )


@router.post("/2fa/verify", response_model=TwoFactorStatusResponse)
def verify_2fa(
    body: TwoFactorVerifyRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user_context),
) -> TwoFactorStatusResponse:
    """
    Verify a TOTP code to confirm 2FA setup.
    This activates 2FA for the user's account.
    """
    user_id = int(user["sub"])

    db_user = db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not is_2fa_pending(db_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending 2FA setup found. Call /2fa/setup first.",
        )

    # Extract the actual secret from the pending-setup column.
    secret = get_pending_setup_secret(db_user)
    totp = pyotp.TOTP(secret)

    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification code",
        )

    # S1.1.B: Activate 2FA — store ONLY encrypted; legacy plain column is nulled.
    set_new_totp_secret(db_user, secret, db)
    db.commit()

    # S1.4: Generate backup recovery codes the first time 2FA is verified.
    # `generate_backup_codes` wipes any pre-existing codes (defensive — should
    # be none here) and commits internally. Returned plain codes are shown
    # to the user exactly once via this response.
    backup_codes = generate_backup_codes(db_user.id, db)

    logger.info(
        "2FA_ENABLED",
        user_id=user_id,
        backup_codes_generated=len(backup_codes),
    )

    return TwoFactorStatusResponse(
        enabled=True,
        message="2FA has been enabled successfully. Save the backup codes — they are shown only once.",
        backup_codes=backup_codes,
    )


@router.delete("/2fa/disable", response_model=TwoFactorStatusResponse)
def disable_2fa(
    body: TwoFactorDisableRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user_context),
) -> TwoFactorStatusResponse:
    """
    Disable 2FA. Requires a valid current TOTP code.
    """
    user_id = int(user["sub"])

    db_user = db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not is_2fa_enabled(db_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not currently enabled",
        )

    # Verify current TOTP code (dual-read via helper).
    try:
        totp_secret_plain = get_totp_secret(db_user, db)
    except Exception as e:
        # (ValueError is already a subclass of Exception; the previous
        # `except (ValueError, Exception)` was redundant.)
        logger.error("2FA_DISABLE_FAILED: TOTP secret unavailable", user_id=user_id, error=type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="2FA verification unavailable. Contact support.",
        )
    totp = pyotp.TOTP(totp_secret_plain)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    # S1.1.B: clear BOTH columns.
    clear_totp_secret(db_user)
    db.commit()

    # S1.4: recovery codes belong to a specific TOTP enrollment, so they
    # must not survive its removal. `clear_all_codes` commits internally.
    cleared = clear_all_codes(db_user.id, db)

    logger.info("2FA_DISABLED", user_id=user_id, backup_codes_cleared=cleared)

    return TwoFactorStatusResponse(
        enabled=False,
        message="2FA has been disabled successfully",
    )


@router.post("/2fa/backup-codes/regenerate", response_model=BackupCodesRegenerateResponse)
def regenerate_backup_codes(
    db: Session = Depends(get_db),
    user: dict = Depends(current_user_context),
) -> BackupCodesRegenerateResponse:
    """Generate a fresh batch of single-use backup codes.

    Invalidates ALL previous codes for the current user (used or not).
    Requires 2FA to be currently enabled. The plain codes are returned to
    the caller exactly once — the UI must show them and discard.
    """
    user_id = int(user["sub"])

    db_user = db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not is_2fa_enabled(db_user):
        # No 2FA enrollment → backup codes have no meaning.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA must be enabled to generate backup codes",
        )

    codes = generate_backup_codes(db_user.id, db)
    logger.info("BACKUP_CODES_REGENERATED", user_id=user_id, count=len(codes))

    return BackupCodesRegenerateResponse(backup_codes=codes, count=len(codes))
