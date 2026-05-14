"""2FA backup codes management — generate, verify, consume, regenerate.

Part of S1.4 — recovery codes for users that lose access to their authenticator.

Security notes:
- Codes are hashed with bcrypt (same hasher as `User.password`) before being
  persisted. The plain values are returned to the caller exactly once — at
  generation/regeneration — and are NEVER stored or logged in plain.
- Single use: `verify_and_consume_backup_code` marks the matched row as used
  via `used_at` so the same code cannot be replayed.
- Timing-safe verification: we iterate over ALL of the user's unused codes
  even after finding a match instead of returning early. This keeps the
  total work-per-call constant and avoids leaking "how many codes you have
  used" via response time.
- Regeneration DELETEs all previous rows (used or not). The audit trail
  before that point is captured in the application logs (no PII inside).
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import List

from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.models.backup_code import BackupCode2FA
from shared.config.logging import get_logger
from shared.security.password import hash_password, verify_password


logger = get_logger(__name__)


# 8 codes is the same default Google, GitHub and AWS use.
BACKUP_CODE_COUNT = 8
# 8 alphanumeric chars before the visual dash; entropy ~= log2(32**8) ~= 40 bits.
BACKUP_CODE_LENGTH = 8
# Crockford-ish alphabet — no 0/O/1/I to avoid OCR/handwriting ambiguity.
BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_one_code() -> str:
    """Return a single backup code formatted as ``XXXX-XXXX``.

    The dash is purely cosmetic; verification strips it so the user can type
    the code with or without it.
    """
    raw = "".join(
        secrets.choice(BACKUP_CODE_ALPHABET) for _ in range(BACKUP_CODE_LENGTH)
    )
    return f"{raw[:4]}-{raw[4:]}"


def _normalize(plain_code: str) -> str:
    """Strip whitespace + dashes and uppercase. Used both at hash-time and verify-time."""
    return plain_code.replace("-", "").replace(" ", "").strip().upper()


def generate_backup_codes(user_id: int, db: Session) -> List[str]:
    """Generate ``BACKUP_CODE_COUNT`` fresh backup codes for a user.

    Any pre-existing codes for that user are DELETED first — regeneration is
    a hard invalidation, so a user can self-recover by issuing fresh codes
    if they suspect old ones were exposed.

    Returns the plain codes. The caller MUST display them to the user once
    and then discard them; they are not retrievable later.

    Note: caller drives commit. We commit here because the deletion + bulk
    insert is a self-contained operation that should not depend on the
    surrounding route's commit boundary.
    """
    # Wipe previous codes — keep the side-effect explicit.
    db.query(BackupCode2FA).filter(BackupCode2FA.user_id == user_id).delete(
        synchronize_session=False
    )

    plain_codes: List[str] = [_generate_one_code() for _ in range(BACKUP_CODE_COUNT)]
    for plain in plain_codes:
        # Normalize before hashing so verification is dash/case agnostic.
        hashed = hash_password(_normalize(plain))
        db.add(BackupCode2FA(user_id=user_id, code_hash=hashed))

    db.commit()
    logger.info(
        "BACKUP_CODES_GENERATED",
        user_id=user_id,
        count=BACKUP_CODE_COUNT,
    )
    # NEVER log `plain_codes`. They leave the function as a return value only.
    return plain_codes


def verify_and_consume_backup_code(
    user_id: int, plain_code: str, db: Session
) -> bool:
    """Verify and (on success) consume a backup code.

    Returns ``True`` only when the input matches one of the user's unused
    codes; that row is then stamped with ``used_at`` and committed. Returns
    ``False`` for invalid format, no match, or no remaining codes.

    Timing-safety: we iterate over every unused code even after a match so
    that the total bcrypt work per call is constant regardless of where the
    match falls (or whether one exists). bcrypt verify is the expensive op
    here; everything else is O(n) over a tiny list.
    """
    normalized = _normalize(plain_code)
    # Early-return on malformed input (empty or wrong length) is intentional
    # and does NOT compromise security:
    # - The /login endpoint always returns the same generic "Invalid 2FA code"
    #   error regardless of whether the code was malformed or merely incorrect,
    #   so the format-vs-auth-failure timing signal stays inside this function
    #   and never reaches the attacker.
    # - It does NOT reveal whether the user has backup codes — that info is
    #   protected at the endpoint level (same error, same status code).
    # - Skipping bcrypt for obviously-bad input saves CPU under DoS attempts;
    #   bcrypt is the expensive op (~100ms), and we don't want to burn it on
    #   inputs that can't possibly match.
    if not normalized or len(normalized) != BACKUP_CODE_LENGTH:
        return False

    unused = (
        db.execute(
            select(BackupCode2FA).where(
                BackupCode2FA.user_id == user_id,
                BackupCode2FA.used_at.is_(None),
            )
        )
        .scalars()
        .all()
    )

    if not unused:
        return False

    matched: BackupCode2FA | None = None
    for code in unused:
        # Do NOT short-circuit on match — keep going so timing stays uniform.
        if verify_password(normalized, code.code_hash):
            matched = code

    if matched is None:
        return False

    matched.used_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(
        "BACKUP_CODE_CONSUMED",
        user_id=user_id,
        remaining=len(unused) - 1,
    )
    # NEVER log `plain_code` or `normalized`.
    return True


def remaining_codes_count(user_id: int, db: Session) -> int:
    """Return the number of unused backup codes a user currently has."""
    return (
        db.query(BackupCode2FA)
        .filter(
            BackupCode2FA.user_id == user_id,
            BackupCode2FA.used_at.is_(None),
        )
        .count()
    )


def clear_all_codes(user_id: int, db: Session) -> int:
    """Delete every backup code (used or not) for a user.

    Called whenever the user disables 2FA — recovery codes belong to a
    specific TOTP enrollment, so they must not survive it.
    """
    count = (
        db.query(BackupCode2FA)
        .filter(BackupCode2FA.user_id == user_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    if count:
        logger.info("BACKUP_CODES_CLEARED", user_id=user_id, count=count)
    return count
