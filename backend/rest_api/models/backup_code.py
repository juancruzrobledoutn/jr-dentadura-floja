"""2FA backup codes — single-use recovery codes.

Part of S1.4 — 2FA recovery via backup codes.

Codes are hashed (bcrypt) at rest; plain values are returned to the user
exactly once at generation/regeneration and never stored or logged in plain.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, BigIntPK


class BackupCode2FA(Base):
    """Single-use recovery code for 2FA-enabled users.

    Lifecycle:
    - Created in batches (default 8) when a user verifies their TOTP setup
      or calls the /2fa/backup-codes/regenerate endpoint.
    - Consumed at login when the user submits a `backup_code` instead of a
      `totp_code`. `used_at` is stamped at consumption; rows are kept for
      audit purposes but never re-usable.
    - Bulk-deleted when 2FA is disabled or when the user regenerates codes
      (regeneration wipes all previous codes, used or not).

    NEVER store or log the plain code. Hashing is bcrypt (same hasher used
    for `User.password`) so we get the same operational guarantees.
    """

    __tablename__ = "app_backup_code_2fa"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Composite index to speed up "find unused codes for user" queries.
        Index("ix_backup_code_user_unused", "user_id", "used_at"),
    )

    def __repr__(self) -> str:
        state = "used" if self.used_at else "unused"
        return f"<BackupCode2FA(id={self.id}, user_id={self.user_id}, {state})>"
