"""Create product customization tables for reusable modifiers.

Revision ID: 012_customization
Revises: 011_floor_plan
Create Date: 2026-04-05

Tables: customization_option, product_customization_link
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "012_customization"
down_revision: Union[str, None] = "011_floor_plan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # customization_option — Reusable customization options per tenant
    # =========================================================================
    op.create_table(
        "customization_option",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("category", sa.Text, nullable=True),
        sa.Column("extra_cost_cents", sa.Integer, server_default="0", nullable=False),
        sa.Column("order", sa.Integer, server_default="0", nullable=False),
        # AuditMixin columns
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.BigInteger, nullable=True),
        sa.Column("created_by_email", sa.String(255), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger, nullable=True),
        sa.Column("updated_by_email", sa.String(255), nullable=True),
        sa.Column("deleted_by_id", sa.BigInteger, nullable=True),
        sa.Column("deleted_by_email", sa.String(255), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", "category", name="uq_customization_option_tenant_name_category"),
    )
    op.create_index("ix_customization_option_tenant", "customization_option", ["tenant_id"])
    op.create_index("ix_customization_option_tenant_active", "customization_option", ["tenant_id", "is_active"])

    # =========================================================================
    # product_customization_link — M:N linking products to customization options
    # =========================================================================
    op.create_table(
        "product_customization_link",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.BigInteger, sa.ForeignKey("product.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customization_option_id", sa.BigInteger, sa.ForeignKey("customization_option.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.UniqueConstraint("product_id", "customization_option_id", name="uq_product_customization_link"),
    )
    op.create_index("ix_product_customization_link_product", "product_customization_link", ["product_id"])
    op.create_index("ix_product_customization_link_option", "product_customization_link", ["customization_option_id"])


def downgrade() -> None:
    # product_customization_link
    op.drop_index("ix_product_customization_link_option", table_name="product_customization_link")
    op.drop_index("ix_product_customization_link_product", table_name="product_customization_link")
    op.drop_table("product_customization_link")

    # customization_option
    op.drop_index("ix_customization_option_tenant_active", table_name="customization_option")
    op.drop_index("ix_customization_option_tenant", table_name="customization_option")
    op.drop_table("customization_option")
