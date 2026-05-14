"""
Tests for FIFO Payment Allocation (rest_api/services/payments/allocation.py).

S3.3: DB-integration tests against the SQLite in-memory fixture.

Covers:
- create_charges_for_check: charge per RoundItem, diner_id propagation
- allocate_payment_fifo: FIFO order, partial payment, overpayment, multi-charge
- get_diner_balance: aggregations per diner
- get_all_diner_balances: grouped balances + tenant isolation guard

NOTE: SQLite silently ignores SELECT FOR UPDATE clauses, which lets us exercise
the same code path without a Postgres backend. Concurrency races are NOT tested
here (would require a real DB) — only the algorithmic logic is verified.
"""

from datetime import datetime, timezone

import pytest

from rest_api.models import (
    Allocation,
    Charge,
    Check,
    Diner,
    Payment,
    Product,
    Round,
    RoundItem,
    TableSession,
)
from rest_api.services.payments.allocation import (
    allocate_payment_fifo,
    create_charges_for_check,
    get_all_diner_balances,
    get_diner_balance,
)
from tests.conftest import next_id


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def session_with_check(db_session, seed_tenant, seed_branch, seed_table, seed_category):
    """Create a TableSession + Check + Round for charge/payment tests."""
    session = TableSession(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        table_id=seed_table.id,
        status="OPEN",
    )
    db_session.add(session)
    db_session.flush()

    check = Check(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        table_session_id=session.id,
        status="REQUESTED",
        total_cents=0,
        paid_cents=0,
    )
    db_session.add(check)
    db_session.flush()

    round_obj = Round(
        id=next_id(),
        tenant_id=seed_tenant.id,
        branch_id=seed_branch.id,
        table_session_id=session.id,
        round_number=1,
        status="CONFIRMED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(round_obj)
    db_session.flush()

    db_session.commit()
    return {"session": session, "check": check, "round": round_obj}


def _make_product(db, tenant_id, category_id, name="Burger"):
    product = Product(
        id=next_id(),
        tenant_id=tenant_id,
        category_id=category_id,
        name=name,
    )
    db.add(product)
    db.flush()
    return product


def _make_diner(db, tenant_id, branch_id, session_id, name, color="#fff"):
    diner = Diner(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        name=name,
        color=color,
    )
    db.add(diner)
    db.flush()
    return diner


def _make_round_item(db, *, tenant_id, branch_id, round_id, product_id, qty, unit_price_cents, diner_id=None):
    item = RoundItem(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        round_id=round_id,
        product_id=product_id,
        qty=qty,
        unit_price_cents=unit_price_cents,
        diner_id=diner_id,
    )
    db.add(item)
    db.flush()
    return item


def _make_payment(db, *, tenant_id, branch_id, check_id, amount_cents):
    payment = Payment(
        id=next_id(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        check_id=check_id,
        provider="CASH",
        status="APPROVED",
        amount_cents=amount_cents,
    )
    db.add(payment)
    db.flush()
    return payment


# =============================================================================
# create_charges_for_check
# =============================================================================


class TestCreateChargesForCheck:
    def test_creates_one_charge_per_round_item(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id, name="Burger")

        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=2,
            unit_price_cents=1000,
        )
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=500,
        )
        db_session.commit()

        charges = create_charges_for_check(db_session, ctx["check"])

        assert len(charges) == 2
        # First item: 2 * 1000 = 2000 cents
        # Second item: 1 * 500 = 500 cents
        amounts = sorted(c.amount_cents for c in charges)
        assert amounts == [500, 2000]

    def test_charge_inherits_diner_id_from_round_item(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        diner = _make_diner(
            db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Alice"
        )

        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=1500,
            diner_id=diner.id,
        )
        # Shared item (no diner)
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=300,
            diner_id=None,
        )
        db_session.commit()

        charges = create_charges_for_check(db_session, ctx["check"])

        diner_ids = [c.diner_id for c in charges]
        assert diner.id in diner_ids
        assert None in diner_ids

    def test_skips_canceled_rounds(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)

        canceled_round = Round(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            table_session_id=ctx["session"].id,
            round_number=2,
            status="CANCELED",
        )
        db_session.add(canceled_round)
        db_session.flush()

        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=canceled_round.id,
            product_id=product.id,
            qty=5,
            unit_price_cents=999,
        )
        # Also one valid item in CONFIRMED round
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=1000,
        )
        db_session.commit()

        charges = create_charges_for_check(db_session, ctx["check"])
        assert len(charges) == 1
        assert charges[0].amount_cents == 1000

    def test_description_uses_product_name(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id, name="Pizza")
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=3,
            unit_price_cents=1000,
        )
        db_session.commit()

        charges = create_charges_for_check(db_session, ctx["check"])
        assert charges[0].description == "Pizza × 3"


