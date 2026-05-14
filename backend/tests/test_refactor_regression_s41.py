"""
Regression tests for S4.1 fat-router refactor.

Covers the two endpoints moved to domain services in this sub-step:

1. POST /api/waiter/tables/{table_id}/activate
   -> TableService.activate_for_waiter
2. GET /api/waiter/sessions/{session_id}/summary
   -> BillingService.get_waiter_session_summary

These tests exercise the domain-service methods directly (no HTTP layer)
so that behavior is locked-in at the service boundary. The existing
endpoint-level tests in test_waiter_table_flow.py still cover the
HTTP contract.
"""

from __future__ import annotations

import pytest

from rest_api.models import (
    BranchProduct,
    Check,
    Product,
    Round,
    RoundItem,
    TableSession,
)
from rest_api.services.domain.billing_service import BillingService
from rest_api.services.domain.table_service import TableService
from shared.utils.exceptions import (
    NotFoundError,
    ForbiddenError,
    ConflictError,
)


@pytest.fixture
def seed_product(db_session, seed_category, seed_branch, seed_tenant):
    """Local product fixture mirroring the one in test_waiter_table_flow.py."""
    product = Product(
        tenant_id=seed_tenant.id,
        category_id=seed_category.id,
        name="S4.1 Test Burger",
        description="Regression test burger",
    )
    db_session.add(product)
    db_session.flush()

    branch_product = BranchProduct(
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        product_id=product.id,
        price_cents=1500,
        is_available=True,
    )
    db_session.add(branch_product)
    db_session.commit()
    db_session.refresh(product)
    return product


# ---------------------------------------------------------------------------
# TableService.activate_for_waiter
# ---------------------------------------------------------------------------


class TestActivateForWaiter:
    """Service-level regression tests for table activation."""

    def test_activate_for_waiter_success(
        self, db_session, seed_tenant, seed_branch, seed_table, seed_waiter_user
    ):
        """Activating a FREE table creates a WAITER-opened session and flips status."""
        service = TableService(db_session)

        table, session = service.activate_for_waiter(
            table_id=seed_table.id,
            tenant_id=seed_tenant.id,
            branch_ids=[seed_branch.id],
            waiter_id=seed_waiter_user.id,
        )

        assert table.id == seed_table.id
        assert table.status == "ACTIVE"
        assert session.status == "OPEN"
        assert session.opened_by == "WAITER"
        assert session.opened_by_waiter_id == seed_waiter_user.id
        assert session.assigned_waiter_id == seed_waiter_user.id
        assert session.table_id == seed_table.id
        assert session.branch_id == seed_branch.id
        assert session.tenant_id == seed_tenant.id
        assert session.opened_at is not None

    def test_activate_for_waiter_not_found(
        self, db_session, seed_tenant, seed_branch, seed_waiter_user
    ):
        """Unknown table id raises NotFoundError."""
        service = TableService(db_session)

        with pytest.raises(NotFoundError) as exc:
            service.activate_for_waiter(
                table_id=999999,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id],
                waiter_id=seed_waiter_user.id,
            )
        assert exc.value.status_code == 404

    def test_activate_for_waiter_wrong_branch(
        self, db_session, seed_tenant, seed_branch, seed_table, seed_waiter_user
    ):
        """Branch not in caller's branch_ids raises ForbiddenError."""
        service = TableService(db_session)

        with pytest.raises(ForbiddenError) as exc:
            service.activate_for_waiter(
                table_id=seed_table.id,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id + 9999],  # caller has no access
                waiter_id=seed_waiter_user.id,
            )
        assert exc.value.status_code == 403

    def test_activate_for_waiter_already_active(
        self, db_session, seed_tenant, seed_branch, seed_table, seed_waiter_user
    ):
        """Non-FREE table raises ConflictError carrying current status in detail."""
        seed_table.status = "ACTIVE"
        db_session.commit()

        service = TableService(db_session)

        with pytest.raises(ConflictError) as exc:
            service.activate_for_waiter(
                table_id=seed_table.id,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id],
                waiter_id=seed_waiter_user.id,
            )
        assert exc.value.status_code == 409
        assert "ACTIVE" in exc.value.detail

    def test_activate_for_waiter_existing_open_session(
        self, db_session, seed_tenant, seed_branch, seed_table, seed_waiter_user
    ):
        """A lingering OPEN session blocks activation even if table is FREE."""
        # Force-create a stray session while keeping table as FREE so the
        # session-detection branch is exercised.
        existing = TableSession(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_id=seed_table.id,
            status="OPEN",
        )
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)

        # Keep seed_table.status == "FREE" so we reach the session check.
        assert seed_table.status == "FREE"

        service = TableService(db_session)

        with pytest.raises(ConflictError) as exc:
            service.activate_for_waiter(
                table_id=seed_table.id,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id],
                waiter_id=seed_waiter_user.id,
            )
        assert exc.value.status_code == 409
        assert str(existing.id) in exc.value.detail


# ---------------------------------------------------------------------------
# BillingService.get_waiter_session_summary
# ---------------------------------------------------------------------------


