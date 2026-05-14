"""Auth-related services (S1.1.B: TOTP encryption dual-read helper, S1.4: backup codes)."""

from .totp_helper import (
    PENDING_PREFIX,
    get_totp_secret,
    set_new_totp_secret,
    clear_totp_secret,
    is_2fa_enabled,
    is_2fa_pending,
    get_pending_setup_secret,
    set_pending_setup_secret,
)
from .backup_codes import (
    BACKUP_CODE_COUNT,
    clear_all_codes,
    generate_backup_codes,
    remaining_codes_count,
    verify_and_consume_backup_code,
)

__all__ = [
    "PENDING_PREFIX",
    "get_totp_secret",
    "set_new_totp_secret",
    "clear_totp_secret",
    "is_2fa_enabled",
    "is_2fa_pending",
    "get_pending_setup_secret",
    "set_pending_setup_secret",
    "BACKUP_CODE_COUNT",
    "generate_backup_codes",
    "verify_and_consume_backup_code",
    "remaining_codes_count",
    "clear_all_codes",
]