# =============================================================================
# allocate_payment_fifo
# =============================================================================


class TestAllocatePaymentFifo:
    def test_zero_amount_payment_returns_empty(
        self, db_session, seed_tenant, seed_branch, session_with_check
    ):
        """A zero/negative amount payment allocates nothing (early return)."""
        # Build a Payment object WITHOUT persisting it (avoids CHECK constraint
        # since allocate_payment_fifo only reads amount_cents and check_id).
        payment = Payment(
            id=next_id(),
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=session_with_check["check"].id,
            provider="CASH",
            status="APPROVED",
            amount_cents=1,
        )
        db_session.add(payment)
        db_session.flush()
        # Mutate in-memory only — function reads from the Python object.
        payment.amount_cents = 0

        allocations = allocate_payment_fifo(db_session, payment)
        assert allocations == []

    def test_exact_payment_one_charge(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """A payment exactly matching one charge allocates fully."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=1000,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=1000,
        )
        db_session.commit()

        allocs = allocate_payment_fifo(db_session, payment)
        assert len(allocs) == 1
        assert allocs[0].amount_cents == 1000

    def test_partial_payment_covers_only_first_charge_partially(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """A payment smaller than the first charge allocates only that amount."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=2000,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=500,
        )
        db_session.commit()

        allocs = allocate_payment_fifo(db_session, payment)
        assert len(allocs) == 1
        assert allocs[0].amount_cents == 500

    def test_payment_covers_multiple_charges_fifo(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """A payment larger than the first charge spills to next charge(s)."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)

        # 3 charges: 500, 800, 200 (created in order)
        for price in (500, 800, 200):
            _make_round_item(
                db_session,
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                round_id=ctx["round"].id,
                product_id=product.id,
                qty=1,
                unit_price_cents=price,
            )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # Pay 1200: fully covers 500, partially covers 800 (700 leftover)
        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=1200,
        )
        db_session.commit()

        allocs = allocate_payment_fifo(db_session, payment)
        assert len(allocs) == 2
        assert allocs[0].amount_cents == 500
        assert allocs[1].amount_cents == 700

    def test_overpayment_only_allocates_up_to_unpaid_total(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """A payment exceeding total stops allocating once all charges are paid."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=300,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # Pay 10000 — only 300 should be allocated
        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=10000,
        )
        db_session.commit()

        allocs = allocate_payment_fifo(db_session, payment)
        total_allocated = sum(a.amount_cents for a in allocs)
        assert total_allocated == 300

    def test_skips_already_fully_paid_charges(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """Charges fully covered by prior allocations should be skipped."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)

        for price in (500, 800):
            _make_round_item(
                db_session,
                tenant_id=seed_tenant.id,
                branch_id=seed_branch.id,
                round_id=ctx["round"].id,
                product_id=product.id,
                qty=1,
                unit_price_cents=price,
            )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # First payment: cover first charge fully
        p1 = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=500,
        )
        db_session.commit()
        allocate_payment_fifo(db_session, p1)
        db_session.commit()

        # Second payment: should allocate to second charge only
        p2 = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=800,
        )
        db_session.commit()
        allocs = allocate_payment_fifo(db_session, p2)

        assert len(allocs) == 1
        assert allocs[0].amount_cents == 800

    def test_diner_id_prioritizes_own_charges(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """When diner_id is given, that diner's charges should be paid first."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        alice = _make_diner(db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Alice")
        bob = _make_diner(db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Bob", color="#000")

        # Create items in insertion order: Bob first, Alice second
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=400,
            diner_id=bob.id,
        )
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=600,
            diner_id=alice.id,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # Alice pays 600 — her own charge should be picked first, not FIFO
        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=600,
        )
        db_session.commit()

        allocs = allocate_payment_fifo(db_session, payment, diner_id=alice.id)
        assert len(allocs) == 1
        assert allocs[0].amount_cents == 600
        # Verify the allocated charge belongs to Alice
        charge = db_session.get(Charge, allocs[0].charge_id)
        assert charge.diner_id == alice.id


