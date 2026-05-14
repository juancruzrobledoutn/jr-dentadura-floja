"""Create app_backup_code_2fa table.

Revision ID: 016_create_backup_codes_2fa
Revises: 015_totp_encrypted
Create Date: 2026-05-13

Part of S1.4 — 2FA recovery via backup codes.

NOTE: Migration 016 was originally reserved for dropping the legacy
`app_user.totp_secret` column (S1.1.C). That cutover has been deferred and
will be handled in a later revision; using 016 here keeps the chain
contiguous with the rest of the security epic.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016_create_backup_codes_2fa"
down_revision: Union[str, None] = "015_totp_encrypted"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_backup_code_2fa",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.Text, nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_app_backup_code_2fa_user_id",
        "app_backup_code_2fa",
        ["user_id"],
    )
    op.create_index(
        "ix_backup_code_user_unused",
        "app_backup_code_2fa",
        ["user_id", "used_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_backup_code_user_unused", table_name="app_backup_code_2fa")
    op.drop_index("ix_app_backup_code_2fa_user_id", table_name="app_backup_code_2fa")
    op.drop_table("app_backup_code_2fa")
