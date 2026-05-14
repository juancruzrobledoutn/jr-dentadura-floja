"""Create AFIP fiscal integration tables.

Revision ID: 008_fiscal
Revises: 007_tip
Create Date: 2026-04-04

Tables: fiscal_point, fiscal_invoice, credit_note
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_fiscal"
down_revision: Union[str, None] = "007_tips"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # fiscal_point — AFIP punto de venta
    # =========================================================================
    op.create_table(
        "fiscal_point",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("point_number", sa.Integer, nullable=False),
        sa.Column("type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, server_default="ACTIVE", nullable=False),
        sa.Column("last_invoice_number", sa.Integer, server_default="0", nullable=False),
        sa.Column("cuit", sa.String(11), nullable=False),
        sa.Column("business_name", sa.Text, nullable=False),
        sa.Column("iva_condition", sa.Text, nullable=False),
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
    op.create_index("ix_fiscal_point_tenant", "fiscal_point", ["tenant_id"])
    op.create_index("ix_fiscal_point_branch", "fiscal_point", ["branch_id"])
    op.create_index("ix_fiscal_point_cuit", "fiscal_point", ["cuit"])
    op.create_index("ix_fiscal_point_is_active", "fiscal_point", ["is_active"])

    # =========================================================================
    # fiscal_invoice — Electronic invoice (factura electrónica)
    # =========================================================================
    op.create_table(
        "fiscal_invoice",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("fiscal_point_id", sa.BigInteger, sa.ForeignKey("fiscal_point.id"), nullable=False),
        sa.Column("check_id", sa.BigInteger, sa.ForeignKey("app_check.id"), nullable=True),
        sa.Column("invoice_type", sa.String(1), nullable=False),
        sa.Column("invoice_number", sa.Integer, nullable=False),
        sa.Column("cae", sa.String(14), nullable=True),
        sa.Column("cae_expiry", sa.Date, nullable=True),
        sa.Column("issue_date", sa.Date, nullable=False),
        # Customer info
        sa.Column("customer_doc_type", sa.Text, nullable=True),
        sa.Column("customer_doc_number", sa.Text, nullable=True),
        sa.Column("customer_name", sa.Text, nullable=True),
        # Amounts
        sa.Column("net_amount_cents", sa.Integer, nullable=False),
        sa.Column("iva_amount_cents", sa.Integer, nullable=False),
        sa.Column("total_cents", sa.Integer, nullable=False),
        sa.Column("iva_rate", sa.Float, server_default="21.0", nullable=False),
        # AFIP response
        sa.Column("afip_result", sa.String(1), nullable=True),
        sa.Column("afip_observations", sa.Text, nullable=True),
        sa.Column("status", sa.Text, server_default="DRAFT", nullable=False),
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
    op.create_index("ix_fiscal_invoice_tenant", "fiscal_invoice", ["tenant_id"])
    op.create_index("ix_fiscal_invoice_branch", "fiscal_invoice", ["branch_id"])
    op.create_index("ix_fiscal_invoice_fiscal_point", "fiscal_invoice", ["fiscal_point_id"])
    op.create_index("ix_fiscal_invoice_status", "fiscal_invoice", ["status"])
    op.create_index("ix_fiscal_invoice_branch_date", "fiscal_invoice", ["branch_id", "issue_date"])
    op.create_index("ix_fiscal_invoice_cae", "fiscal_invoice", ["cae"])
    op.create_index("ix_fiscal_invoice_check", "fiscal_invoice", ["check_id"])
    op.create_index("ix_fiscal_invoice_is_active", "fiscal_invoice", ["is_active"])

    # =========================================================================
    # credit_note — Nota de crédito
    # =========================================================================
    op.create_table(
        "credit_note",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("fiscal_point_id", sa.BigInteger, sa.ForeignKey("fiscal_point.id"), nullable=False),
        sa.Column("original_invoice_id", sa.BigInteger, sa.ForeignKey("fiscal_invoice.id"), nullable=False),
        sa.Column("note_type", sa.String(1), nullable=False),
        sa.Column("note_number", sa.Integer, nullable=False),
        sa.Column("cae", sa.String(14), nullable=True),
        sa.Column("cae_expiry", sa.Date, nullable=True),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("status", sa.Text, server_default="DRAFT", nullable=False),
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
    op.create_index("ix_credit_note_tenant", "credit_note", ["tenant_id"])
    op.create_index("ix_credit_note_branch", "credit_note", ["branch_id"])
    op.create_index("ix_credit_note_fiscal_point", "credit_note", ["fiscal_point_id"])
    op.create_index("ix_credit_note_original_invoice", "credit_note", ["original_invoice_id"])
    op.create_index("ix_credit_note_status", "credit_note", ["status"])
    op.create_index("ix_credit_note_is_active", "credit_note", ["is_active"])


def downgrade() -> None:
    # credit_note
    op.drop_index("ix_credit_note_is_active", table_name="credit_note")
    op.drop_index("ix_credit_note_status", table_name="credit_note")
    op.drop_index("ix_credit_note_original_invoice", table_name="credit_note")
    op.drop_index("ix_credit_note_fiscal_point", table_name="credit_note")
    op.drop_index("ix_credit_note_branch", table_name="credit_note")
    op.drop_index("ix_credit_note_tenant", table_name="credit_note")
    op.drop_table("credit_note")

    # fiscal_invoice
    op.drop_index("ix_fiscal_invoice_is_active", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_check", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_cae", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_branch_date", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_status", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_fiscal_point", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_branch", table_name="fiscal_invoice")
    op.drop_index("ix_fiscal_invoice_tenant", table_name="fiscal_invoice")
    op.drop_table("fiscal_invoice")

    # fiscal_point
    op.drop_index("ix_fiscal_point_is_active", table_name="fiscal_point")
    op.drop_index("ix_fiscal_point_cuit", table_name="fiscal_point")
    op.drop_index("ix_fiscal_point_branch", table_name="fiscal_point")
    op.drop_index("ix_fiscal_point_tenant", table_name="fiscal_point")
    op.drop_table("fiscal_point")
