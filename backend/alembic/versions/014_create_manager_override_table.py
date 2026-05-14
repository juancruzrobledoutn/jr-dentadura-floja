"""Create manager_override table for approved operations (voids, discounts).

Revision ID: 014_manager_override
Revises: 013_void_fields
Create Date: 2026-04-05

Tables: manager_override
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "014_manager_override"
down_revision: Union[str, None] = "013_void_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "manager_override",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("override_type", sa.Text, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("approved_by", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("requested_by", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("entity_type", sa.Text, nullable=False),
        sa.Column("entity_id", sa.BigInteger, nullable=False),
        sa.Column("old_values", sa.Text, nullable=True),
        sa.Column("new_values", sa.Text, nullable=True),
        sa.Column("status", sa.Text, server_default="APPROVED", nullable=False),
        sa.Column("amount_cents", sa.BigInteger, nullable=True),
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
    op.create_index("ix_manager_override_tenant", "manager_override", ["tenant_id"])
    op.create_index("ix_manager_override_branch", "manager_override", ["branch_id"])
    op.create_index("ix_manager_override_branch_type", "manager_override", ["branch_id", "override_type"])
    op.create_index("ix_manager_override_entity", "manager_override", ["entity_type", "entity_id"])
    op.create_index("ix_manager_override_approved_by", "manager_override", ["approved_by"])


def downgrade() -> None:
    op.drop_index("ix_manager_override_approved_by", table_name="manager_override")
    op.drop_index("ix_manager_override_entity", table_name="manager_override")
    op.drop_index("ix_manager_override_branch_type", table_name="manager_override")
    op.drop_index("ix_manager_override_branch", table_name="manager_override")
    op.drop_index("ix_manager_override_tenant", table_name="manager_override")
    op.drop_table("manager_override")
