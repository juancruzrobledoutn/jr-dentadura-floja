"""Create delivery and takeout order tables.

Revision ID: 004_delivery
Revises: 003_reservation
Create Date: 2026-04-04

Order types: TAKEOUT | DELIVERY
Statuses: RECEIVED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, PICKED_UP, CANCELED
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_delivery"
down_revision: Union[str, None] = "003_reservation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_order",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("app_tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        # Order type
        sa.Column("order_type", sa.Text, nullable=False),
        # Customer info
        sa.Column("customer_name", sa.Text, nullable=False),
        sa.Column("customer_phone", sa.Text, nullable=False),
        sa.Column("customer_email", sa.Text, nullable=True),
        # Delivery address
        sa.Column("delivery_address", sa.Text, nullable=True),
        sa.Column("delivery_instructions", sa.Text, nullable=True),
        sa.Column("delivery_lat", sa.Float, nullable=True),
        sa.Column("delivery_lng", sa.Float, nullable=True),
        # Timing
        sa.Column("estimated_ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_delivery_at", sa.DateTime(timezone=True), nullable=True),
        # Status
        sa.Column("status", sa.Text, server_default="RECEIVED", nullable=False),
        # Payment
        sa.Column("total_cents", sa.Integer, server_default="0", nullable=False),
        sa.Column("payment_method", sa.Text, nullable=True),
        sa.Column("is_paid", sa.Boolean, server_default=sa.text("false"), nullable=False),
        # Notes
        sa.Column("notes", sa.Text, nullable=True),
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
    )
    op.create_index("ix_delivery_order_tenant", "delivery_order", ["tenant_id"])
    op.create_index("ix_delivery_order_branch", "delivery_order", ["branch_id"])
    op.create_index("ix_delivery_order_status", "delivery_order", ["status"])
    op.create_index("ix_delivery_order_branch_status", "delivery_order", ["branch_id", "status"])
    op.create_index("ix_delivery_order_is_active", "delivery_order", ["is_active"])

    op.create_table(
        "delivery_order_item",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("app_tenant.id"), nullable=False),
        sa.Column("order_id", sa.BigInteger, sa.ForeignKey("delivery_order.id"), nullable=False),
        sa.Column("product_id", sa.BigInteger, sa.ForeignKey("product.id"), nullable=False),
        sa.Column("qty", sa.Integer, nullable=False),
        sa.Column("unit_price_cents", sa.Integer, nullable=False),
        sa.Column("product_name", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
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
    )
    op.create_index("ix_delivery_order_item_order", "delivery_order_item", ["order_id"])
    op.create_index("ix_delivery_order_item_is_active", "delivery_order_item", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_delivery_order_item_is_active", table_name="delivery_order_item")
    op.drop_index("ix_delivery_order_item_order", table_name="delivery_order_item")
    op.drop_table("delivery_order_item")
    op.drop_index("ix_delivery_order_is_active", table_name="delivery_order")
    op.drop_index("ix_delivery_order_branch_status", table_name="delivery_order")
    op.drop_index("ix_delivery_order_status", table_name="delivery_order")
    op.drop_index("ix_delivery_order_branch", table_name="delivery_order")
    op.drop_index("ix_delivery_order_tenant", table_name="delivery_order")
    op.drop_table("delivery_order")
