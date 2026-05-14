"""TOTP secret encryption at rest (Fernet/AES-128-CBC + HMAC-SHA256).

Part of S1.1.A — Encryption infrastructure for TOTP secrets.

Design notes:
- Lazy-init Fernet so the app can boot in dev without a key (2FA disabled).
- Plaintext and ciphertext MUST NOT be logged at any level.
- `reset_fernet_cache()` is intended for tests only.
"""
from cryptography.fernet import Fernet, InvalidToken

from shared.config.settings import settings


class TOTPEncryptionError(Exception):
    """Raised when encryption/decryption fails."""


_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Lazy-init Fernet instance from settings. Fails fast if key missing/invalid."""
    global _fernet
    if _fernet is None:
        key = settings.totp_encryption_key
        if not key:
            raise TOTPEncryptionError("TOTP_ENCRYPTION_KEY is not configured")
        try:
            _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except (ValueError, TypeError) as e:
            raise TOTPEncryptionError(f"TOTP_ENCRYPTION_KEY invalid: {e}") from e
    return _fernet


def encrypt_totp_secret(plain: str) -> str:
    """Encrypt a TOTP secret. Returns base64-encoded Fernet token.

    NEVER log the plaintext or the returned token.
    """
    if not plain:
        raise TOTPEncryptionError("Cannot encrypt empty secret")
    fernet = _get_fernet()
    token = fernet.encrypt(plain.encode("utf-8"))
    return token.decode("ascii")


def decrypt_totp_secret(encrypted: str) -> str:
    """Decrypt a previously-encrypted TOTP secret.

    Returns plain string (in-memory only — do NOT persist or log).
    """
    if not encrypted:
        raise TOTPEncryptionError("Cannot decrypt empty value")
    fernet = _get_fernet()
    try:
        plain = fernet.decrypt(encrypted.encode("ascii"))
    except InvalidToken as e:
        raise TOTPEncryptionError("Invalid or tampered encrypted TOTP secret") from e
    return plain.decode("utf-8")


def reset_fernet_cache() -> None:
    """ONLY for tests: clear the lazy-init cache so a new settings value is picked up."""
    global _fernet
    _fernet = None
