"""
AFIP Fiscal Integration endpoints.

CLEAN-ARCH: Thin router that delegates to FiscalService.
Handles: fiscal point CRUD, invoice creation, credit notes, monthly reports.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain import FiscalService
from shared.utils.schemas import (
    FiscalPointOutput,
    FiscalInvoiceOutput,
    FiscalCreditNoteOutput,
    FiscalMonthlyReportOutput,
)


router = APIRouter(prefix="/fiscal", tags=["admin-fiscal"])


# =============================================================================
# Request Schemas
# =============================================================================


class FiscalPointCreate(BaseModel):
    branch_id: int
    point_number: int = Field(ge=1, le=99999)
    type: str = Field(pattern="^(ELECTRONIC|FISCAL_PRINTER)$")
    cuit: str = Field(min_length=11, max_length=11)
    business_name: str = Field(min_length=1)
    iva_condition: str = Field(pattern="^(RESPONSABLE_INSCRIPTO|MONOTRIBUTO|EXENTO)$")


class FiscalPointUpdate(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    business_name: Optional[str] = None
    iva_condition: Optional[str] = Field(
        default=None, pattern="^(RESPONSABLE_INSCRIPTO|MONOTRIBUTO|EXENTO)$"
    )


class InvoiceCreate(BaseModel):
    check_id: int
    invoice_type: str = Field(pattern="^[ABC]$")
    fiscal_point_id: int
    branch_id: int
    iva_rate: float = Field(default=21.0, ge=0, le=100)
    customer_doc_type: Optional[str] = None
    customer_doc_number: Optional[str] = None
    customer_name: Optional[str] = None


class CreditNoteCreate(BaseModel):
    invoice_id: int
    reason: str = Field(min_length=1)


# =============================================================================
# Fiscal Point CRUD
# =============================================================================


@router.get("/points", response_model=list[FiscalPointOutput])
def list_fiscal_points(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List fiscal points, optionally filtered by branch."""
    ctx = PermissionContext(user)
    ctx.require_management()
    if branch_id:
        ctx.require_branch_access(branch_id)

    service = FiscalService(db)
    return service.list_fiscal_points(ctx.tenant_id, branch_id)


@router.get("/points/{point_id}", response_model=FiscalPointOutput)
def get_fiscal_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a specific fiscal point."""
    ctx = PermissionContext(user)
    ctx.require_management()
    service = FiscalService(db)
    return service.get_fiscal_point(point_id, ctx.tenant_id)


@router.post("/points", status_code=201, response_model=FiscalPointOutput)
def create_fiscal_point(
    body: FiscalPointCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a new fiscal point. Requires ADMIN role."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    service = FiscalService(db)
    return service.create_fiscal_point(
        data=body.model_dump(),
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.patch("/points/{point_id}", response_model=FiscalPointOutput)
def update_fiscal_point(
    point_id: int,
    body: FiscalPointUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update a fiscal point. Requires ADMIN role."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FiscalService(db)
    return service.update_fiscal_point(
        point_id=point_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


@router.delete("/points/{point_id}", status_code=204)
def delete_fiscal_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a fiscal point. Requires ADMIN role."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FiscalService(db)
    service.delete_fiscal_point(
        point_id=point_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


# =============================================================================
# Invoice Operations
# =============================================================================


@router.post("/invoice", status_code=201, response_model=FiscalInvoiceOutput)
def create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create an electronic invoice from a check. Calls AFIP for CAE."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(body.branch_id)

    customer_data = None
    if body.customer_doc_type or body.customer_doc_number or body.customer_name:
        customer_data = {
            "doc_type": body.customer_doc_type,
            "doc_number": body.customer_doc_number,
            "name": body.customer_name,
        }

    service = FiscalService(db)
    return service.create_invoice(
        check_id=body.check_id,
        invoice_type=body.invoice_type,
        fiscal_point_id=body.fiscal_point_id,
        tenant_id=ctx.tenant_id,
        branch_id=body.branch_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
        customer_data=customer_data,
        iva_rate=body.iva_rate,
    )


@router.get("/invoices", response_model=list[FiscalInvoiceOutput])
def list_invoices(
    branch_id: int | None = None,
    status: str | None = None,
    invoice_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List invoices with optional filters."""
    ctx = PermissionContext(user)
    ctx.require_management()
    if branch_id:
        ctx.require_branch_access(branch_id)

    service = FiscalService(db)
    return service.list_invoices(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        status=status,
        invoice_type=invoice_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/invoices/{invoice_id}", response_model=FiscalInvoiceOutput)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a specific invoice detail."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FiscalService(db)
    return service.get_invoice(invoice_id, ctx.tenant_id)


# =============================================================================
# Credit Notes
# =============================================================================


@router.post("/credit-note", status_code=201, response_model=FiscalCreditNoteOutput)
def create_credit_note(
    body: CreditNoteCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a credit note to void an invoice."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = FiscalService(db)
    return service.void_invoice(
        invoice_id=body.invoice_id,
        reason=body.reason,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
    )


# =============================================================================
# Reports
# =============================================================================


@router.get("/report/monthly", response_model=FiscalMonthlyReportOutput)
def get_monthly_report(
    branch_id: int,
    year: int = Query(ge=2020, le=2100),
    month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """IVA Ventas report for monthly AFIP filing."""
    ctx = PermissionContext(user)
    ctx.require_management()
    ctx.require_branch_access(branch_id)

    service = FiscalService(db)
    return service.get_monthly_report(
        tenant_id=ctx.tenant_id,
        branch_id=branch_id,
        year=year,
        month=month,
    )
