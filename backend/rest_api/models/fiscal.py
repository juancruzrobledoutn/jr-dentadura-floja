"""AFIP fiscal integration models for Argentine electronic invoicing."""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import BigInteger, Float, Integer, Text, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, AuditMixin, BigIntPK


class FiscalPoint(AuditMixin, Base):
    """A fiscal point of sale (punto de venta) registered with AFIP."""
    __tablename__ = "fiscal_point"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )

    # AFIP punto de venta number (1-99999)
    point_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Type: ELECTRONIC, FISCAL_PRINTER
    type: Mapped[str] = mapped_column(Text, nullable=False)
    # Status: ACTIVE, INACTIVE
    status: Mapped[str] = mapped_column(Text, default="ACTIVE", nullable=False)
    last_invoice_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Argentine tax ID (11 digits)
    cuit: Mapped[str] = mapped_column(String(11), nullable=False)
    # Razón social
    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    # IVA condition: RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO
    iva_condition: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    invoices: Mapped[list["FiscalInvoice"]] = relationship(
        back_populates="fiscal_point", cascade="all, delete-orphan"
    )
    credit_notes: Mapped[list["CreditNote"]] = relationship(
        back_populates="fiscal_point", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_fiscal_point_branch", "branch_id"),
        Index("ix_fiscal_point_cuit", "cuit"),
    )


class FiscalInvoice(AuditMixin, Base):
    """Electronic invoice issued via AFIP."""
    __tablename__ = "fiscal_invoice"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    fiscal_point_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fiscal_point.id"), nullable=False, index=True
    )
    # FK to app_check (optional — invoice may exist without a check)
    check_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("app_check.id"), nullable=True
    )

    # Invoice type: A (resp. inscripto), B (consumidor final), C (monotributo)
    invoice_type: Mapped[str] = mapped_column(String(1), nullable=False)
    # Sequential per fiscal point
    invoice_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Código de Autorización Electrónico (14 digits)
    cae: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    cae_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Customer info (optional for type B/C)
    customer_doc_type: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # DNI, CUIT, CUIL, PASSPORT
    customer_doc_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Amounts (all in cents)
    net_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # Base imponible
    iva_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # IVA amount
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # Total con IVA
    iva_rate: Mapped[float] = mapped_column(Float, default=21.0, nullable=False)

    # AFIP response: A=Aprobado, R=Rechazado, O=Observado
    afip_result: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    # JSON string of AFIP observations
    afip_observations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status: DRAFT, AUTHORIZED, REJECTED, VOIDED
    status: Mapped[str] = mapped_column(Text, default="DRAFT", nullable=False, index=True)

    # Relationships
    fiscal_point: Mapped["FiscalPoint"] = relationship(back_populates="invoices")
    credit_notes: Mapped[list["CreditNote"]] = relationship(
        back_populates="original_invoice", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_fiscal_invoice_branch_date", "branch_id", "issue_date"),
        Index("ix_fiscal_invoice_cae", "cae"),
        Index("ix_fiscal_invoice_check", "check_id"),
    )


class CreditNote(AuditMixin, Base):
    """Credit note (nota de crédito) for refunds/corrections."""
    __tablename__ = "credit_note"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    fiscal_point_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fiscal_point.id"), nullable=False, index=True
    )
    original_invoice_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fiscal_invoice.id"), nullable=False, index=True
    )

    # Note type: A, B, C (matches original invoice type)
    note_type: Mapped[str] = mapped_column(String(1), nullable=False)
    note_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # CAE for the credit note
    cae: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    cae_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # Status: DRAFT, AUTHORIZED, REJECTED
    status: Mapped[str] = mapped_column(Text, default="DRAFT", nullable=False, index=True)

    # Relationships
    fiscal_point: Mapped["FiscalPoint"] = relationship(back_populates="credit_notes")
    original_invoice: Mapped["FiscalInvoice"] = relationship(back_populates="credit_notes")
