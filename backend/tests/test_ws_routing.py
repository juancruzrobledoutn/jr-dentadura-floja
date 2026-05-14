"""
Tests for WebSocket routing (S2.D fix).

Verifies that staff-targeted broadcasts (waiters, kitchen, admins, sectors)
do NOT leak to diner connections.

Bug background (audit auditamayo12.md ALTO #5):
    Diners register against ``_by_branch`` via ``DinerEndpoint`` (passing
    ``branch_id`` to ``manager.connect``) with ``is_admin=False`` and
    ``is_kitchen=False``. The pre-fix ``get_waiter_connections`` returned
    ``all_branch - admins - kitchen``, which silently included every diner
    of the branch. For a busy branch with 100 connected diners, every
    ``ROUND_PENDING`` / ``ROUND_CONFIRMED`` / ``ROUND_SUBMITTED`` event
    generated 100 spurious sends, filling the broadcast queue
    (``QUEUE_MAX_SIZE=5000``) under series of events plus reconnections.

After the fix:
    * ``ConnectionIndex`` tracks an ``is_diner`` flag per WebSocket.
    * ``get_waiter_connections`` / ``get_sector_connections`` /
      ``get_sectors_connections`` exclude diner connections.
    * ``DinerEndpoint.register_connection`` tags new diner connections via
      ``manager.connect(..., is_diner=True)``.
    * Diners continue to receive session-scoped events through
      ``send_to_session`` (registered in ``_by_session`` independently).

These tests run as pure unit tests using ``MagicMock`` WebSocket stand-ins
and do not require Redis, PostgreSQL, or the FastAPI app.
"""

import sys
from pathlib import Path

# Ensure the project root (which contains the ``ws_gateway`` package) is on
# sys.path. The pytest CWD is ``backend/``, so we walk one level up.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import pytest
from unittest.mock import MagicMock, AsyncMock

from ws_gateway.components.connection.index import ConnectionIndex
from ws_gateway.components.events.router import EventRouter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_ws() -> MagicMock:
    """Return a hashable, mockable stand-in for ``starlette.WebSocket``."""
    return MagicMock(name="websocket")


def _register_staff(
    index: ConnectionIndex,
    *,
    branch_id: int,
    sector_ids: list[int] | None = None,
    is_admin: bool = False,
    is_kitchen: bool = False,
    user_id: int,
) -> MagicMock:
    """Register a staff connection (admin / kitchen / waiter)."""
    ws = _make_ws()
    index.register_user(
        ws, user_id, is_admin=is_admin, is_kitchen=is_kitchen, tenant_id=1
    )
    index.register_branch(ws, branch_id, is_admin=is_admin, is_kitchen=is_kitchen)
    if sector_ids:
        index.register_sectors(ws, sector_ids)
    return ws


def _register_diner(
    index: ConnectionIndex,
    *,
    branch_id: int,
    session_id: int,
) -> MagicMock:
    """Register a diner connection (table-token authenticated)."""
    ws = _make_ws()
    # Mirrors DinerEndpoint: negative pseudo user_id + is_diner=True flag
    # so the index can exclude diners from staff broadcasts.
    index.register_user(
        ws, -session_id, is_admin=False, is_kitchen=False, tenant_id=1, is_diner=True
    )
    index.register_branch(ws, branch_id, is_admin=False, is_kitchen=False)
    index.register_session(ws, session_id)
    return ws


# ---------------------------------------------------------------------------
# ConnectionIndex tests (the bug surface)
# ---------------------------------------------------------------------------


