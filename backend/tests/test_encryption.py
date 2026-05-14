"""Tests for TOTP encryption module (S1.1.A)."""
import pytest
from cryptography.fernet import Fernet

from shared.config.settings import settings
from shared.security.encryption import (
    encrypt_totp_secret,
    decrypt_totp_secret,
    reset_fernet_cache,
    TOTPEncryptionError,
)


@pytest.fixture(autouse=True)
def setup_encryption_key(monkeypatch):
    """Provide a valid Fernet key for each test and reset the cache before/after."""
    test_key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "totp_encryption_key", test_key)
    reset_fernet_cache()
    yield
    reset_fernet_cache()


def test_roundtrip():
    """encrypt -> decrypt yields the original plaintext."""
    secret = "JBSWY3DPEHPK3PXP"  # standard TOTP base32 example
    encrypted = encrypt_totp_secret(secret)
    assert encrypted != secret
    decrypted = decrypt_totp_secret(encrypted)
    assert decrypted == secret


def test_encrypt_different_ciphertexts():
    """Fernet uses a per-token IV/timestamp -> identical plaintexts yield distinct ciphertexts."""
    secret = "JBSWY3DPEHPK3PXP"
    e1 = encrypt_totp_secret(secret)
    e2 = encrypt_totp_secret(secret)
    assert e1 != e2  # different IVs
    assert decrypt_totp_secret(e1) == decrypt_totp_secret(e2) == secret


def test_decrypt_wrong_key_fails(monkeypatch):
    """Decryption with a different Fernet key must raise TOTPEncryptionError."""
    secret = "JBSWY3DPEHPK3PXP"
    encrypted = encrypt_totp_secret(secret)

    # Rotate the key and force re-init
    new_key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "totp_encryption_key", new_key)
    reset_fernet_cache()

    with pytest.raises(TOTPEncryptionError, match="Invalid or tampered"):
        decrypt_totp_secret(encrypted)


def test_encrypt_empty_fails():
    with pytest.raises(TOTPEncryptionError, match="empty"):
        encrypt_totp_secret("")


def test_decrypt_empty_fails():
    with pytest.raises(TOTPEncryptionError, match="empty"):
        decrypt_totp_secret("")


def test_missing_key_fails(monkeypatch):
    monkeypatch.setattr(settings, "totp_encryption_key", "")
    reset_fernet_cache()
    with pytest.raises(TOTPEncryptionError, match="not configured"):
        encrypt_totp_secret("anything")


def test_invalid_key_format_fails(monkeypatch):
    monkeypatch.setattr(settings, "totp_encryption_key", "not-a-valid-fernet-key")
    reset_fernet_cache()
    with pytest.raises(TOTPEncryptionError, match="invalid"):
        encrypt_totp_secret("anything")


def test_tampered_ciphertext_fails():
    """Modifying the ciphertext (e.g. byte flip) must be detected by HMAC."""
    secret = "JBSWY3DPEHPK3PXP"
    encrypted = encrypt_totp_secret(secret)
    # Flip one character near the middle (still valid base64 alphabet but bad MAC)
    mid = len(encrypted) // 2
    swap = "A" if encrypted[mid] != "A" else "B"
    tampered = encrypted[:mid] + swap + encrypted[mid + 1:]
    with pytest.raises(TOTPEncryptionError, match="Invalid or tampered"):
        decrypt_totp_secret(tampered)
