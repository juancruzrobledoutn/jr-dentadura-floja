"""Add product_name snapshot to round_item.

Revision ID: 001_product_name
Revises: None
Create Date: 2026-04-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_product_name"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "round_item",
        sa.Column("product_name", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("round_item", "product_name")
