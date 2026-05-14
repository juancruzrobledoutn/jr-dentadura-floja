"""
Tests for fiscal domain service: fiscal points, invoices (stub CAE), and credit notes.
"""

import pytest
from tests.conftest import next_id
from rest_api.models import FiscalPoint, FiscalInvoice, CreditNote, Check, Table, TableSession
from rest_api.services.domain.fiscal_service import FiscalService
from shared.utils.exceptions import NotFoundError, ValidationError


@pytest.fixture
def seed_fiscal_point(db_session, seed_tenant, seed_branch):
    """Create a test fiscal point."""
    point = FiscalPoint(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        point_number=1,
        type="ELECTRONIC",
        status="ACTIVE",
        cuit="20345678901",
        business_name="Test Restaurant SRL",
        iva_condition="RESPONSABLE_INSCRIPTO",
        last_invoice_number=0,
    )
    db_session.add(point)
    db_session.commit()
    db_session.refresh(point)
    return point


@pytest.fixture
def seed_check(db_session, seed_tenant, seed_branch):
    """Create a test check (bill) for invoicing."""
    # Check requires a table_session which requires a table
    table = Table(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        code="FISCAL-01",
        capacity=4,
        status="FREE",
    )
    db_session.add(table)
    db_session.flush()

    session = TableSession(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        table_id=table.id,
        status="PAYING",
    )
    db_session.add(session)
    db_session.flush()

    check = Check(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        table_session_id=session.id,
        total_cents=12100,  # $121.00 (100 net + 21 IVA at 21%)
        status="PAID",
    )
    db_session.add(check)
    db_session.commit()
    db_session.refresh(check)
    return check


class TestFiscalService:
    """Test AFIP fiscal invoicing (stub)."""

    def test_create_fiscal_point(self, db_session, seed_tenant, seed_branch):
        """Creating a fiscal point with valid CUIT should succeed."""
        service = FiscalService(db_session)
        result = service.create_fiscal_point(
            data={
                "branch_id": seed_branch.id,
                "point_number": 5,
                "type": "ELECTRONIC",
                "cuit": "20345678901",
                "business_name": "Mi Restaurante SRL",
                "iva_condition": "RESPONSABLE_INSCRIPTO",
            },
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert result["point_number"] == 5
        assert result["cuit"] == "20345678901"
        assert result["iva_condition"] == "RESPONSABLE_INSCRIPTO"

    def test_create_fiscal_point_invalid_cuit(self, db_session, seed_tenant, seed_branch):
        """CUIT with wrong format should raise ValidationError."""
        service = FiscalService(db_session)
        with pytest.raises(ValidationError, match="CUIT inválido"):
            service.create_fiscal_point(
                data={
                    "branch_id": seed_branch.id,
                    "point_number": 1,
                    "type": "ELECTRONIC",
                    "cuit": "123",  # Invalid: too short
                    "business_name": "Test",
                    "iva_condition": "MONOTRIBUTO",
                },
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

    def test_emit_invoice_stub_cae(self, db_session, seed_tenant, seed_branch, seed_fiscal_point, seed_check):
        """Emitting an invoice should return a simulated CAE (stub)."""
        service = FiscalService(db_session)
        invoice = service.create_invoice(
            check_id=seed_check.id,
            invoice_type="A",
            fiscal_point_id=seed_fiscal_point.id,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert invoice["cae"] == "00000000000000"  # Stub CAE
        assert invoice["status"] == "AUTHORIZED"
        assert invoice["invoice_type"] == "A"
        assert invoice["total_cents"] == 12100
        assert invoice["invoice_number"] == 1

    def test_invoice_type_validation(self, db_session, seed_tenant, seed_branch, seed_fiscal_point, seed_check):
        """Monotributo fiscal point should not allow type A invoices."""
        # Create a monotributo fiscal point
        service = FiscalService(db_session)
        mono_point = FiscalPoint(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            point_number=2,
            type="ELECTRONIC",
            status="ACTIVE",
            cuit="20345678901",
            business_name="Mono Test",
            iva_condition="MONOTRIBUTO",
            last_invoice_number=0,
        )
        db_session.add(mono_point)
        db_session.commit()
        db_session.refresh(mono_point)

        with pytest.raises(ValidationError, match="no válido para condición IVA"):
            service.create_invoice(
                check_id=seed_check.id,
                invoice_type="A",
                fiscal_point_id=mono_point.id,
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                user_id=1,
                user_email="admin@test.com",
            )

    def test_void_invoice_creates_credit_note(self, db_session, seed_tenant, seed_branch, seed_fiscal_point, seed_check):
        """Voiding an authorized invoice should create a credit note and mark invoice as VOIDED."""
        service = FiscalService(db_session)

        # First create an invoice
        invoice = service.create_invoice(
            check_id=seed_check.id,
            invoice_type="A",
            fiscal_point_id=seed_fiscal_point.id,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            user_id=1,
            user_email="admin@test.com",
        )

        # Void it
        credit_note = service.void_invoice(
            invoice_id=invoice["id"],
            reason="Error en facturación",
            tenant_id=seed_tenant.id,
            user_id=1,
            user_email="admin@test.com",
        )

        assert credit_note["status"] == "AUTHORIZED"
        assert credit_note["amount_cents"] == 12100
        assert credit_note["reason"] == "Error en facturación"

        # Original invoice should be voided
        updated_invoice = service.get_invoice(invoice["id"], seed_tenant.id)
        assert updated_invoice["status"] == "VOIDED"