class TestConnectionIndexExcludesDiners:
    """``get_waiter_connections`` and friends must skip diner WebSockets."""

    def test_waiter_connections_exclude_diners(self):
        index = ConnectionIndex()

        waiter = _register_staff(index, branch_id=1, user_id=10)
        diner1 = _register_diner(index, branch_id=1, session_id=100)
        diner2 = _register_diner(index, branch_id=1, session_id=101)

        waiters = index.get_waiter_connections(1)

        assert waiter in waiters, "waiter must remain in branch waiter set"
        assert diner1 not in waiters, "diner must NOT be in waiter set"
        assert diner2 not in waiters, "diner must NOT be in waiter set"
        assert len(waiters) == 1

    def test_waiter_connections_with_100_diners(self):
        """Regression: 100 connected diners must not bloat the waiter set."""
        index = ConnectionIndex()

        waiters_ws = [
            _register_staff(index, branch_id=7, user_id=u) for u in range(1, 5)
        ]
        for session_id in range(1, 101):
            _register_diner(index, branch_id=7, session_id=session_id)

        waiters = index.get_waiter_connections(7)

        # Exactly the 4 staff waiters, zero diners.
        assert len(waiters) == 4
        for ws in waiters_ws:
            assert ws in waiters

    def test_waiter_connections_exclude_admins_and_kitchen(self):
        """Existing behaviour preserved: admins and kitchen are not waiters."""
        index = ConnectionIndex()

        admin = _register_staff(index, branch_id=2, user_id=1, is_admin=True)
        kitchen = _register_staff(index, branch_id=2, user_id=2, is_kitchen=True)
        waiter = _register_staff(index, branch_id=2, user_id=3)
        diner = _register_diner(index, branch_id=2, session_id=200)

        waiters = index.get_waiter_connections(2)

        assert waiters == {waiter}
        assert admin not in waiters
        assert kitchen not in waiters
        assert diner not in waiters

    def test_sector_connections_exclude_diners(self):
        """Defensive: even if a diner ever ended up in ``_by_sector``."""
        index = ConnectionIndex()

        waiter = _register_staff(index, branch_id=1, user_id=10, sector_ids=[5])
        # Force a diner into the sector index to simulate a regression.
        diner = _make_ws()
        index.register_user(
            diner, -300, is_admin=False, is_kitchen=False, tenant_id=1, is_diner=True
        )
        index.register_branch(diner, 1, is_admin=False, is_kitchen=False)
        index.register_sector(diner, 5)

        sector_conns = index.get_sector_connections(5)
        sectors_conns = index.get_sectors_connections([5])

        assert waiter in sector_conns
        assert diner not in sector_conns
        assert waiter in sectors_conns
        assert diner not in sectors_conns

    def test_session_connections_still_include_diners(self):
        """Diners must still receive session events via send_to_session."""
        index = ConnectionIndex()

        diner = _register_diner(index, branch_id=1, session_id=42)
        # An admin should not appear in the diner's session unless explicitly
        # registered to it.
        admin = _register_staff(index, branch_id=1, user_id=1, is_admin=True)

        session_conns = index.get_session_connections(42)
        assert diner in session_conns
        assert admin not in session_conns

    def test_is_diner_inferred_from_negative_user_id(self):
        """
        Backwards compatibility: if a caller forgets to pass ``is_diner=True``
        but uses a negative ``user_id`` (the DinerEndpoint pseudo-user-id
        convention), the index still marks it as a diner.
        """
        index = ConnectionIndex()
        ws = _make_ws()
        index.register_user(ws, -42, is_admin=False, is_kitchen=False, tenant_id=1)
        index.register_branch(ws, 1)
        assert index.is_diner(ws) is True

    def test_unregister_user_clears_diner_flag(self):
        """Avoid stale ``_ws_is_diner`` entries after disconnect."""
        index = ConnectionIndex()
        ws = _register_diner(index, branch_id=1, session_id=99)
        assert index.is_diner(ws) is True

        index.unregister_user(ws)

        # Internal map should not retain the WebSocket as a diner.
        assert ws not in index._ws_is_diner  # noqa: SLF001
        assert index.is_diner(ws) is False


# ---------------------------------------------------------------------------
# EventRouter integration tests (per-event dispatch table)
# ---------------------------------------------------------------------------


