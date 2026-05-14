"""Create cash register, cash session, and cash movement tables.

Revision ID: 006_cash_register
Revises: 005_inventory
Create Date: 2026-04-04

Cash closing workflow: open session → record movements → close with actual count.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_cash_register"
down_revision: Union[str, None] = "005_inventory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CashRegister
    op.create_table(
        "cash_register",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("is_open", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("current_session_id", sa.BigInteger, nullable=True),
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
    op.create_index("ix_cash_register_tenant", "cash_register", ["tenant_id"])
    op.create_index("ix_cash_register_branch", "cash_register", ["branch_id", "tenant_id"])
    op.create_index("ix_cash_register_is_active", "cash_register", ["is_active"])

    # CashSession
    op.create_table(
        "cash_session",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("cash_register_id", sa.BigInteger, sa.ForeignKey("cash_register.id"), nullable=False),
        sa.Column("opened_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("closed_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opening_amount_cents", sa.Integer, nullable=False),
        sa.Column("expected_amount_cents", sa.Integer, nullable=True),
        sa.Column("actual_amount_cents", sa.Integer, nullable=True),
        sa.Column("difference_cents", sa.Integer, nullable=True),
        sa.Column("status", sa.Text, server_default="OPEN", nullable=False),
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
        sa.CheckConstraint("opening_amount_cents >= 0", name="chk_opening_amount_non_negative"),
    )
    op.create_index("ix_cash_session_tenant", "cash_session", ["tenant_id"])
    op.create_index("ix_cash_session_branch", "cash_session", ["branch_id"])
    op.create_index("ix_cash_session_register", "cash_session", ["cash_register_id"])
    op.create_index("ix_cash_session_status", "cash_session", ["status"])
    op.create_index("ix_cash_session_branch_status", "cash_session", ["branch_id", "status"])
    op.create_index("ix_cash_session_is_active", "cash_session", ["is_active"])

    # Add FK from cash_register.current_session_id -> cash_session.id (deferred to avoid circular)
    op.create_foreign_key(
        "fk_cash_register_current_session",
        "cash_register",
        "cash_session",
        ["current_session_id"],
        ["id"],
    )

    # CashMovement
    op.create_table(
        "cash_movement",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("cash_session_id", sa.BigInteger, sa.ForeignKey("cash_session.id"), nullable=False),
        sa.Column("movement_type", sa.Text, nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("payment_method", sa.Text, nullable=False),
        sa.Column("reference_type", sa.Text, nullable=True),
        sa.Column("reference_id", sa.BigInteger, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("performed_by_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=True),
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
    op.create_index("ix_cash_movement_tenant", "cash_movement", ["tenant_id"])
    op.create_index("ix_cash_movement_session", "cash_movement", ["cash_session_id"])
    op.create_index("ix_cash_movement_type", "cash_movement", ["movement_type"])
    op.create_index("ix_cash_movement_session_type", "cash_movement", ["cash_session_id", "movement_type"])
    op.create_index("ix_cash_movement_is_active", "cash_movement", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_cash_movement_is_active", table_name="cash_movement")
    op.drop_index("ix_cash_movement_session_type", table_name="cash_movement")
    op.drop_index("ix_cash_movement_type", table_name="cash_movement")
    op.drop_index("ix_cash_movement_session", table_name="cash_movement")
    op.drop_index("ix_cash_movement_tenant", table_name="cash_movement")
    op.drop_table("cash_movement")

    op.drop_constraint("fk_cash_register_current_session", "cash_register", type_="foreignkey")

    op.drop_index("ix_cash_session_is_active", table_name="cash_session")
    op.drop_index("ix_cash_session_branch_status", table_name="cash_session")
    op.drop_index("ix_cash_session_status", table_name="cash_session")
    op.drop_index("ix_cash_session_register", table_name="cash_session")
    op.drop_index("ix_cash_session_branch", table_name="cash_session")
    op.drop_index("ix_cash_session_tenant", table_name="cash_session")
    op.drop_table("cash_session")

    op.drop_index("ix_cash_register_is_active", table_name="cash_register")
    op.drop_index("ix_cash_register_branch", table_name="cash_register")
    op.drop_index("ix_cash_register_tenant", table_name="cash_register")
    op.drop_table("cash_register")
