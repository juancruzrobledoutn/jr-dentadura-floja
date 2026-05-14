"""
S3.1 — AFIP production gate tests.

Verifies that the AFIP stub (`_call_afip_wsfe`) refuses to run in production
environments, and that `validate_production_secrets()` blocks startup when
AFIP_ENVIRONMENT=stub and ENVIRONMENT=production.

Bug context (audit auditamayo12.md CRÍTICO #2):
The stub previously returned cae="00000000000000" with result="A" unconditionally,
which would persist a fake-but-marked-AUTHORIZED invoice if it ran in production.
The gate makes that path fail loudly (503 at request time, RuntimeError at boot).
"""

from datetime import date
from unittest.mock import patch

import pytest

from shared.config.settings import Settings, settings
from shared.utils.exceptions import ExternalServiceError
from rest_api.services.domain.fiscal_service import FiscalService
from tests.conftest import next_id
from rest_api.models import FiscalPoint, Table, TableSession, Check


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def seed_fiscal_point(db_session, seed_tenant, seed_branch):
    """Create a fiscal point used by the invoice tests."""
    point = FiscalPoint(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        point_number=99,
        type="ELECTRONIC",
        status="ACTIVE",
        cuit="20345678901",
        business_name="Gate Test SRL",
        iva_condition="RESPONSABLE_INSCRIPTO",
        last_invoice_number=0,
    )
    db_session.add(point)
    db_session.commit()
    db_session.refresh(point)
    return point


@pytest.fixture
def seed_check(db_session, seed_tenant, seed_branch):
    """Create a paid check ready to be invoiced."""
    table = Table(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        code="GATE-01",
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
        total_cents=12100,
        status="PAID",
    )
    db_session.add(check)
    db_session.commit()
    db_session.refresh(check)
    return check


# =============================================================================
# _call_afip_wsfe gate
# =============================================================================


class TestAfipStubGate:
    """Direct tests of the gate inside `_call_afip_wsfe`."""

    def test_stub_in_dev_returns_simulated_cae(self, db_session, monkeypatch, caplog):
        """Default config (stub + development) returns the simulated CAE
        and emits the deprecation warning. This preserves the existing
        dev/test workflow."""
        monkeypatch.setattr(settings, "afip_environment", "stub")
        monkeypatch.setattr(settings, "environment", "development")

        service = FiscalService(db_session)
        with caplog.at_level("WARNING"):
            response = service._call_afip_wsfe({
                "point_number": 1,
                "invoice_number": 1,
            })

        assert response["cae"] == "00000000000000"
        assert response["result"] == "A"
        # Stub logs a structured warning so any invocation in a shared env
        # is auditable (grep "STUB: AFIP WSFE" in logs).
        assert any("STUB: AFIP WSFE" in rec.message for rec in caplog.records)

    def test_stub_in_production_raises_503(self, db_session, monkeypatch):
        """Stub mode + ENVIRONMENT=production → ExternalServiceError (HTTP 503).
        Defence-in-depth: even if validate_production_secrets() was bypassed,
        the request path refuses to emit a fake CAE."""
        monkeypatch.setattr(settings, "afip_environment", "stub")
        monkeypatch.setattr(settings, "environment", "production")

        service = FiscalService(db_session)
        with pytest.raises(ExternalServiceError) as exc_info:
            service._call_afip_wsfe({"point_number": 1, "invoice_number": 1})

        # AppException (parent) sets the HTTP status code on the exception.
        assert exc_info.value.status_code == 503

    def test_stub_in_prod_alias_raises_503(self, db_session, monkeypatch):
        """The gate accepts 'prod' as well as 'production'."""
        monkeypatch.setattr(settings, "afip_environment", "stub")
        monkeypatch.setattr(settings, "environment", "prod")

        service = FiscalService(db_session)
        with pytest.raises(ExternalServiceError):
            service._call_afip_wsfe({"point_number": 1, "invoice_number": 1})

    def test_production_mode_raises_not_implemented(self, db_session, monkeypatch):
        """afip_environment='production' raises NotImplementedError — the
        real WSFE integration has not been implemented yet. This is the
        signal for future work, not silent failure."""
        monkeypatch.setattr(settings, "afip_environment", "production")
        monkeypatch.setattr(settings, "environment", "production")

        service = FiscalService(db_session)
        with pytest.raises(NotImplementedError, match="pyafipws"):
            service._call_afip_wsfe({"point_number": 1, "invoice_number": 1})


# =============================================================================
# validate_production_secrets
# =============================================================================


