"""Create tip, tip distribution, and tip pool tables.

Revision ID: 007_tips
Revises: 006_cash_register
Create Date: 2026-04-04

Tip tracking: record tips per session, distribute among staff via configurable pools.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_tips"
down_revision: Union[str, None] = "006_cash_register"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tip
    op.create_table(
        "tip",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("table_session_id", sa.BigInteger, sa.ForeignKey("table_session.id"), nullable=True),
        sa.Column("check_id", sa.BigInteger, sa.ForeignKey("app_check.id"), nullable=True),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("payment_method", sa.Text, nullable=False),
        sa.Column("waiter_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
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
        sa.CheckConstraint("amount_cents > 0", name="chk_tip_amount_positive"),
    )
    op.create_index("ix_tip_tenant", "tip", ["tenant_id"])
    op.create_index("ix_tip_branch", "tip", ["branch_id"])
    op.create_index("ix_tip_session", "tip", ["table_session_id"])
    op.create_index("ix_tip_check", "tip", ["check_id"])
    op.create_index("ix_tip_waiter", "tip", ["waiter_id"])
    op.create_index("ix_tip_branch_waiter", "tip", ["branch_id", "waiter_id"])
    op.create_index("ix_tip_is_active", "tip", ["is_active"])

    # TipDistribution
    op.create_table(
        "tip_distribution",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("tip_id", sa.BigInteger, sa.ForeignKey("tip.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("role", sa.Text, nullable=False),
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
        sa.CheckConstraint("amount_cents > 0", name="chk_tip_distribution_amount_positive"),
    )
    op.create_index("ix_tip_distribution_tenant", "tip_distribution", ["tenant_id"])
    op.create_index("ix_tip_distribution_tip", "tip_distribution", ["tip_id"])
    op.create_index("ix_tip_distribution_user", "tip_distribution", ["user_id", "tip_id"])
    op.create_index("ix_tip_distribution_is_active", "tip_distribution", ["is_active"])

    # TipPool
    op.create_table(
        "tip_pool",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("waiter_percent", sa.Integer, nullable=False),
        sa.Column("kitchen_percent", sa.Integer, nullable=False),
        sa.Column("other_percent", sa.Integer, nullable=False),
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
        sa.CheckConstraint(
            "waiter_percent + kitchen_percent + other_percent = 100",
            name="chk_tip_pool_percents_sum_100",
        ),
        sa.CheckConstraint("waiter_percent >= 0", name="chk_tip_pool_waiter_non_negative"),
        sa.CheckConstraint("kitchen_percent >= 0", name="chk_tip_pool_kitchen_non_negative"),
        sa.CheckConstraint("other_percent >= 0", name="chk_tip_pool_other_non_negative"),
    )
    op.create_index("ix_tip_pool_tenant", "tip_pool", ["tenant_id"])
    op.create_index("ix_tip_pool_branch", "tip_pool", ["branch_id", "tenant_id"])
    op.create_index("ix_tip_pool_is_active", "tip_pool", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_tip_pool_is_active", table_name="tip_pool")
    op.drop_index("ix_tip_pool_branch", table_name="tip_pool")
    op.drop_index("ix_tip_pool_tenant", table_name="tip_pool")
    op.drop_table("tip_pool")

    op.drop_index("ix_tip_distribution_is_active", table_name="tip_distribution")
    op.drop_index("ix_tip_distribution_user", table_name="tip_distribution")
    op.drop_index("ix_tip_distribution_tip", table_name="tip_distribution")
    op.drop_index("ix_tip_distribution_tenant", table_name="tip_distribution")
    op.drop_table("tip_distribution")

    op.drop_index("ix_tip_is_active", table_name="tip")
    op.drop_index("ix_tip_branch_waiter", table_name="tip")
    op.drop_index("ix_tip_waiter", table_name="tip")
    op.drop_index("ix_tip_check", table_name="tip")
    op.drop_index("ix_tip_session", table_name="tip")
    op.drop_index("ix_tip_branch", table_name="tip")
    op.drop_index("ix_tip_tenant", table_name="tip")
    op.drop_table("tip")
