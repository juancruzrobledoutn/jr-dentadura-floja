"""Add is_available to branch_product for product unavailability toggle.

Revision ID: 002_is_available
Revises: 001_product_name
Create Date: 2026-04-04

is_available is separate from is_active:
- is_active = False -> product removed from menu (admin decision)
- is_available = False -> product temporarily unavailable (kitchen ran out)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_is_available"
down_revision: Union[str, None] = "001_product_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "branch_product",
        sa.Column(
            "is_available",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_branch_product_is_available",
        "branch_product",
        ["is_available"],
    )


def downgrade() -> None:
    op.drop_index("ix_branch_product_is_available", table_name="branch_product")
    op.drop_column("branch_product", "is_available")
