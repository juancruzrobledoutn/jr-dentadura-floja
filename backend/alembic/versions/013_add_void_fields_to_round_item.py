"""Add void fields to round_item table.

Revision ID: 013_void_fields
Revises: 012_customization
Create Date: 2026-04-05

Adds is_voided and void_reason columns to round_item for single item void support.

AUDIT FIX S0.11 (A17/M21): Lock warning.
  This migration adds 4 columns to round_item with `nullable=False` plus
  `server_default`, which PostgreSQL implements as a single ACCESS EXCLUSIVE
  lock on the table. For large tables (>1M rows) this can block writes for
  several seconds.

  Production playbook (avoid the lock for hot tables):
    1. ALTER TABLE round_item ADD COLUMN is_voided BOOLEAN NULL DEFAULT FALSE;
       (repeat for void_reason, voided_by_user_id, voided_at)
    2. Backfill in batches: UPDATE round_item SET is_voided = FALSE
       WHERE is_voided IS NULL LIMIT 10000; (loop)
    3. ALTER TABLE round_item ALTER COLUMN is_voided SET NOT NULL;
       (only when backfill complete)

  Recommend running this migration during a maintenance window if round_item
  exceeds N rows. See devOps/RUNBOOK.md "Migrations with known exclusive lock".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013_void_fields"
down_revision: Union[str, None] = "012_customization"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("round_item", sa.Column("is_voided", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("round_item", sa.Column("void_reason", sa.Text(), nullable=True))
    op.add_column("round_item", sa.Column("voided_by_user_id", sa.BigInteger(), nullable=True))
    op.add_column("round_item", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("round_item", "voided_at")
    op.drop_column("round_item", "voided_by_user_id")
    op.drop_column("round_item", "void_reason")
    op.drop_column("round_item", "is_voided")
