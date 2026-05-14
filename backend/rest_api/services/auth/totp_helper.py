"""Dual-read helper for TOTP secrets during encryption migration (S1.1.B).

Strategy B: backfill + dual-read with lazy migration.

State machine for a user's TOTP columns:

  | totp_secret              | totp_secret_encrypted | meaning                          |
  |--------------------------|-----------------------|----------------------------------|
  | NULL                     | NULL                  | 2FA disabled                     |
  | "pending:<plain>"        | NULL                  | Setup started, not yet verified  |
  | "<plain>"                | NULL                  | Legacy active 2FA (pre-S1.1.B)   |
  | NULL                     | "<encrypted>"         | New active 2FA (S1.1.B+)         |
  | "<plain>"                | "<encrypted>"         | Mid-migration (encrypted wins)   |

Rules:
- `get_totp_secret` returns the decrypted plain secret for ACTIVE (verified) 2FA only.
  Legacy plain rows are encrypted on the fly (lazy migration).
- Pending setup secrets stay in plain `totp_secret` with the "pending:" prefix until
  verified. They are short-lived (in-flight setup flow) and never used for login.
- `set_new_totp_secret` writes only to the encrypted column and nulls the plain one.
- `clear_totp_secret` clears both columns (used by /2fa/disable).

NEVER logs the plain secret or the ciphertext.
"""
from typing import Optional

from sqlalchemy.orm import Session

from shared.security.encryption import (
    encrypt_totp_secret,
    decrypt_totp_secret,
    TOTPEncryptionError,
)
from shared.config.logging import get_logger

logger = get_logger(__name__)


PENDING_PREFIX = "pending:"


def is_2fa_pending(user) -> bool:
    """Return True if the user has an unverified 2FA setup in progress."""
    return bool(user.totp_secret) and user.totp_secret.startswith(PENDING_PREFIX)


def is_2fa_enabled(user) -> bool:
    """Return True if the user has ACTIVE (verified) 2FA in either column.

    A user with only a `pending:` plain secret is NOT considered enabled.
    """
    if user.totp_secret_encrypted:
        return True
    if user.totp_secret and not user.totp_secret.startswith(PENDING_PREFIX):
        return True
    return False


def get_pending_setup_secret(user) -> Optional[str]:
    """Return the plain pending-setup secret (without the prefix), or None."""
    if not is_2fa_pending(user):
        return None
    return user.totp_secret[len(PENDING_PREFIX):]


def set_pending_setup_secret(user, plain_secret: str) -> None:
    """Store a pending (unverified) TOTP secret in plain form with the prefix.

    Pending secrets are short-lived and never used for login; encrypting them
    adds no value and complicates the existing substring-based detection.
    Caller is responsible for db.commit().
    """
    user.totp_secret = f"{PENDING_PREFIX}{plain_secret}"
    # NOTE: do NOT touch totp_secret_encrypted here — preserves prior state if any.


def get_totp_secret(user, db: Session) -> str:
    """Return the decrypted plain TOTP secret for an ACTIVE 2FA user.

    Dual-read order:
      1. If `totp_secret_encrypted` is set: decrypt and return.
      2. Else if `totp_secret` is set and NOT a pending setup: encrypt it,
         persist to the encrypted column (lazy migration), and return the plain.
         If the lazy migration itself fails (encryption misconfigured, DB write
         error), log and still return the plain secret — login MUST keep working.
      3. Else raise ValueError.

    Pending setup secrets are not returned by this function — callers must use
    `get_pending_setup_secret` for the verification flow.
    """
    if user.totp_secret_encrypted:
        try:
            return decrypt_totp_secret(user.totp_secret_encrypted)
        except TOTPEncryptionError:
            logger.error(
                "Failed to decrypt TOTP secret",
                extra={"user_id": user.id},
            )
            raise

    if user.totp_secret and not user.totp_secret.startswith(PENDING_PREFIX):
        plain = user.totp_secret
        try:
            encrypted = encrypt_totp_secret(plain)
            user.totp_secret_encrypted = encrypted
            db.commit()
            logger.info(
                "Lazy-migrated TOTP secret to encrypted storage",
                extra={"user_id": user.id},
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Lazy migration of TOTP secret failed",
                extra={"user_id": user.id},
            )
            # Fall through — return plain so login keeps working.
        return plain

    raise ValueError(f"User {user.id} has no active TOTP secret configured")


def set_new_totp_secret(user, secret: str, db: Session) -> None:
    """Set a new verified TOTP secret for a user.

    Strategy B: NEW secrets go ONLY to `totp_secret_encrypted`. The legacy plain
    column is nulled out so the row is in the clean post-migration shape.

    Used during 2FA verification (transition from pending → enabled) and any
    future "regenerate secret" flow. Caller is responsible for db.commit().
    """
    encrypted = encrypt_totp_secret(secret)
    user.totp_secret_encrypted = encrypted
    user.totp_secret = None


def clear_totp_secret(user) -> None:
    """Clear both TOTP columns (used by /2fa/disable).

    Caller is responsible for db.commit().
    """
    user.totp_secret = None
    user.totp_secret_encrypted = None