class TestGetWaiterSessionSummary:
    """Service-level regression tests for waiter session summary."""

    def _make_session_with_round(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
        *,
        with_check: bool = True,
        round_status: str = "SERVED",
        submitted_by: str = "WAITER",
    ) -> TableSession:
        session = TableSession(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_id=seed_table.id,
            status="OPEN",
            opened_by="WAITER",
            opened_by_waiter_id=seed_waiter_user.id,
        )
        db_session.add(session)
        db_session.flush()

        round_obj = Round(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_session_id=session.id,
            round_number=1,
            status=round_status,
            submitted_by=submitted_by,
            submitted_by_waiter_id=seed_waiter_user.id if submitted_by == "WAITER" else None,
        )
        db_session.add(round_obj)
        db_session.flush()

        item = RoundItem(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=round_obj.id,
            product_id=seed_product.id,
            qty=2,
            unit_price_cents=1500,
        )
        db_session.add(item)

        if with_check:
            check = Check(
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                table_session_id=session.id,
                total_cents=3000,
                paid_cents=1000,
                status="REQUESTED",
            )
            db_session.add(check)

        db_session.commit()
        db_session.refresh(session)
        return session

    def test_summary_returns_check_totals_when_present(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
    ):
        """When a Check exists, totals come from the check (paid + total)."""
        session = self._make_session_with_round(
            db_session,
            seed_tenant,
            seed_branch,
            seed_table,
            seed_waiter_user,
            seed_product,
            with_check=True,
        )

        service = BillingService(db_session)
        out = service.get_waiter_session_summary(
            session_id=session.id,
            tenant_id=seed_tenant.id,
            branch_ids=[seed_branch.id],
        )

        assert out.session_id == session.id
        assert out.table_id == seed_table.id
        assert out.table_code == seed_table.code
        assert out.status == "OPEN"
        assert out.opened_by == "WAITER"
        assert out.opened_by_waiter_id == seed_waiter_user.id
        assert out.rounds_count == 1
        # Totals come from the active check
        assert out.total_cents == 3000
        assert out.paid_cents == 1000
        assert out.check_status == "REQUESTED"
        # Only waiter rounds present -> not hybrid
        assert out.is_hybrid is False

    def test_summary_uses_aggregated_round_total_when_no_check(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
    ):
        """No check -> total comes from non-canceled rounds aggregate."""
        session = self._make_session_with_round(
            db_session,
            seed_tenant,
            seed_branch,
            seed_table,
            seed_waiter_user,
            seed_product,
            with_check=False,
        )

        service = BillingService(db_session)
        out = service.get_waiter_session_summary(
            session_id=session.id,
            tenant_id=seed_tenant.id,
            branch_ids=[seed_branch.id],
        )

        # 2 x 1500
        assert out.total_cents == 3000
        assert out.paid_cents == 0
        assert out.check_status is None

    def test_summary_marks_hybrid_when_both_waiter_and_diner_rounds(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
    ):
        """Sessions with both WAITER- and DINER-submitted rounds are hybrid."""
        session = self._make_session_with_round(
            db_session,
            seed_tenant,
            seed_branch,
            seed_table,
            seed_waiter_user,
            seed_product,
            with_check=False,
            submitted_by="WAITER",
        )

        # Add a second round submitted_by DINER
        diner_round = Round(
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_session_id=session.id,
            round_number=2,
            status="SERVED",
            submitted_by="DINER",
        )
        db_session.add(diner_round)
        db_session.flush()
        db_session.add(
            RoundItem(
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                round_id=diner_round.id,
                product_id=seed_product.id,
                qty=1,
                unit_price_cents=1500,
            )
        )
        db_session.commit()
        db_session.refresh(session)

        service = BillingService(db_session)
        out = service.get_waiter_session_summary(
            session_id=session.id,
            tenant_id=seed_tenant.id,
            branch_ids=[seed_branch.id],
        )

        assert out.is_hybrid is True
        assert out.rounds_count == 2
        # 2*1500 (waiter round) + 1*1500 (diner round) = 4500
        assert out.total_cents == 4500

    def test_summary_excludes_canceled_rounds_from_total(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
    ):
        """CANCELED rounds are not included in the aggregated total."""
        session = self._make_session_with_round(
            db_session,
            seed_tenant,
            seed_branch,
            seed_table,
            seed_waiter_user,
            seed_product,
            with_check=False,
            round_status="CANCELED",
        )

        service = BillingService(db_session)
        out = service.get_waiter_session_summary(
            session_id=session.id,
            tenant_id=seed_tenant.id,
            branch_ids=[seed_branch.id],
        )

        assert out.total_cents == 0
        assert out.rounds_count == 1

    def test_summary_session_not_found(
        self, db_session, seed_tenant, seed_branch
    ):
        """Unknown session_id raises NotFoundError."""
        service = BillingService(db_session)
        with pytest.raises(NotFoundError) as exc:
            service.get_waiter_session_summary(
                session_id=999999,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id],
            )
        assert exc.value.status_code == 404

    def test_summary_wrong_branch(
        self,
        db_session,
        seed_tenant,
        seed_branch,
        seed_table,
        seed_waiter_user,
        seed_product,
    ):
        """Branch outside caller's branch_ids raises ForbiddenError."""
        session = self._make_session_with_round(
            db_session,
            seed_tenant,
            seed_branch,
            seed_table,
            seed_waiter_user,
            seed_product,
            with_check=False,
        )

        service = BillingService(db_session)
        with pytest.raises(ForbiddenError) as exc:
            service.get_waiter_session_summary(
                session_id=session.id,
                tenant_id=seed_tenant.id,
                branch_ids=[seed_branch.id + 9999],
            )
        assert exc.value.status_code == 403
