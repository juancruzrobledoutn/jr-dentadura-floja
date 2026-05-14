"""
Fiscal Service - AFIP Electronic Invoicing.

CLEAN-ARCH: Handles fiscal invoice business logic.

NOTE: Actual AFIP WSFE (Web Service de Facturación Electrónica) integration
requires the 'pyafipws' library and AFIP certificates. This service
provides the data layer and business logic. AFIP API calls are stubbed
for now and should be implemented with real AFIP credentials.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import select, func, extract, and_
from sqlalchemy.orm import Session

from rest_api.models import FiscalPoint, FiscalInvoice, CreditNote, Check
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.config.settings import settings
from shared.utils.exceptions import ExternalServiceError, NotFoundError, ValidationError

logger = get_logger(__name__)


class FiscalService:
    """AFIP fiscal invoice management.

    NOTE: Actual AFIP WSFE (Web Service de Facturación Electrónica) integration
    requires the 'pyafipws' library and AFIP certificates. This service
    provides the data layer and business logic. AFIP API calls are stubbed
    for now and should be implemented with real AFIP credentials.
    """

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Fiscal Point CRUD
    # =========================================================================

    def list_fiscal_points(
        self,
        tenant_id: int,
        branch_id: int | None = None,
        *,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        """List fiscal points, optionally filtered by branch."""
        stmt = select(FiscalPoint).where(FiscalPoint.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.where(FiscalPoint.branch_id == branch_id)
        if not include_inactive:
            stmt = stmt.where(FiscalPoint.is_active.is_(True))
        points = self._db.scalars(stmt).all()
        return [self._point_to_dict(p) for p in points]

    def get_fiscal_point(self, point_id: int, tenant_id: int) -> dict[str, Any]:
        """Get a specific fiscal point."""
        point = self._db.scalar(
            select(FiscalPoint).where(
                FiscalPoint.id == point_id,
                FiscalPoint.tenant_id == tenant_id,
                FiscalPoint.is_active.is_(True),
            )
        )
        if not point:
            raise NotFoundError("Punto fiscal", point_id, tenant_id=tenant_id)
        return self._point_to_dict(point)

    def create_fiscal_point(
        self,
        data: dict[str, Any],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """Create a new fiscal point."""
        self._validate_cuit(data.get("cuit", ""))
        self._validate_point_number(data["point_number"], tenant_id, data["branch_id"])

        point = FiscalPoint(
            tenant_id=tenant_id,
            branch_id=data["branch_id"],
            point_number=data["point_number"],
            type=data["type"],
            status=data.get("status", "ACTIVE"),
            cuit=data["cuit"],
            business_name=data["business_name"],
            iva_condition=data["iva_condition"],
        )
        point.set_created_by(user_id, user_email)
        self._db.add(point)
        safe_commit(self._db)
        self._db.refresh(point)
        logger.info(
            "Fiscal point created",
            extra={"fiscal_point_id": point.id, "cuit": point.cuit},
        )
        return self._point_to_dict(point)

    def update_fiscal_point(
        self,
        point_id: int,
        data: dict[str, Any],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """Update a fiscal point."""
        point = self._db.scalar(
            select(FiscalPoint).where(
                FiscalPoint.id == point_id,
                FiscalPoint.tenant_id == tenant_id,
                FiscalPoint.is_active.is_(True),
            )
        )
        if not point:
            raise NotFoundError("Punto fiscal", point_id, tenant_id=tenant_id)

        for key, value in data.items():
            if hasattr(point, key) and key not in ("id", "tenant_id"):
                setattr(point, key, value)

        point.set_updated_by(user_id, user_email)
        safe_commit(self._db)
        self._db.refresh(point)
        return self._point_to_dict(point)

    def delete_fiscal_point(
        self,
        point_id: int,
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> None:
        """Soft delete a fiscal point."""
        point = self._db.scalar(
            select(FiscalPoint).where(
                FiscalPoint.id == point_id,
                FiscalPoint.tenant_id == tenant_id,
                FiscalPoint.is_active.is_(True),
            )
        )
        if not point:
            raise NotFoundError("Punto fiscal", point_id, tenant_id=tenant_id)

        # Check for active invoices
        active_invoices = self._db.scalar(
            select(func.count()).select_from(FiscalInvoice).where(
                FiscalInvoice.fiscal_point_id == point_id,
                FiscalInvoice.is_active.is_(True),
                FiscalInvoice.status != "VOIDED",
            )
        )
        if active_invoices and active_invoices > 0:
            raise ValidationError(
                f"El punto fiscal tiene {active_invoices} facturas activas. "
                "No se puede eliminar.",
                field="id",
            )

        point.soft_delete(user_id, user_email)
        safe_commit(self._db)

    # =========================================================================
    # Invoice Operations
    # =========================================================================

    def create_invoice(
        self,
        check_id: int | None,
        invoice_type: str,
        fiscal_point_id: int,
        tenant_id: int,
        branch_id: int,
        user_id: int,
        user_email: str,
        customer_data: dict[str, Any] | None = None,
        *,
        iva_rate: float = 21.0,
    ) -> dict[str, Any]:
        """Create invoice from check data. Calls AFIP for CAE.

        Args:
            check_id: ID of the check to invoice (optional).
            invoice_type: A, B, or C.
            fiscal_point_id: Fiscal point to issue from.
            tenant_id: Tenant ID.
            branch_id: Branch ID.
            user_id: Acting user ID.
            user_email: Acting user email.
            customer_data: Optional customer info (doc_type, doc_number, name).
            iva_rate: IVA percentage (default 21.0).

        Returns:
            Created invoice as dict.
        """
        # Validate invoice type
        if invoice_type not in ("A", "B", "C"):
            raise ValidationError("Tipo de factura inválido. Debe ser A, B o C.", field="invoice_type")

        # Get fiscal point
        point = self._db.scalar(
            select(FiscalPoint).where(
                FiscalPoint.id == fiscal_point_id,
                FiscalPoint.tenant_id == tenant_id,
                FiscalPoint.is_active.is_(True),
            )
        )
        if not point:
            raise NotFoundError("Punto fiscal", fiscal_point_id, tenant_id=tenant_id)

        # Validate invoice type vs IVA condition
        self._validate_invoice_type_for_condition(invoice_type, point.iva_condition)

        # Calculate amounts from check or manual
        total_cents = 0
        if check_id:
            check = self._db.scalar(
                select(Check).where(
                    Check.id == check_id,
                    Check.tenant_id == tenant_id,
                )
            )
            if not check:
                raise NotFoundError("Cuenta", check_id, tenant_id=tenant_id)
            total_cents = check.total_cents
        else:
            raise ValidationError("Se requiere un check_id para facturar.", field="check_id")

        # Calculate net + IVA
        net_amount_cents = int(total_cents / (1 + iva_rate / 100))
        iva_amount_cents = total_cents - net_amount_cents

        # Get next invoice number
        next_number = point.last_invoice_number + 1

        # STUB: Call AFIP WSFE for CAE
        afip_response = self._call_afip_wsfe({
            "point_number": point.point_number,
            "invoice_type": invoice_type,
            "invoice_number": next_number,
            "cuit": point.cuit,
            "net_amount_cents": net_amount_cents,
            "iva_amount_cents": iva_amount_cents,
            "total_cents": total_cents,
            "iva_rate": iva_rate,
            "issue_date": date.today(),
            "customer_data": customer_data,
        })

        # Create invoice record
        invoice = FiscalInvoice(
            tenant_id=tenant_id,
            branch_id=branch_id,
            fiscal_point_id=fiscal_point_id,
            check_id=check_id,
            invoice_type=invoice_type,
            invoice_number=next_number,
            cae=afip_response.get("cae"),
            cae_expiry=afip_response.get("cae_expiry"),
            issue_date=date.today(),
            customer_doc_type=customer_data.get("doc_type") if customer_data else None,
            customer_doc_number=customer_data.get("doc_number") if customer_data else None,
            customer_name=customer_data.get("name") if customer_data else None,
            net_amount_cents=net_amount_cents,
            iva_amount_cents=iva_amount_cents,
            total_cents=total_cents,
            iva_rate=iva_rate,
            afip_result=afip_response.get("result"),
            afip_observations=json.dumps(afip_response.get("observations", [])),
            status="AUTHORIZED" if afip_response.get("result") == "A" else "REJECTED",
        )
        invoice.set_created_by(user_id, user_email)
        self._db.add(invoice)

        # Update last invoice number on fiscal point
        point.last_invoice_number = next_number
        point.set_updated_by(user_id, user_email)

        safe_commit(self._db)
        self._db.refresh(invoice)

        logger.info(
            "Fiscal invoice created",
            extra={
                "invoice_id": invoice.id,
                "type": invoice_type,
                "cae": invoice.cae,
                "result": invoice.afip_result,
            },
        )
        return self._invoice_to_dict(invoice)

    def get_invoice(self, invoice_id: int, tenant_id: int) -> dict[str, Any]:
        """Get a specific invoice."""
        invoice = self._db.scalar(
            select(FiscalInvoice).where(
                FiscalInvoice.id == invoice_id,
                FiscalInvoice.tenant_id == tenant_id,
                FiscalInvoice.is_active.is_(True),
            )
        )
        if not invoice:
            raise NotFoundError("Factura", invoice_id, tenant_id=tenant_id)
        return self._invoice_to_dict(invoice)

    def list_invoices(
        self,
        tenant_id: int,
        branch_id: int | None = None,
        *,
        status: str | None = None,
        invoice_type: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List invoices with optional filters."""
        stmt = select(FiscalInvoice).where(
            FiscalInvoice.tenant_id == tenant_id,
            FiscalInvoice.is_active.is_(True),
        )
        if branch_id:
            stmt = stmt.where(FiscalInvoice.branch_id == branch_id)
        if status:
            stmt = stmt.where(FiscalInvoice.status == status)
        if invoice_type:
            stmt = stmt.where(FiscalInvoice.invoice_type == invoice_type)
        if date_from:
            stmt = stmt.where(FiscalInvoice.issue_date >= date_from)
        if date_to:
            stmt = stmt.where(FiscalInvoice.issue_date <= date_to)

        stmt = stmt.order_by(FiscalInvoice.issue_date.desc(), FiscalInvoice.id.desc())
        stmt = stmt.offset(offset).limit(limit)

        invoices = self._db.scalars(stmt).all()
        return [self._invoice_to_dict(inv) for inv in invoices]

    # =========================================================================
    # Credit Note Operations
    # =========================================================================

    def void_invoice(
        self,
        invoice_id: int,
        reason: str,
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> dict[str, Any]:
        """Create credit note to void an invoice."""
        invoice = self._db.scalar(
            select(FiscalInvoice).where(
                FiscalInvoice.id == invoice_id,
                FiscalInvoice.tenant_id == tenant_id,
                FiscalInvoice.is_active.is_(True),
            )
        )
        if not invoice:
            raise NotFoundError("Factura", invoice_id, tenant_id=tenant_id)

        if invoice.status != "AUTHORIZED":
            raise ValidationError(
                "Solo se pueden anular facturas autorizadas.",
                field="status",
            )

        # Get fiscal point for next note number
        point = self._db.scalar(
            select(FiscalPoint).where(FiscalPoint.id == invoice.fiscal_point_id)
        )
        if not point:
            raise NotFoundError("Punto fiscal", invoice.fiscal_point_id)

        # Count existing credit notes for numbering
        note_count = self._db.scalar(
            select(func.count()).select_from(CreditNote).where(
                CreditNote.fiscal_point_id == point.id,
                CreditNote.is_active.is_(True),
            )
        ) or 0
        next_note_number = note_count + 1

        # STUB: Call AFIP for credit note CAE
        afip_response = self._call_afip_wsfe({
            "point_number": point.point_number,
            "invoice_type": invoice.invoice_type,
            "invoice_number": next_note_number,
            "is_credit_note": True,
            "original_cae": invoice.cae,
            "amount_cents": invoice.total_cents,
            "reason": reason,
        })

        credit_note = CreditNote(
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            fiscal_point_id=invoice.fiscal_point_id,
            original_invoice_id=invoice.id,
            note_type=invoice.invoice_type,
            note_number=next_note_number,
            cae=afip_response.get("cae"),
            cae_expiry=afip_response.get("cae_expiry"),
            amount_cents=invoice.total_cents,
            reason=reason,
            status="AUTHORIZED" if afip_response.get("result") == "A" else "REJECTED",
        )
        credit_note.set_created_by(user_id, user_email)
        self._db.add(credit_note)

        # Mark original invoice as voided
        if afip_response.get("result") == "A":
            invoice.status = "VOIDED"
            invoice.set_updated_by(user_id, user_email)

        safe_commit(self._db)
        self._db.refresh(credit_note)

        logger.info(
            "Credit note created",
            extra={
                "credit_note_id": credit_note.id,
                "original_invoice_id": invoice_id,
                "result": credit_note.status,
            },
        )
        return self._credit_note_to_dict(credit_note)

    # =========================================================================
    # Reports
    # =========================================================================

    def get_monthly_report(
        self,
        tenant_id: int,
        branch_id: int,
        year: int,
        month: int,
    ) -> dict[str, Any]:
        """IVA Ventas report for monthly AFIP filing.

        Groups by invoice type, sums net + IVA amounts.
        """
        stmt = (
            select(
                FiscalInvoice.invoice_type,
                func.count(FiscalInvoice.id).label("count"),
                func.sum(FiscalInvoice.net_amount_cents).label("total_net"),
                func.sum(FiscalInvoice.iva_amount_cents).label("total_iva"),
                func.sum(FiscalInvoice.total_cents).label("total"),
            )
            .where(
                FiscalInvoice.tenant_id == tenant_id,
                FiscalInvoice.branch_id == branch_id,
                FiscalInvoice.is_active.is_(True),
                FiscalInvoice.status == "AUTHORIZED",
                extract("year", FiscalInvoice.issue_date) == year,
                extract("month", FiscalInvoice.issue_date) == month,
            )
            .group_by(FiscalInvoice.invoice_type)
        )

        rows = self._db.execute(stmt).all()

        # Credit notes in the same period
        cn_stmt = (
            select(
                CreditNote.note_type,
                func.count(CreditNote.id).label("count"),
                func.sum(CreditNote.amount_cents).label("total"),
            )
            .where(
                CreditNote.tenant_id == tenant_id,
                CreditNote.branch_id == branch_id,
                CreditNote.is_active.is_(True),
                CreditNote.status == "AUTHORIZED",
            )
            .group_by(CreditNote.note_type)
        )
        cn_rows = self._db.execute(cn_stmt).all()

        invoice_summary = []
        grand_net = 0
        grand_iva = 0
        grand_total = 0
        for row in rows:
            net = row.total_net or 0
            iva = row.total_iva or 0
            total = row.total or 0
            grand_net += net
            grand_iva += iva
            grand_total += total
            invoice_summary.append({
                "invoice_type": row.invoice_type,
                "count": row.count,
                "net_amount_cents": net,
                "iva_amount_cents": iva,
                "total_cents": total,
            })

        cn_summary = []
        cn_grand_total = 0
        for row in cn_rows:
            total = row.total or 0
            cn_grand_total += total
            cn_summary.append({
                "note_type": row.note_type,
                "count": row.count,
                "total_cents": total,
            })

        return {
            "year": year,
            "month": month,
            "branch_id": branch_id,
            "invoices": invoice_summary,
            "credit_notes": cn_summary,
            "totals": {
                "net_amount_cents": grand_net,
                "iva_amount_cents": grand_iva,
                "total_cents": grand_total,
                "credit_notes_cents": cn_grand_total,
                "net_fiscal_cents": grand_total - cn_grand_total,
            },
        }

    # =========================================================================
    # AFIP WSFE Stub
    # =========================================================================

    def _call_afip_wsfe(self, invoice_data: dict[str, Any]) -> dict[str, Any]:
        """Call AFIP Web Service de Facturación Electrónica.

        S3.1 — Gated by `settings.afip_environment`:

        - ``stub`` (default): returns a simulated CAE for dev/test. If the
          deployment environment is production, the stub refuses to run and
          raises ``ExternalServiceError`` (HTTP 503) — this is a defence-in-depth
          guard for the case where ``validate_production_secrets`` was bypassed
          (e.g. someone flipped `ENVIRONMENT=production` at runtime).

        - ``production``: real AFIP WSFE call. NOT YET IMPLEMENTED in this
          codebase. Raises ``NotImplementedError``. The real implementation
          will need:
            1. Authenticate with AFIP WSAA (Web Service de Autenticación
               y Autorización) using the X.509 certificate.
            2. Call FECAESolicitar on the WSFE endpoint.
            3. Parse the response for CAE + observations.

        Returns:
            AFIP response dict with ``cae``, ``cae_expiry``, ``result``,
            ``observations``.

        Raises:
            NotImplementedError: when ``afip_environment == 'production'``.
            ExternalServiceError (503): when ``afip_environment == 'stub'`` but
                ``environment in ('production', 'prod')``.
        """
        # Production AFIP mode — real WSFE integration is not yet implemented.
        # Surface a NotImplementedError so the failure is explicit and traceable
        # (deployment will fail the request loudly instead of silently emitting
        # a fake CAE). When the real integration ships, replace this branch.
        if settings.afip_environment == "production":
            raise NotImplementedError(
                "AFIP production mode is not implemented in this codebase. "
                "Requires pyafipws + AFIP certificates (CN, CRT, KEY). "
                "Implement real FECAESolicitar call here, or set "
                "AFIP_ENVIRONMENT=stub for dev/test."
            )

        # Stub mode — refuse to emit a fake CAE if the deployment is production.
        # This is the defence-in-depth gate: validate_production_secrets() blocks
        # startup, but if it was bypassed (e.g. flag flipped at runtime), this
        # check ensures we still fail loudly at request time.
        if settings.environment in ("production", "prod"):
            logger.error(
                "AFIP stub blocked in production environment. "
                "Refusing to emit fake CAE to real customer.",
                extra={
                    "environment": settings.environment,
                    "afip_environment": settings.afip_environment,
                    "invoice_data_keys": list(invoice_data.keys()),
                },
            )
            raise ExternalServiceError(
                service="AFIP",
                is_unavailable=True,
                environment=settings.environment,
                afip_environment=settings.afip_environment,
            )

        # Safe to run the stub (dev/staging/test). Emit a warning so any
        # accidental stub invocation in shared envs is auditable.
        logger.warning(
            "STUB: AFIP WSFE call simulated. NOT FOR PRODUCTION.",
            extra={
                "environment": settings.environment,
                "invoice_data_keys": list(invoice_data.keys()),
                "point_number": invoice_data.get("point_number"),
                "invoice_number": invoice_data.get("invoice_number"),
            },
        )
        return {
            "cae": "00000000000000",
            "cae_expiry": date.today() + timedelta(days=10),
            "result": "A",  # A=Aprobado
            "observations": [],
        }

    # =========================================================================
    # Validation Helpers
    # =========================================================================

    def _validate_cuit(self, cuit: str) -> None:
        """Validate Argentine CUIT format (11 digits)."""
        if not cuit or len(cuit) != 11 or not cuit.isdigit():
            raise ValidationError(
                "CUIT inválido. Debe tener 11 dígitos numéricos.",
                field="cuit",
            )

    def _validate_point_number(self, point_number: int, tenant_id: int, branch_id: int) -> None:
        """Validate fiscal point number is unique per branch."""
        if point_number < 1 or point_number > 99999:
            raise ValidationError(
                "Número de punto de venta inválido (1-99999).",
                field="point_number",
            )
        existing = self._db.scalar(
            select(FiscalPoint).where(
                FiscalPoint.tenant_id == tenant_id,
                FiscalPoint.branch_id == branch_id,
                FiscalPoint.point_number == point_number,
                FiscalPoint.is_active.is_(True),
            )
        )
        if existing:
            raise ValidationError(
                f"Ya existe un punto de venta #{point_number} en esta sucursal.",
                field="point_number",
            )

    def _validate_invoice_type_for_condition(self, invoice_type: str, iva_condition: str) -> None:
        """Validate invoice type matches IVA condition."""
        valid_types = {
            "RESPONSABLE_INSCRIPTO": ("A", "B"),
            "MONOTRIBUTO": ("C",),
            "EXENTO": ("C",),
        }
        allowed = valid_types.get(iva_condition, ())
        if invoice_type not in allowed:
            raise ValidationError(
                f"Tipo de factura '{invoice_type}' no válido para condición IVA '{iva_condition}'. "
                f"Tipos permitidos: {', '.join(allowed)}.",
                field="invoice_type",
            )

    # =========================================================================
    # Serialization Helpers
    # =========================================================================

    def _point_to_dict(self, point: FiscalPoint) -> dict[str, Any]:
        """Convert FiscalPoint to dict."""
        return {
            "id": point.id,
            "tenant_id": point.tenant_id,
            "branch_id": point.branch_id,
            "point_number": point.point_number,
            "type": point.type,
            "status": point.status,
            "last_invoice_number": point.last_invoice_number,
            "cuit": point.cuit,
            "business_name": point.business_name,
            "iva_condition": point.iva_condition,
            "is_active": point.is_active,
            "created_at": point.created_at.isoformat() if point.created_at else None,
        }

    def _invoice_to_dict(self, inv: FiscalInvoice) -> dict[str, Any]:
        """Convert FiscalInvoice to dict."""
        return {
            "id": inv.id,
            "tenant_id": inv.tenant_id,
            "branch_id": inv.branch_id,
            "fiscal_point_id": inv.fiscal_point_id,
            "check_id": inv.check_id,
            "invoice_type": inv.invoice_type,
            "invoice_number": inv.invoice_number,
            "cae": inv.cae,
            "cae_expiry": inv.cae_expiry.isoformat() if inv.cae_expiry else None,
            "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
            "customer_doc_type": inv.customer_doc_type,
            "customer_doc_number": inv.customer_doc_number,
            "customer_name": inv.customer_name,
            "net_amount_cents": inv.net_amount_cents,
            "iva_amount_cents": inv.iva_amount_cents,
            "total_cents": inv.total_cents,
            "iva_rate": inv.iva_rate,
            "afip_result": inv.afip_result,
            "afip_observations": inv.afip_observations,
            "status": inv.status,
            "is_active": inv.is_active,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }

    def _credit_note_to_dict(self, cn: CreditNote) -> dict[str, Any]:
        """Convert CreditNote to dict."""
        return {
            "id": cn.id,
            "tenant_id": cn.tenant_id,
            "branch_id": cn.branch_id,
            "fiscal_point_id": cn.fiscal_point_id,
            "original_invoice_id": cn.original_invoice_id,
            "note_type": cn.note_type,
            "note_number": cn.note_number,
            "cae": cn.cae,
            "cae_expiry": cn.cae_expiry.isoformat() if cn.cae_expiry else None,
            "amount_cents": cn.amount_cents,
            "reason": cn.reason,
            "status": cn.status,
            "is_active": cn.is_active,
            "created_at": cn.created_at.isoformat() if cn.created_at else None,
        }