class TestValidateProductionSecrets:
    """Verify the boot-time validation catches AFIP misconfigurations."""

    def _build_prod_settings(self, **overrides) -> Settings:
        """Build a Settings instance with the minimum prod-valid baseline,
        plus the requested overrides."""
        from cryptography.fernet import Fernet

        base = {
            "environment": "production",
            "debug": False,
            "jwt_secret": "x" * 64,
            "table_token_secret": "x" * 64,
            "allowed_origins": "https://example.com",
            "totp_encryption_key": Fernet.generate_key().decode(),
            # S3.1 — afip_environment is the variable under test
            "afip_environment": "stub",
        }
        base.update(overrides)
        return Settings(**base)

    def test_prod_with_stub_afip_fails_validation(self):
        """ENVIRONMENT=production + AFIP_ENVIRONMENT=stub → error in list."""
        s = self._build_prod_settings(afip_environment="stub")
        errors = s.validate_production_secrets()
        afip_errors = [e for e in errors if "AFIP_ENVIRONMENT" in e]
        assert len(afip_errors) == 1
        assert "would emit fake CAEs" in afip_errors[0]

    def test_prod_with_production_afip_passes_validation(self):
        """ENVIRONMENT=production + AFIP_ENVIRONMENT=production → no AFIP error."""
        s = self._build_prod_settings(afip_environment="production")
        errors = s.validate_production_secrets()
        afip_errors = [e for e in errors if "AFIP_ENVIRONMENT" in e]
        assert afip_errors == []

    def test_dev_with_stub_afip_passes_validation(self):
        """ENVIRONMENT=development is allowed to keep AFIP_ENVIRONMENT=stub.
        Validation only fires in production environments."""
        s = Settings(environment="development", afip_environment="stub")
        errors = s.validate_production_secrets()
        afip_errors = [e for e in errors if "AFIP_ENVIRONMENT" in e]
        assert afip_errors == []

    def test_prod_alias_with_stub_afip_fails_validation(self):
        """ENVIRONMENT=prod (short form) also triggers the AFIP gate."""
        s = self._build_prod_settings(environment="prod", afip_environment="stub")
        errors = s.validate_production_secrets()
        afip_errors = [e for e in errors if "AFIP_ENVIRONMENT" in e]
        assert len(afip_errors) == 1


# =============================================================================
# Integration: invoice endpoint surfaces 503 in production with stub AFIP
# =============================================================================


class TestInvoiceEndpointGate:
    """End-to-end: emit_invoice path in production-with-stub returns 503."""

    def test_create_invoice_in_production_with_stub_raises_503(
        self, db_session, monkeypatch, seed_tenant, seed_branch,
        seed_fiscal_point, seed_check,
    ):
        """Calling `FiscalService.create_invoice` while ENVIRONMENT=production
        and AFIP_ENVIRONMENT=stub propagates the 503. This is the actual
        user-facing path the audit flagged."""
        monkeypatch.setattr(settings, "afip_environment", "stub")
        monkeypatch.setattr(settings, "environment", "production")

        service = FiscalService(db_session)
        with pytest.raises(ExternalServiceError) as exc_info:
            service.create_invoice(
                check_id=seed_check.id,
                invoice_type="A",
                fiscal_point_id=seed_fiscal_point.id,
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert exc_info.value.status_code == 503

        # And critically: NO invoice row should have been persisted with the
        # fake CAE. The whole transaction must abort before the insert.
        from sqlalchemy import select, func
        from rest_api.models import FiscalInvoice
        invoice_count = db_session.scalar(
            select(func.count()).select_from(FiscalInvoice)
        )
        assert invoice_count == 0, (
            "No fiscal invoice should be persisted when the AFIP gate fires"
        )

    def test_void_invoice_in_production_with_stub_raises_503(
        self, db_session, monkeypatch, seed_tenant, seed_branch,
        seed_fiscal_point, seed_check,
    ):
        """The credit-note path (void_invoice → _call_afip_wsfe) is also gated.
        This is the second AFIP call site in the service."""
        # First, create the invoice in dev mode so we have something to void.
        monkeypatch.setattr(settings, "afip_environment", "stub")
        monkeypatch.setattr(settings, "environment", "development")
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

        # Now flip to production-with-stub and attempt to void.
        monkeypatch.setattr(settings, "environment", "production")
        with pytest.raises(ExternalServiceError) as exc_info:
            service.void_invoice(
                invoice_id=invoice["id"],
                reason="Error en facturación",
                tenant_id=seed_tenant.id,
                user_id=1,
                user_email="admin@test.com",
            )

        assert exc_info.value.status_code == 503
