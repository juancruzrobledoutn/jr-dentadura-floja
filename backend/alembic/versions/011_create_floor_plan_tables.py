"""Create floor plan tables for visual table layout.

Revision ID: 011_floor_plan
Revises: 010_crm
Create Date: 2026-04-04

Tables: floor_plan, floor_plan_table
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011_floor_plan"
down_revision: Union[str, None] = "010_crm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # floor_plan — Visual layout for a branch
    # =========================================================================
    op.create_table(
        "floor_plan",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("width", sa.Integer, server_default="800", nullable=False),
        sa.Column("height", sa.Integer, server_default="600", nullable=False),
        sa.Column("background_image", sa.Text, nullable=True),
        sa.Column("is_default", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("sector_id", sa.BigInteger, sa.ForeignKey("branch_sector.id"), nullable=True),
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
    op.create_index("ix_floor_plan_tenant", "floor_plan", ["tenant_id"])
    op.create_index("ix_floor_plan_branch", "floor_plan", ["branch_id"])
    op.create_index("ix_floor_plan_sector", "floor_plan", ["sector_id"])
    op.create_index("ix_floor_plan_is_active", "floor_plan", ["is_active"])

    # =========================================================================
    # floor_plan_table — Table position on floor plan
    # =========================================================================
    op.create_table(
        "floor_plan_table",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("floor_plan_id", sa.BigInteger, sa.ForeignKey("floor_plan.id"), nullable=False),
        sa.Column("table_id", sa.BigInteger, sa.ForeignKey("app_table.id"), nullable=False),
        sa.Column("x", sa.Float, nullable=False, server_default="0"),
        sa.Column("y", sa.Float, nullable=False, server_default="0"),
        sa.Column("width", sa.Float, server_default="60", nullable=False),
        sa.Column("height", sa.Float, server_default="60", nullable=False),
        sa.Column("rotation", sa.Float, server_default="0", nullable=False),
        sa.Column("shape", sa.String(20), server_default="RECTANGLE", nullable=False),
        sa.Column("label", sa.Text, nullable=True),
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
    op.create_index("ix_floor_plan_table_plan", "floor_plan_table", ["floor_plan_id"])
    op.create_index("ix_floor_plan_table_table", "floor_plan_table", ["table_id"])
    op.create_index("ix_floor_plan_table_is_active", "floor_plan_table", ["is_active"])


def downgrade() -> None:
    # floor_plan_table
    op.drop_index("ix_floor_plan_table_is_active", table_name="floor_plan_table")
    op.drop_index("ix_floor_plan_table_table", table_name="floor_plan_table")
    op.drop_index("ix_floor_plan_table_plan", table_name="floor_plan_table")
    op.drop_table("floor_plan_table")

    # floor_plan
    op.drop_index("ix_floor_plan_is_active", table_name="floor_plan")
    op.drop_index("ix_floor_plan_sector", table_name="floor_plan")
    op.drop_index("ix_floor_plan_branch", table_name="floor_plan")
    op.drop_index("ix_floor_plan_tenant", table_name="floor_plan")
    op.drop_table("floor_plan")
