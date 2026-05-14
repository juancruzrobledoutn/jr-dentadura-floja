"""Create inventory and cost management tables.

Revision ID: 005_inventory
Revises: 004_delivery
Create Date: 2026-04-04

Tables: stock_item, stock_movement, stock_alert, supplier,
        purchase_order, purchase_order_item, waste_log, recipe_cost
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_inventory"
down_revision: Union[str, None] = "004_delivery"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Reusable AuditMixin columns
def _audit_columns() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    # =========================================================================
    # stock_item
    # =========================================================================
    op.create_table(
        "stock_item",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("ingredient_id", sa.BigInteger, sa.ForeignKey("ingredient.id"), nullable=False),
        sa.Column("current_qty", sa.Float, nullable=False, server_default="0"),
        sa.Column("unit", sa.Text, nullable=False),
        sa.Column("min_level", sa.Float, nullable=False, server_default="0"),
        sa.Column("max_level", sa.Float, nullable=True),
        sa.Column("cost_per_unit_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("location", sa.Text, nullable=True),
        sa.Column("last_restock_at", sa.DateTime(timezone=True), nullable=True),
        *_audit_columns(),
        sa.UniqueConstraint("branch_id", "ingredient_id", name="uq_stock_item_branch_ingredient"),
        sa.CheckConstraint("current_qty >= 0", name="chk_stock_item_qty_positive"),
        sa.CheckConstraint("min_level >= 0", name="chk_stock_item_min_level_positive"),
        sa.CheckConstraint("cost_per_unit_cents >= 0", name="chk_stock_item_cost_positive"),
    )
    op.create_index("ix_stock_item_tenant", "stock_item", ["tenant_id"])
    op.create_index("ix_stock_item_branch", "stock_item", ["branch_id"])
    op.create_index("ix_stock_item_ingredient", "stock_item", ["ingredient_id"])
    op.create_index("ix_stock_item_branch_qty", "stock_item", ["branch_id", "current_qty"])
    op.create_index("ix_stock_item_is_active", "stock_item", ["is_active"])

    # =========================================================================
    # stock_movement
    # =========================================================================
    op.create_table(
        "stock_movement",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("stock_item_id", sa.BigInteger, sa.ForeignKey("stock_item.id"), nullable=False),
        sa.Column("movement_type", sa.Text, nullable=False),
        sa.Column("qty_change", sa.Float, nullable=False),
        sa.Column("qty_before", sa.Float, nullable=False),
        sa.Column("qty_after", sa.Float, nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("reference_type", sa.Text, nullable=True),
        sa.Column("reference_id", sa.BigInteger, nullable=True),
        sa.Column("cost_per_unit_cents", sa.Integer, nullable=True),
        sa.Column("performed_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
        *_audit_columns(),
    )
    op.create_index("ix_stock_movement_tenant", "stock_movement", ["tenant_id"])
    op.create_index("ix_stock_movement_branch", "stock_movement", ["branch_id"])
    op.create_index("ix_stock_movement_stock_item", "stock_movement", ["stock_item_id"])
    op.create_index("ix_stock_movement_branch_type", "stock_movement", ["branch_id", "movement_type"])
    op.create_index("ix_stock_movement_reference", "stock_movement", ["reference_type", "reference_id"])
    op.create_index("ix_stock_movement_is_active", "stock_movement", ["is_active"])

    # =========================================================================
    # stock_alert
    # =========================================================================
    op.create_table(
        "stock_alert",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("stock_item_id", sa.BigInteger, sa.ForeignKey("stock_item.id"), nullable=False),
        sa.Column("alert_type", sa.Text, nullable=False),
        sa.Column("current_qty", sa.Float, nullable=False),
        sa.Column("threshold_qty", sa.Float, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="ACTIVE"),
        sa.Column("acknowledged_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        *_audit_columns(),
    )
    op.create_index("ix_stock_alert_tenant", "stock_alert", ["tenant_id"])
    op.create_index("ix_stock_alert_branch", "stock_alert", ["branch_id"])
    op.create_index("ix_stock_alert_stock_item", "stock_alert", ["stock_item_id"])
    op.create_index("ix_stock_alert_branch_status", "stock_alert", ["branch_id", "status"])
    op.create_index("ix_stock_alert_is_active", "stock_alert", ["is_active"])

    # =========================================================================
    # supplier
    # =========================================================================
    op.create_table(
        "supplier",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("contact_name", sa.Text, nullable=True),
        sa.Column("phone", sa.Text, nullable=True),
        sa.Column("email", sa.Text, nullable=True),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        *_audit_columns(),
        sa.UniqueConstraint("tenant_id", "name", name="uq_supplier_tenant_name"),
    )
    op.create_index("ix_supplier_tenant", "supplier", ["tenant_id"])
    op.create_index("ix_supplier_is_active", "supplier", ["is_active"])

    # =========================================================================
    # purchase_order
    # =========================================================================
    op.create_table(
        "purchase_order",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("supplier_id", sa.BigInteger, sa.ForeignKey("supplier.id"), nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="DRAFT"),
        sa.Column("order_date", sa.Date, nullable=False),
        sa.Column("expected_date", sa.Date, nullable=True),
        sa.Column("received_date", sa.Date, nullable=True),
        sa.Column("total_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        *_audit_columns(),
        sa.CheckConstraint("total_cents >= 0", name="chk_purchase_order_total_positive"),
    )
    op.create_index("ix_purchase_order_tenant", "purchase_order", ["tenant_id"])
    op.create_index("ix_purchase_order_branch", "purchase_order", ["branch_id"])
    op.create_index("ix_purchase_order_supplier", "purchase_order", ["supplier_id"])
    op.create_index("ix_purchase_order_branch_status", "purchase_order", ["branch_id", "status"])
    op.create_index("ix_purchase_order_is_active", "purchase_order", ["is_active"])

    # =========================================================================
    # purchase_order_item
    # =========================================================================
    op.create_table(
        "purchase_order_item",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("purchase_order_id", sa.BigInteger, sa.ForeignKey("purchase_order.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ingredient_id", sa.BigInteger, sa.ForeignKey("ingredient.id"), nullable=False),
        sa.Column("qty_ordered", sa.Float, nullable=False),
        sa.Column("qty_received", sa.Float, nullable=True),
        sa.Column("unit", sa.Text, nullable=False),
        sa.Column("unit_cost_cents", sa.Integer, nullable=False),
        *_audit_columns(),
        sa.CheckConstraint("qty_ordered > 0", name="chk_po_item_qty_positive"),
        sa.CheckConstraint("unit_cost_cents >= 0", name="chk_po_item_cost_positive"),
    )
    op.create_index("ix_purchase_order_item_tenant", "purchase_order_item", ["tenant_id"])
    op.create_index("ix_purchase_order_item_po", "purchase_order_item", ["purchase_order_id"])
    op.create_index("ix_purchase_order_item_ingredient", "purchase_order_item", ["ingredient_id"])
    op.create_index("ix_purchase_order_item_is_active", "purchase_order_item", ["is_active"])

    # =========================================================================
    # waste_log
    # =========================================================================
    op.create_table(
        "waste_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("stock_item_id", sa.BigInteger, sa.ForeignKey("stock_item.id"), nullable=False),
        sa.Column("qty", sa.Float, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("logged_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        *_audit_columns(),
        sa.CheckConstraint("qty > 0", name="chk_waste_log_qty_positive"),
        sa.CheckConstraint("cost_cents >= 0", name="chk_waste_log_cost_positive"),
    )
    op.create_index("ix_waste_log_tenant", "waste_log", ["tenant_id"])
    op.create_index("ix_waste_log_branch", "waste_log", ["branch_id"])
    op.create_index("ix_waste_log_stock_item", "waste_log", ["stock_item_id"])
    op.create_index("ix_waste_log_is_active", "waste_log", ["is_active"])

    # =========================================================================
    # recipe_cost
    # =========================================================================
    op.create_table(
        "recipe_cost",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("recipe_id", sa.BigInteger, sa.ForeignKey("recipe.id"), nullable=False),
        sa.Column("product_id", sa.BigInteger, sa.ForeignKey("product.id"), nullable=True),
        sa.Column("total_cost_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("food_cost_percent", sa.Float, nullable=False, server_default="0"),
        sa.Column("calculated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        *_audit_columns(),
        sa.CheckConstraint("total_cost_cents >= 0", name="chk_recipe_cost_total_positive"),
        sa.CheckConstraint("food_cost_percent >= 0", name="chk_recipe_cost_percent_positive"),
    )
    op.create_index("ix_recipe_cost_tenant", "recipe_cost", ["tenant_id"])
    op.create_index("ix_recipe_cost_recipe", "recipe_cost", ["recipe_id"])
    op.create_index("ix_recipe_cost_product", "recipe_cost", ["product_id"])
    op.create_index("ix_recipe_cost_is_active", "recipe_cost", ["is_active"])


def downgrade() -> None:
    # Drop in reverse order of creation (dependencies)
    for table in [
        "recipe_cost",
        "waste_log",
        "purchase_order_item",
        "purchase_order",
        "supplier",
        "stock_alert",
        "stock_movement",
        "stock_item",
    ]:
        # Drop all indexes for this table
        for idx in op.get_bind().execute(
            sa.text(
                "SELECT indexname FROM pg_indexes WHERE tablename = :table AND indexname LIKE 'ix_%'"
            ),
            {"table": table},
        ):
            op.drop_index(idx[0], table_name=table)
        op.drop_table(table)
