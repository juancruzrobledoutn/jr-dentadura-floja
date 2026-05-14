"""Tests for 2FA backup codes service (S1.4).

Covers code generation, single-use verification, regeneration, and full clear.
Uses an in-memory SQLite database for speed — the service only relies on
basic SQLAlchemy + ORM features available everywhere.
"""
from __future__ import annotations

import re

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from rest_api.models.backup_code import BackupCode2FA
from rest_api.models.base import Base
from rest_api.services.auth.backup_codes import (
    BACKUP_CODE_ALPHABET,
    BACKUP_CODE_COUNT,
    BACKUP_CODE_LENGTH,
    clear_all_codes,
    generate_backup_codes,
    remaining_codes_count,
    verify_and_consume_backup_code,
)


CODE_FORMAT_RE = re.compile(r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")


@pytest.fixture()
def db():
    """Fresh in-memory SQLite session with only the backup_code table created.

    We avoid creating the whole schema — bcrypt-heavy tests are slow enough.
    """
    engine = create_engine("sqlite://", future=True)
    # Only create the BackupCode2FA table to dodge cross-table FK on app_user
    # (SQLite is permissive on FKs when the referenced table is absent).
    BackupCode2FA.__table__.create(engine)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# ---------------------------------------------------------------------------
# generate_backup_codes
# ---------------------------------------------------------------------------


def test_generate_backup_codes_returns_n_codes_with_expected_format(db):
    user_id = 1
    codes = generate_backup_codes(user_id, db)

    assert len(codes) == BACKUP_CODE_COUNT
    assert len(set(codes)) == BACKUP_CODE_COUNT, "Codes must be unique within a batch"
    for code in codes:
        assert CODE_FORMAT_RE.match(code), f"Bad code format: {code!r}"
        # Every char (minus the dash) must come from the safe alphabet.
        raw = code.replace("-", "")
        assert len(raw) == BACKUP_CODE_LENGTH
        assert all(c in BACKUP_CODE_ALPHABET for c in raw)


def test_generate_backup_codes_persists_only_hashes(db):
    """Plain codes must NEVER end up in the DB."""
    user_id = 7
    codes = generate_backup_codes(user_id, db)

    persisted = db.query(BackupCode2FA).filter(BackupCode2FA.user_id == user_id).all()
    assert len(persisted) == BACKUP_CODE_COUNT
    for row in persisted:
        assert row.code_hash.startswith("$2b$"), "Codes must be bcrypt-hashed"
        assert row.used_at is None
        # Belt-and-suspenders: ensure no plain code accidentally got stored.
        for plain in codes:
            assert plain not in row.code_hash
            assert plain.replace("-", "") not in row.code_hash


def test_generate_backup_codes_invalidates_previous_batch(db):
    user_id = 2
    first_batch = generate_backup_codes(user_id, db)
    # Generating again must wipe the previous rows entirely.
    second_batch = generate_backup_codes(user_id, db)

    persisted = db.query(BackupCode2FA).filter(BackupCode2FA.user_id == user_id).all()
    assert len(persisted) == BACKUP_CODE_COUNT  # not 16

    # Every old code must now be rejected.
    for old_code in first_batch:
        assert verify_and_consume_backup_code(user_id, old_code, db) is False

    # And the new batch still works.
    assert verify_and_consume_backup_code(user_id, second_batch[0], db) is True


# ---------------------------------------------------------------------------
# verify_and_consume_backup_code
# ---------------------------------------------------------------------------


def test_verify_valid_code_returns_true_and_marks_used(db):
    user_id = 3
    codes = generate_backup_codes(user_id, db)

    assert verify_and_consume_backup_code(user_id, codes[0], db) is True

    # The used row should now have used_at populated.
    used_rows = (
        db.query(BackupCode2FA)
        .filter(BackupCode2FA.user_id == user_id, BackupCode2FA.used_at.is_not(None))
        .all()
    )
    assert len(used_rows) == 1


def test_verify_same_code_twice_fails_second_time(db):
    """Single-use enforcement: consuming a code marks it spent."""
    user_id = 4
    codes = generate_backup_codes(user_id, db)
    code = codes[0]

    assert verify_and_consume_backup_code(user_id, code, db) is True
    assert verify_and_consume_backup_code(user_id, code, db) is False


def test_verify_invalid_code_returns_false(db):
    user_id = 5
    generate_backup_codes(user_id, db)

    # Right length+alphabet but not one of the user's codes.
    assert verify_and_consume_backup_code(user_id, "ZZZZ-ZZZZ", db) is False
    # Wrong length.
    assert verify_and_consume_backup_code(user_id, "ABC", db) is False
    # Empty/whitespace.
    assert verify_and_consume_backup_code(user_id, "", db) is False
    assert verify_and_consume_backup_code(user_id, "   ", db) is False


def test_verify_accepts_with_or_without_dash_and_case_insensitive(db):
    user_id = 6
    codes = generate_backup_codes(user_id, db)
    code = codes[0]  # format "XXXX-XXXX"

    # Same code, different formatting variants — pick distinct unused codes
    # for each variant since first-success consumes the row.
    variants = [
        codes[0],  # original
        codes[1].replace("-", ""),  # no dash
        codes[2].lower(),  # lowercase
        f"  {codes[3]}  ",  # surrounding whitespace
    ]
    for v in variants:
        assert verify_and_consume_backup_code(user_id, v, db) is True, (
            f"Variant should verify: {v!r}"
        )


def test_verify_when_no_codes_exist_returns_false(db):
    """User with no codes at all → instant False."""
    assert verify_and_consume_backup_code(user_id=999, plain_code="ABCD-EFGH", db=db) is False


def test_verify_does_not_consume_other_users_codes(db):
    user_a, user_b = 10, 11
    codes_a = generate_backup_codes(user_a, db)
    generate_backup_codes(user_b, db)

    # user_b should not be able to use user_a's code.
    assert verify_and_consume_backup_code(user_b, codes_a[0], db) is False
    # And user_a's code is still unused.
    assert verify_and_consume_backup_code(user_a, codes_a[0], db) is True


# ---------------------------------------------------------------------------
# remaining_codes_count
# ---------------------------------------------------------------------------


def test_remaining_codes_count_starts_at_n_and_decrements(db):
    user_id = 20
    codes = generate_backup_codes(user_id, db)
    assert remaining_codes_count(user_id, db) == BACKUP_CODE_COUNT

    verify_and_consume_backup_code(user_id, codes[0], db)
    assert remaining_codes_count(user_id, db) == BACKUP_CODE_COUNT - 1


def test_remaining_codes_count_returns_zero_for_unknown_user(db):
    assert remaining_codes_count(user_id=12345, db=db) == 0


# ---------------------------------------------------------------------------
# clear_all_codes
# ---------------------------------------------------------------------------


def test_clear_all_codes_removes_every_row(db):
    user_id = 30
    generate_backup_codes(user_id, db)
    cleared = clear_all_codes(user_id, db)

    assert cleared == BACKUP_CODE_COUNT
    assert remaining_codes_count(user_id, db) == 0
    assert (
        db.query(BackupCode2FA).filter(BackupCode2FA.user_id == user_id).count() == 0
    )


def test_clear_all_codes_is_idempotent_for_users_without_codes(db):
    """Calling clear on a user with no codes returns 0 and doesn't blow up."""
    assert clear_all_codes(user_id=404, db=db) == 0


def test_clear_all_codes_removes_used_and_unused(db):
    user_id = 31
    codes = generate_backup_codes(user_id, db)
    # Use one so we have a mix of used + unused rows.
    verify_and_consume_backup_code(user_id, codes[0], db)

    cleared = clear_all_codes(user_id, db)
    assert cleared == BACKUP_CODE_COUNT  # both used and unused removed
