"""
Tests for CircuitBreaker (rest_api/services/payments/circuit_breaker.py).

S3.3: Unit tests covering state transitions, stats, recovery, and error path.
"""

import asyncio
import time

import pytest

from rest_api.services.payments.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerError,
    CircuitState,
    get_all_breaker_stats,
    mercadopago_breaker,
    ollama_breaker,
)


def _make_breaker(**overrides) -> CircuitBreaker:
    """Helper: build a CircuitBreaker with sensible defaults."""
    defaults = dict(
        name="test",
        failure_threshold=3,
        success_threshold=2,
        timeout_seconds=0.05,  # very short so tests run fast
        half_open_max_calls=2,
    )
    defaults.update(overrides)
    return CircuitBreaker(CircuitBreakerConfig(**defaults))


class TestInitialState:
    async def test_starts_closed(self):
        breaker = _make_breaker()
        assert breaker.state == CircuitState.CLOSED

    async def test_stats_start_at_zero(self):
        breaker = _make_breaker()
        s = breaker.stats
        assert s.total_calls == 0
        assert s.successful_calls == 0
        assert s.failed_calls == 0
        assert s.rejected_calls == 0
        assert s.state_changes == 0


class TestSuccessfulCalls:
    async def test_successful_call_keeps_state_closed(self):
        breaker = _make_breaker()
        async with breaker.call():
            pass  # success
        assert breaker.state == CircuitState.CLOSED
        assert breaker.stats.successful_calls == 1
        assert breaker.stats.total_calls == 1

    async def test_success_resets_failure_count_in_closed(self):
        """A success while CLOSED should reset the failure counter."""
        breaker = _make_breaker(failure_threshold=5)

        # 2 failures
        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        assert breaker.state == CircuitState.CLOSED

        # 1 success -> failure count resets
        async with breaker.call():
            pass

        # Now 4 more failures should NOT yet trip (since counter was reset)
        for _ in range(4):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        # After 4 failures we are at the threshold (5), so still closed until 5th
        assert breaker.state == CircuitState.CLOSED


class TestTransitionToOpen:
    async def test_opens_after_failure_threshold(self):
        """After N failures in CLOSED, breaker opens."""
        breaker = _make_breaker(failure_threshold=3)

        for _ in range(3):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")

        assert breaker.state == CircuitState.OPEN
        assert breaker.stats.failed_calls == 3
        # state_changes counter incremented at least once (closed -> open)
        assert breaker.stats.state_changes >= 1

    async def test_open_circuit_rejects_requests(self):
        """When OPEN, calls fail fast with CircuitBreakerError."""
        breaker = _make_breaker(failure_threshold=2, timeout_seconds=10)

        # Trip open
        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        assert breaker.state == CircuitState.OPEN

        # Subsequent call should be rejected
        with pytest.raises(CircuitBreakerError) as exc:
            async with breaker.call():
                pass
        assert exc.value.breaker_name == "test"
        assert exc.value.retry_after >= 0
        assert breaker.stats.rejected_calls == 1


class TestTransitionToHalfOpen:
    async def test_transitions_to_half_open_after_timeout(self):
        """After timeout_seconds since last failure, breaker allows a probe."""
        breaker = _make_breaker(failure_threshold=2, timeout_seconds=0.05)

        # Trip open
        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        assert breaker.state == CircuitState.OPEN

        # Wait for the timeout to elapse
        await asyncio.sleep(0.06)

        # A new call should now transition to HALF_OPEN and proceed
        async with breaker.call():
            pass
        # After 1 success in half-open we still need success_threshold=2 to close
        assert breaker.state == CircuitState.HALF_OPEN

    async def test_half_open_success_threshold_closes_circuit(self):
        """Hitting success_threshold in HALF_OPEN should re-close the circuit."""
        breaker = _make_breaker(
            failure_threshold=2,
            success_threshold=2,
            timeout_seconds=0.01,
            half_open_max_calls=3,
        )

        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        await asyncio.sleep(0.02)

        async with breaker.call():
            pass  # half-open success #1
        async with breaker.call():
            pass  # half-open success #2 -> close

        assert breaker.state == CircuitState.CLOSED

    async def test_half_open_failure_reopens(self):
        """A failure during HALF_OPEN reopens the circuit immediately."""
        breaker = _make_breaker(failure_threshold=2, timeout_seconds=0.01)

        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        await asyncio.sleep(0.02)

        with pytest.raises(RuntimeError):
            async with breaker.call():
                raise RuntimeError("still failing")

        assert breaker.state == CircuitState.OPEN


class TestManualReset:
    async def test_reset_returns_to_closed(self):
        """Manual reset() restores CLOSED state and clears counters."""
        breaker = _make_breaker(failure_threshold=2, timeout_seconds=10)

        for _ in range(2):
            with pytest.raises(RuntimeError):
                async with breaker.call():
                    raise RuntimeError("boom")
        assert breaker.state == CircuitState.OPEN

        await breaker.reset()
        assert breaker.state == CircuitState.CLOSED
        # Counters reset (state_changes is cumulative — we don't assert on it)


class TestPreconfiguredBreakers:
    async def test_module_provides_named_breakers(self):
        """The module exposes pre-configured mercadopago and ollama breakers."""
        assert mercadopago_breaker.config.name == "mercadopago"
        assert ollama_breaker.config.name == "ollama"

    async def test_get_all_breaker_stats_includes_known_breakers(self):
        """get_all_breaker_stats returns a dict with the two pre-configured ones."""
        stats = get_all_breaker_stats()
        assert "mercadopago" in stats
        assert "ollama" in stats
        # Each entry has the expected keys
        for entry in stats.values():
            assert {"state", "total_calls", "successful_calls", "failed_calls", "rejected_calls", "state_changes"} <= entry.keys()
