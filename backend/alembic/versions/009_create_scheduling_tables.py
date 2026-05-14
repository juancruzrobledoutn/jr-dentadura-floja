"""Create employee scheduling and attendance tables.

Revision ID: 009_scheduling
Revises: 008_fiscal
Create Date: 2026-04-04

Tables: shift_template, shift_template_item, shift, attendance_log
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009_scheduling"
down_revision: Union[str, None] = "008_fiscal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # shift_template — Reusable weekly shift template
    # =========================================================================
    op.create_table(
        "shift_template",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
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
    op.create_index("ix_shift_template_tenant", "shift_template", ["tenant_id"])
    op.create_index("ix_shift_template_branch", "shift_template", ["branch_id"])
    op.create_index("ix_shift_template_is_active", "shift_template", ["is_active"])

    # =========================================================================
    # shift_template_item — Day/time slot in a template
    # =========================================================================
    op.create_table(
        "shift_template_item",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.BigInteger, sa.ForeignKey("shift_template.id"), nullable=False),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("min_staff", sa.Integer, server_default="1", nullable=False),
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
    op.create_index("ix_shift_template_item_template", "shift_template_item", ["template_id"])
    op.create_index("ix_shift_template_item_is_active", "shift_template_item", ["is_active"])

    # =========================================================================
    # shift — Scheduled shift for an employee
    # =========================================================================
    op.create_table(
        "shift",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("shift_date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("status", sa.Text, server_default="SCHEDULED", nullable=False),
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
    op.create_index("ix_shift_tenant", "shift", ["tenant_id"])
    op.create_index("ix_shift_branch", "shift", ["branch_id"])
    op.create_index("ix_shift_user", "shift", ["user_id"])
    op.create_index("ix_shift_branch_date", "shift", ["branch_id", "shift_date"])
    op.create_index("ix_shift_user_date", "shift", ["user_id", "shift_date"])
    op.create_index("ix_shift_is_active", "shift", ["is_active"])

    # =========================================================================
    # attendance_log — Clock-in/clock-out records
    # =========================================================================
    op.create_table(
        "attendance_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("shift_id", sa.BigInteger, sa.ForeignKey("shift.id"), nullable=True),
        sa.Column("clock_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clock_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hours_worked", sa.Float, nullable=True),
        sa.Column("overtime_hours", sa.Float, nullable=True),
        sa.Column("status", sa.Text, server_default="CLOCKED_IN", nullable=False),
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
    op.create_index("ix_attendance_log_tenant", "attendance_log", ["tenant_id"])
    op.create_index("ix_attendance_log_branch", "attendance_log", ["branch_id"])
    op.create_index("ix_attendance_log_user", "attendance_log", ["user_id"])
    op.create_index("ix_attendance_log_shift", "attendance_log", ["shift_id"])
    op.create_index("ix_attendance_branch_date", "attendance_log", ["branch_id", "clock_in"])
    op.create_index("ix_attendance_user", "attendance_log", ["user_id", "clock_in"])
    op.create_index("ix_attendance_log_is_active", "attendance_log", ["is_active"])


def downgrade() -> None:
    # attendance_log
    op.drop_index("ix_attendance_log_is_active", table_name="attendance_log")
    op.drop_index("ix_attendance_user", table_name="attendance_log")
    op.drop_index("ix_attendance_branch_date", table_name="attendance_log")
    op.drop_index("ix_attendance_log_shift", table_name="attendance_log")
    op.drop_index("ix_attendance_log_user", table_name="attendance_log")
    op.drop_index("ix_attendance_log_branch", table_name="attendance_log")
    op.drop_index("ix_attendance_log_tenant", table_name="attendance_log")
    op.drop_table("attendance_log")

    # shift
    op.drop_index("ix_shift_is_active", table_name="shift")
    op.drop_index("ix_shift_user_date", table_name="shift")
    op.drop_index("ix_shift_branch_date", table_name="shift")
    op.drop_index("ix_shift_user", table_name="shift")
    op.drop_index("ix_shift_branch", table_name="shift")
    op.drop_index("ix_shift_tenant", table_name="shift")
    op.drop_table("shift")

    # shift_template_item
    op.drop_index("ix_shift_template_item_is_active", table_name="shift_template_item")
    op.drop_index("ix_shift_template_item_template", table_name="shift_template_item")
    op.drop_table("shift_template_item")

    # shift_template
    op.drop_index("ix_shift_template_is_active", table_name="shift_template")
    op.drop_index("ix_shift_template_branch", table_name="shift_template")
    op.drop_index("ix_shift_template_tenant", table_name="shift_template")
    op.drop_table("shift_template")
