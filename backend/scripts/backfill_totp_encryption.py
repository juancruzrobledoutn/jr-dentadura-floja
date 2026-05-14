"""One-off script to backfill totp_secret_encrypted from totp_secret.

Part of S1.1.B — TOTP encryption migration (strategy B: backfill + dual-read).

This is idempotent: re-running it only touches rows still missing the encrypted
value. Pending-setup rows (totp_secret starts with "pending:") are skipped —
they're short-lived and will get encrypted on verification, not by this script.

RESUMABLE DESIGN:
    The script commits in batches (--batch-size, default 100). If interrupted
    mid-run, partially-migrated users stay migrated and rerunning is safe —
    the SELECT filters out rows that already have totp_secret_encrypted set,
    so already-processed users are not re-touched.

    A failure on a single user (e.g. a malformed plain secret) does NOT abort
    the run: that user is logged at ERROR and skipped, but the remaining users
    in the batch continue. The final commit at the end flushes any pending
    rows that didn't hit a batch boundary.

Usage:
    cd backend
    python -m scripts.backfill_totp_encryption [--dry-run] [--batch-size 100]

After running, verify:
    SELECT COUNT(*) FROM app_user
    WHERE totp_secret IS NOT NULL
      AND totp_secret NOT LIKE 'pending:%'
      AND totp_secret_encrypted IS NULL;
Should return 0.
"""
import argparse
import sys

from sqlalchemy import select

from shared.infrastructure.db import SessionLocal
from shared.security.encryption import encrypt_totp_secret, TOTPEncryptionError
from shared.config.logging import get_logger
from rest_api.models import User

logger = get_logger(__name__)


PENDING_PREFIX = "pending:"


def backfill(dry_run: bool = False, batch_size: int = 100) -> int:
    """Encrypt every active plain TOTP secret missing its encrypted counterpart.

    Returns the number of users migrated (or that would be migrated, in dry-run).
    """
    db = SessionLocal()
    try:
        # Find users with a confirmed plain secret but no encrypted version.
        # Pending-setup rows are explicitly excluded.
        users = db.execute(
            select(User).where(
                User.totp_secret.isnot(None),
                User.totp_secret_encrypted.is_(None),
                ~User.totp_secret.startswith(PENDING_PREFIX),
            )
        ).scalars().all()

        total = len(users)
        if total == 0:
            logger.info("No users to migrate. Backfill complete.")
            return 0

        logger.info(f"Found {total} users to migrate (dry_run={dry_run})")

        migrated = 0
        for i, user in enumerate(users, 1):
            try:
                encrypted = encrypt_totp_secret(user.totp_secret)
                if not dry_run:
                    user.totp_secret_encrypted = encrypted
                    if i % batch_size == 0:
                        db.commit()
                        logger.info(f"Committed batch {i}/{total}")
                migrated += 1
            except TOTPEncryptionError as e:
                logger.error(f"Failed to encrypt for user_id={user.id}: {e}")
                continue

        if not dry_run:
            db.commit()
        logger.info(
            f"Backfill done. Migrated: {migrated}/{total} (dry_run={dry_run})"
        )
        return migrated
    except Exception:
        db.rollback()
        logger.exception("Backfill failed")
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill TOTP encryption (S1.1.B)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't commit changes; just report what would be migrated.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Commit every N users (default: 100).",
    )
    args = parser.parse_args()

    try:
        backfill(dry_run=args.dry_run, batch_size=args.batch_size)
        sys.exit(0)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