# =============================================================================
# get_diner_balance
# =============================================================================


class TestGetDinerBalance:
    def test_returns_zero_for_diner_with_no_charges(
        self, db_session, seed_tenant, seed_branch, session_with_check
    ):
        ctx = session_with_check
        diner = _make_diner(db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Ghost")
        db_session.commit()

        balance = get_diner_balance(db_session, ctx["check"].id, diner.id)
        assert balance["total_cents"] == 0
        assert balance["paid_cents"] == 0
        assert balance["remaining_cents"] == 0
        assert balance["diner_id"] == diner.id

    def test_returns_total_and_remaining_after_partial_payment(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        alice = _make_diner(db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Alice")

        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=1000,
            diner_id=alice.id,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # Pay 300 toward Alice
        payment = _make_payment(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            check_id=ctx["check"].id,
            amount_cents=300,
        )
        db_session.commit()
        allocate_payment_fifo(db_session, payment, diner_id=alice.id)
        db_session.commit()

        balance = get_diner_balance(db_session, ctx["check"].id, alice.id)
        assert balance["total_cents"] == 1000
        assert balance["paid_cents"] == 300
        assert balance["remaining_cents"] == 700


# =============================================================================
# get_all_diner_balances
# =============================================================================


class TestGetAllDinerBalances:
    def test_returns_separate_entries_per_diner_and_shared(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        alice = _make_diner(db_session, seed_tenant.id, seed_branch.id, ctx["session"].id, "Alice")

        # Alice item
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=500,
            diner_id=alice.id,
        )
        # Shared item
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=200,
            diner_id=None,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        balances = get_all_diner_balances(db_session, ctx["check"].id)

        # Two entries: one for Alice, one for shared
        ids = {b["diner_id"] for b in balances}
        assert alice.id in ids
        assert None in ids
        # Shared entry has the canonical "Shared" label
        shared_entry = next(b for b in balances if b["diner_id"] is None)
        assert shared_entry["diner_name"] == "Shared"
        assert shared_entry["total_cents"] == 200

    def test_tenant_isolation_returns_empty_on_mismatch(
        self, db_session, seed_tenant, seed_branch, seed_category, session_with_check
    ):
        """If tenant_id mismatches the check's tenant, return []."""
        ctx = session_with_check
        product = _make_product(db_session, seed_tenant.id, seed_category.id)
        _make_round_item(
            db_session,
            tenant_id=seed_tenant.id,
            branch_id=seed_branch.id,
            round_id=ctx["round"].id,
            product_id=product.id,
            qty=1,
            unit_price_cents=500,
        )
        create_charges_for_check(db_session, ctx["check"])
        db_session.commit()

        # tenant 999 != seed_tenant.id
        result = get_all_diner_balances(db_session, ctx["check"].id, tenant_id=999)
        assert result == []

    def test_returns_empty_for_check_with_no_charges(
        self, db_session, session_with_check
    ):
        """No charges → no balance rows."""
        balances = get_all_diner_balances(db_session, session_with_check["check"].id)
        assert balances == []