class _ManagerSpy:
    """Capture which broadcast methods the router called and with what args."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        # Default return value: number of receivers reported.
        self._returns = {
            "send_to_admins": 1,
            "send_to_waiters_only": 3,
            "send_to_sector": 1,
            "send_to_kitchen": 2,
            "send_to_session": 4,
            "send_to_branch": 0,
        }

    def configure_returns(self, **kwargs):
        self._returns.update(kwargs)

    def _record(self, name: str, kwargs: dict) -> int:
        self.calls.append((name, kwargs))
        return self._returns.get(name, 0)

    async def send_to_admins(self, branch_id, event, tenant_id=None):
        return self._record(
            "send_to_admins", {"branch_id": branch_id, "tenant_id": tenant_id, "event": event}
        )

    async def send_to_waiters_only(self, branch_id, event, tenant_id=None):
        return self._record(
            "send_to_waiters_only", {"branch_id": branch_id, "tenant_id": tenant_id, "event": event}
        )

    async def send_to_sector(self, sector_id, event, tenant_id=None):
        return self._record(
            "send_to_sector", {"sector_id": sector_id, "tenant_id": tenant_id, "event": event}
        )

    async def send_to_kitchen(self, branch_id, event, tenant_id=None):
        return self._record(
            "send_to_kitchen", {"branch_id": branch_id, "tenant_id": tenant_id, "event": event}
        )

    async def send_to_session(self, session_id, event, tenant_id=None):
        return self._record(
            "send_to_session", {"session_id": session_id, "tenant_id": tenant_id, "event": event}
        )

    async def send_to_branch(self, branch_id, event, tenant_id=None):
        return self._record(
            "send_to_branch", {"branch_id": branch_id, "tenant_id": tenant_id, "event": event}
        )

    def called(self, name: str) -> bool:
        return any(c[0] == name for c in self.calls)


@pytest.fixture
def manager() -> _ManagerSpy:
    return _ManagerSpy()


@pytest.fixture
def router(manager: _ManagerSpy) -> EventRouter:
    return EventRouter(manager)


def _event(event_type: str, **extra) -> dict:
    base = {"type": event_type, "tenant_id": 1, "branch_id": 7}
    base.update(extra)
    return base


@pytest.mark.asyncio
async def test_round_pending_routes_to_admins_and_all_waiters_not_kitchen_not_diners(
    router, manager
):
    """
    ROUND_PENDING:
      * admins: yes
      * waiters: yes (all branch, bypasses sector filter)
      * kitchen: no
      * diners: no
    """
    await router.route_event(_event("ROUND_PENDING", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_waiters_only")  # branch-wide, NOT send_to_sector
    assert not manager.called("send_to_sector")
    assert not manager.called("send_to_kitchen")
    assert not manager.called("send_to_session")  # diners excluded


@pytest.mark.asyncio
async def test_round_confirmed_routes_to_admins_and_waiters_not_diners(router, manager):
    """ROUND_CONFIRMED: admins + waiters; NO kitchen, NO diners."""
    await router.route_event(_event("ROUND_CONFIRMED", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    # Sector-targeted because event has sector_id and is not branch-wide.
    assert manager.called("send_to_sector")
    assert not manager.called("send_to_waiters_only")
    assert not manager.called("send_to_kitchen")
    assert not manager.called("send_to_session")


@pytest.mark.asyncio
async def test_round_submitted_routes_to_admins_kitchen_waiters_not_diners(router, manager):
    """ROUND_SUBMITTED: admins + kitchen + waiters; NO diners."""
    await router.route_event(_event("ROUND_SUBMITTED", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_kitchen")
    assert manager.called("send_to_sector")  # sector-targeted waiters
    assert not manager.called("send_to_session"), "diners must NOT receive ROUND_SUBMITTED"


@pytest.mark.asyncio
async def test_round_in_kitchen_routes_to_admins_kitchen_waiters_and_only_session_diners(
    router, manager
):
    """
    ROUND_IN_KITCHEN: admins + kitchen + waiters (sector) + diners of THAT session.

    Critical: diners must reach via ``send_to_session`` (session_id only),
    NOT via ``send_to_branch`` which would fan out to every diner of the
    branch.
    """
    await router.route_event(_event("ROUND_IN_KITCHEN", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_kitchen")
    assert manager.called("send_to_sector")
    assert manager.called("send_to_session")
    # Crucially, never a broad fan-out:
    assert not manager.called("send_to_branch")

    # Confirm the session call targets exactly the right session_id.
    session_call = next(c for c in manager.calls if c[0] == "send_to_session")
    assert session_call[1]["session_id"] == 42


@pytest.mark.asyncio
async def test_round_ready_routes_admins_kitchen_waiters_session(router, manager):
    """ROUND_READY: same routing as ROUND_IN_KITCHEN."""
    await router.route_event(_event("ROUND_READY", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_kitchen")
    assert manager.called("send_to_sector")
    assert manager.called("send_to_session")
    assert not manager.called("send_to_branch")


@pytest.mark.asyncio
async def test_round_served_routes_admins_waiters_kitchen_session(router, manager):
    """ROUND_SERVED: admins + kitchen + waiters + diners of session (per CLAUDE.md table)."""
    await router.route_event(_event("ROUND_SERVED", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_kitchen")
    assert manager.called("send_to_sector")
    assert manager.called("send_to_session")
    assert not manager.called("send_to_branch")


@pytest.mark.asyncio
async def test_check_requested_routes_admins_waiters_session(router, manager):
    """CHECK_REQUESTED: admins + waiters + diners of session; NO kitchen, NO branch."""
    await router.route_event(_event("CHECK_REQUESTED", sector_id=5, session_id=42))

    assert manager.called("send_to_admins")
    assert manager.called("send_to_sector")
    assert manager.called("send_to_session")
    assert not manager.called("send_to_kitchen")
    assert not manager.called("send_to_branch")


@pytest.mark.asyncio
async def test_cart_events_go_only_to_session_diners(router, manager):
    """CART_*: session only (no kitchen, branch fan-out limited to staff side)."""
    await router.route_event(_event("CART_ITEM_ADDED", session_id=42))

    # Cart events do not have a sector_id - waiters fall back to branch-wide.
    assert manager.called("send_to_session")
    session_call = next(c for c in manager.calls if c[0] == "send_to_session")
    assert session_call[1]["session_id"] == 42
    assert not manager.called("send_to_kitchen")
    assert not manager.called("send_to_branch")


@pytest.mark.asyncio
async def test_entity_events_admin_only(router, manager):
    """ENTITY_*: admins only - never waiters, kitchen, or diners."""
    await router.route_event(_event("ENTITY_UPDATED"))

    assert manager.called("send_to_admins")
    assert not manager.called("send_to_waiters_only")
    assert not manager.called("send_to_sector")
    assert not manager.called("send_to_kitchen")
    assert not manager.called("send_to_session")
    assert not manager.called("send_to_branch")


@pytest.mark.asyncio
async def test_no_event_uses_send_to_branch(router, manager):
    """
    Defensive: the router must never fall back to the unfiltered
    ``send_to_branch`` for any of the round / cart / billing event types
    inspected above. Diner fan-out only happens via ``send_to_session``.
    """
    event_types = [
        "ROUND_PENDING",
        "ROUND_CONFIRMED",
        "ROUND_SUBMITTED",
        "ROUND_IN_KITCHEN",
        "ROUND_READY",
        "ROUND_SERVED",
        "ROUND_CANCELED",
        "CHECK_REQUESTED",
        "CHECK_PAID",
        "PAYMENT_APPROVED",
        "PAYMENT_REJECTED",
        "TABLE_SESSION_STARTED",
        "TABLE_STATUS_CHANGED",
        "CART_ITEM_ADDED",
        "CART_ITEM_UPDATED",
        "CART_ITEM_REMOVED",
        "CART_CLEARED",
        "ENTITY_CREATED",
        "ENTITY_UPDATED",
        "ENTITY_DELETED",
    ]
    for event_type in event_types:
        local_manager = _ManagerSpy()
        local_router = EventRouter(local_manager)
        await local_router.route_event(_event(event_type, sector_id=5, session_id=42))
        assert not local_manager.called("send_to_branch"), (
            f"{event_type} routed via unfiltered send_to_branch - would fan out to all diners"
        )


# ---------------------------------------------------------------------------
# Quantitative regression: diner fan-out reduction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_round_in_kitchen_does_not_scale_with_branch_diner_count(monkeypatch):
    """
    With 100 diners in the branch and 4 diners in the active session,
    a ROUND_IN_KITCHEN event must only target the 4 session diners, not
    all 100 branch diners.

    Verified at the ConnectionIndex level: the union of staff-targeted
    connection sets (waiters / kitchen / admins / sectors) must not contain
    any diner, regardless of how many diners are connected to the branch.
    """
    index = ConnectionIndex()

    # 4 admins, 2 kitchen, 4 waiters (sector 5), 100 diners (only 4 in
    # the active session).
    admins = [
        _register_staff(index, branch_id=7, user_id=u, is_admin=True)
        for u in range(1, 5)
    ]
    kitchen = [
        _register_staff(index, branch_id=7, user_id=u, is_kitchen=True)
        for u in range(10, 12)
    ]
    waiters = [
        _register_staff(index, branch_id=7, user_id=u, sector_ids=[5])
        for u in range(20, 24)
    ]

    active_session_diners = [
        _register_diner(index, branch_id=7, session_id=42)
        for _ in range(4)
    ]
    other_diners = [
        _register_diner(index, branch_id=7, session_id=session_id)
        for session_id in range(43, 139)  # 96 more diners on other tables
    ]

    staff_targets = (
        index.get_waiter_connections(7)
        | index.get_sector_connections(5)
        | index.get_admin_connections(7)
        | index.get_kitchen_connections(7)
    )

    # Staff total: 4 admins + 2 kitchen + 4 waiters = 10
    assert len(staff_targets) == 10
    # No diner connection leaked into the staff target set.
    for diner in active_session_diners + other_diners:
        assert diner not in staff_targets

    # Session-targeted sends only hit the 4 diners of session 42.
    session_targets = index.get_session_connections(42)
    assert session_targets == set(active_session_diners)
    assert len(session_targets) == 4
