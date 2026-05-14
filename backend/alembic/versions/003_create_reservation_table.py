"""Create reservation table for table booking system.

Revision ID: 003_reservation
Revises: 002_is_available
Create Date: 2026-04-04

Reservation statuses: PENDING, CONFIRMED, SEATED, COMPLETED, CANCELED, NO_SHOW
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_reservation"
down_revision: Union[str, None] = "002_is_available"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reservation",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("app_tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("customer_name", sa.Text, nullable=False),
        sa.Column("customer_phone", sa.Text, nullable=True),
        sa.Column("customer_email", sa.Text, nullable=True),
        sa.Column("party_size", sa.Integer, nullable=False),
        sa.Column("reservation_date", sa.Date, nullable=False),
        sa.Column("reservation_time", sa.Time, nullable=False),
        sa.Column("duration_minutes", sa.Integer, server_default="90", nullable=False),
        sa.Column("table_id", sa.BigInteger, sa.ForeignKey("app_table.id"), nullable=True),
        sa.Column("status", sa.Text, server_default="PENDING", nullable=False),
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
    op.create_index("ix_reservation_branch_date", "reservation", ["branch_id", "reservation_date"])
    op.create_index("ix_reservation_tenant", "reservation", ["tenant_id"])
    op.create_index("ix_reservation_date", "reservation", ["reservation_date"])
    op.create_index("ix_reservation_status", "reservation", ["status"])
    op.create_index("ix_reservation_is_active", "reservation", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_reservation_is_active", table_name="reservation")
    op.drop_index("ix_reservation_status", table_name="reservation")
    op.drop_index("ix_reservation_date", table_name="reservation")
    op.drop_index("ix_reservation_tenant", table_name="reservation")
    op.drop_index("ix_reservation_branch_date", table_name="reservation")
    op.drop_table("reservation")
