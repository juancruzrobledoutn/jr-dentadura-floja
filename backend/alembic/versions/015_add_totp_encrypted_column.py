"""Add totp_secret_encrypted column to users table.

Revision ID: 015_totp_encrypted
Revises: 014_manager_override
Create Date: 2026-05-13

Part of S1.1.A — TOTP secrets encryption at rest (strategy B: backfill + dual-read).
ADD COLUMN nullable. Backfill script populates it. The legacy `totp_secret`
column will be dropped in migration 016 after cutover.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015_totp_encrypted"
down_revision: Union[str, None] = "014_manager_override"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column("totp_secret_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_user", "totp_secret_encrypted")
