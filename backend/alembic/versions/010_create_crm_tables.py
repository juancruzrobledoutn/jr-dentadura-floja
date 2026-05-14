"""Create CRM tables (customer profiles, visits, loyalty).

Revision ID: 010_crm
Revises: 009_scheduling
Create Date: 2026-04-04

Tables: customer_profile, customer_visit, loyalty_transaction, loyalty_rule
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010_crm"
down_revision: Union[str, None] = "009_scheduling"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # customer_profile — Customer CRM profile
    # =========================================================================
    op.create_table(
        "customer_profile",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("device_id", sa.String(255), nullable=True),
        sa.Column("customer_id", sa.BigInteger, sa.ForeignKey("customer.id"), nullable=True),
        # Preferences
        sa.Column("dietary_preferences", sa.Text, nullable=True),
        sa.Column("allergen_ids", sa.Text, nullable=True),
        sa.Column("preferred_language", sa.String(5), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        # Loyalty
        sa.Column("loyalty_points", sa.Integer, server_default="0", nullable=False),
        sa.Column("loyalty_tier", sa.String(20), server_default="BRONZE", nullable=False),
        sa.Column("total_visits", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_spent_cents", sa.BigInteger, server_default="0", nullable=False),
        sa.Column("last_visit_at", sa.DateTime(timezone=True), nullable=True),
        # Consent
        sa.Column("marketing_consent", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("data_consent", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("consent_date", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_customer_profile_tenant", "customer_profile", ["tenant_id"])
    op.create_index("ix_customer_profile_email", "customer_profile", ["tenant_id", "email"], unique=True)
    op.create_index("ix_customer_profile_phone", "customer_profile", ["tenant_id", "phone"])
    op.create_index("ix_customer_profile_device", "customer_profile", ["device_id"])
    op.create_index("ix_customer_profile_tier", "customer_profile", ["tenant_id", "loyalty_tier"])
    op.create_index("ix_customer_profile_is_active", "customer_profile", ["is_active"])

    # =========================================================================
    # customer_visit — Visit records
    # =========================================================================
    op.create_table(
        "customer_visit",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("branch_id", sa.BigInteger, sa.ForeignKey("branch.id"), nullable=False),
        sa.Column("customer_profile_id", sa.BigInteger, sa.ForeignKey("customer_profile.id"), nullable=False),
        sa.Column("table_session_id", sa.BigInteger, sa.ForeignKey("table_session.id"), nullable=True),
        sa.Column("visit_date", sa.Date, nullable=False),
        sa.Column("party_size", sa.Integer, nullable=True),
        sa.Column("total_spent_cents", sa.BigInteger, server_default="0", nullable=False),
        sa.Column("rating", sa.Integer, nullable=True),
        sa.Column("feedback", sa.Text, nullable=True),
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
    op.create_index("ix_customer_visit_tenant", "customer_visit", ["tenant_id"])
    op.create_index("ix_customer_visit_branch", "customer_visit", ["branch_id"])
    op.create_index("ix_customer_visit_profile", "customer_visit", ["customer_profile_id"])
    op.create_index("ix_customer_visit_profile_date", "customer_visit", ["customer_profile_id", "visit_date"])
    op.create_index("ix_customer_visit_branch_date", "customer_visit", ["branch_id", "visit_date"])
    op.create_index("ix_customer_visit_is_active", "customer_visit", ["is_active"])

    # =========================================================================
    # loyalty_transaction — Points earned/redeemed
    # =========================================================================
    op.create_table(
        "loyalty_transaction",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("customer_profile_id", sa.BigInteger, sa.ForeignKey("customer_profile.id"), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("points", sa.Integer, nullable=False),
        sa.Column("balance_after", sa.Integer, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("reference_type", sa.String(50), nullable=True),
        sa.Column("reference_id", sa.BigInteger, nullable=True),
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
    op.create_index("ix_loyalty_tx_tenant", "loyalty_transaction", ["tenant_id"])
    op.create_index("ix_loyalty_tx_profile", "loyalty_transaction", ["customer_profile_id", "transaction_type"])
    op.create_index("ix_loyalty_tx_is_active", "loyalty_transaction", ["is_active"])

    # =========================================================================
    # loyalty_rule — Points earning configuration
    # =========================================================================
    op.create_table(
        "loyalty_rule",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("rule_type", sa.String(30), nullable=False),
        sa.Column("points_per_unit", sa.Integer, nullable=False),
        sa.Column("unit_amount_cents", sa.BigInteger, nullable=True),
        sa.Column("min_spend_cents", sa.BigInteger, nullable=True),
        sa.Column("silver_threshold", sa.Integer, server_default="500", nullable=False),
        sa.Column("gold_threshold", sa.Integer, server_default="2000", nullable=False),
        sa.Column("platinum_threshold", sa.Integer, server_default="5000", nullable=False),
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
    op.create_index("ix_loyalty_rule_tenant", "loyalty_rule", ["tenant_id"])
    op.create_index("ix_loyalty_rule_is_active", "loyalty_rule", ["is_active"])


def downgrade() -> None:
    # loyalty_rule
    op.drop_index("ix_loyalty_rule_is_active", table_name="loyalty_rule")
    op.drop_index("ix_loyalty_rule_tenant", table_name="loyalty_rule")
    op.drop_table("loyalty_rule")

    # loyalty_transaction
    op.drop_index("ix_loyalty_tx_is_active", table_name="loyalty_transaction")
    op.drop_index("ix_loyalty_tx_profile", table_name="loyalty_transaction")
    op.drop_index("ix_loyalty_tx_tenant", table_name="loyalty_transaction")
    op.drop_table("loyalty_transaction")

    # customer_visit
    op.drop_index("ix_customer_visit_is_active", table_name="customer_visit")
    op.drop_index("ix_customer_visit_branch_date", table_name="customer_visit")
    op.drop_index("ix_customer_visit_profile_date", table_name="customer_visit")
    op.drop_index("ix_customer_visit_profile", table_name="customer_visit")
    op.drop_index("ix_customer_visit_branch", table_name="customer_visit")
    op.drop_index("ix_customer_visit_tenant", table_name="customer_visit")
    op.drop_table("customer_visit")

    # customer_profile
    op.drop_index("ix_customer_profile_is_active", table_name="customer_profile")
    op.drop_index("ix_customer_profile_tier", table_name="customer_profile")
    op.drop_index("ix_customer_profile_device", table_name="customer_profile")
    op.drop_index("ix_customer_profile_phone", table_name="customer_profile")
    op.drop_index("ix_customer_profile_email", table_name="customer_profile")
    op.drop_index("ix_customer_profile_tenant", table_name="customer_profile")
    op.drop_table("customer_profile")
