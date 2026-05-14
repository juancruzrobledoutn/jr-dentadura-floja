"""
Additional tests for OutboxProcessor
(rest_api/services/events/outbox_processor.py).

S3.3: Complements test_outbox.py with tests focused on:
- Singleton accessor (get_outbox_processor)
- Start/stop lifecycle
- _publish_event routing per aggregate_type
- process_pending_events_once helper
- Unknown aggregate_type returns False
- Empty batch path (no events)
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from rest_api.models import OutboxEvent, OutboxStatus
from rest_api.services.events import outbox_processor as op_module
from rest_api.services.events.outbox_processor import (
    OutboxProcessor,
    get_outbox_processor,
    process_pending_events_once,
    start_outbox_processor,
    stop_outbox_processor,
)


# =============================================================================
# Singleton accessor
# =============================================================================


class TestSingletonAccessor:
    def test_get_outbox_processor_returns_singleton(self):
        """get_outbox_processor always returns the same instance."""
        # Reset module-level singleton to ensure clean state
        op_module._processor = None
        p1 = get_outbox_processor()
        p2 = get_outbox_processor()
        assert p1 is p2
        # Restore for safety
        op_module._processor = None


# =============================================================================
# Lifecycle: start/stop
# =============================================================================


class TestProcessorLifecycle:
    async def test_start_sets_running_and_creates_task(self):
        """start() marks the processor as running and schedules the loop."""
        processor = OutboxProcessor()
        # Patch internal loop to a no-op coroutine
        with patch.object(processor, "_run_loop", new=AsyncMock(return_value=None)):
            await processor.start()
            assert processor._running is True
            assert processor._task is not None
            await processor.stop()
            assert processor._running is False

    async def test_start_when_already_running_is_idempotent(self):
        """Calling start() twice should not fail or replace the task."""
        processor = OutboxProcessor()
        with patch.object(processor, "_run_loop", new=AsyncMock(return_value=None)):
            await processor.start()
            first_task = processor._task

            await processor.start()  # second call: warning + no-op
            assert processor._task is first_task

            await processor.stop()

    async def test_stop_when_never_started_is_safe(self):
        """Stopping a never-started processor should not raise."""
        processor = OutboxProcessor()
        # Should not raise even with no task
        await processor.stop()
        assert processor._running is False

    async def test_module_level_start_stop_helpers(self):
        """start_outbox_processor and stop_outbox_processor delegate to singleton."""
        op_module._processor = None  # force fresh singleton
        with patch.object(OutboxProcessor, "_run_loop", new=AsyncMock(return_value=None)):
            await start_outbox_processor()
            assert get_outbox_processor()._running is True
            await stop_outbox_processor()
            assert get_outbox_processor()._running is False
        op_module._processor = None


# =============================================================================
# _publish_event routing
# =============================================================================


class TestPublishEventRouting:
    async def test_round_event_calls_publish_round_event(self):
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "ROUND_SUBMITTED"
        event.aggregate_type = "round"
        event.aggregate_id = 100
        event.payload = json.dumps({"branch_id": 1, "session_id": 2, "round_number": 1})
        event.last_error = None

        with patch("rest_api.services.events.outbox_processor.get_redis_client", new=AsyncMock(return_value=MagicMock())), \
             patch("rest_api.services.events.outbox_processor.publish_round_event", new=AsyncMock(return_value=None)) as mock_pub:
            success = await processor._publish_event(event)
        assert success is True
        mock_pub.assert_awaited_once()

    async def test_check_event_calls_publish_check_event(self):
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "CHECK_PAID"
        event.aggregate_type = "check"
        event.aggregate_id = 200
        event.payload = json.dumps({"branch_id": 1, "session_id": 2, "check_id": 200})
        event.last_error = None

        with patch("rest_api.services.events.outbox_processor.get_redis_client", new=AsyncMock(return_value=MagicMock())), \
             patch("rest_api.services.events.outbox_processor.publish_check_event", new=AsyncMock(return_value=None)) as mock_pub:
            success = await processor._publish_event(event)
        assert success is True
        mock_pub.assert_awaited_once()

    async def test_service_call_event_calls_publish_service_call_event(self):
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "SERVICE_CALL_CREATED"
        event.aggregate_type = "service_call"
        event.aggregate_id = 300
        event.payload = json.dumps({"branch_id": 1, "session_id": 2, "call_id": 300})
        event.last_error = None

        with patch("rest_api.services.events.outbox_processor.get_redis_client", new=AsyncMock(return_value=MagicMock())), \
             patch("rest_api.services.events.outbox_processor.publish_service_call_event", new=AsyncMock(return_value=None)) as mock_pub:
            success = await processor._publish_event(event)
        assert success is True
        mock_pub.assert_awaited_once()

    async def test_unknown_aggregate_type_returns_false(self):
        """An unknown aggregate_type should NOT publish and should return False."""
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "MYSTERY"
        event.aggregate_type = "unicorn"  # not handled
        event.aggregate_id = 1
        event.payload = json.dumps({"branch_id": 1, "session_id": 2})
        event.last_error = None

        with patch("rest_api.services.events.outbox_processor.get_redis_client", new=AsyncMock(return_value=MagicMock())):
            success = await processor._publish_event(event)
        assert success is False

    async def test_publish_event_captures_error_message(self):
        """When publishing raises, the event.last_error should be set."""
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "ROUND_SUBMITTED"
        event.aggregate_type = "round"
        event.aggregate_id = 100
        event.payload = json.dumps({"branch_id": 1, "session_id": 2})
        event.last_error = None

        with patch("rest_api.services.events.outbox_processor.get_redis_client", new=AsyncMock(side_effect=RuntimeError("redis down"))):
            success = await processor._publish_event(event)

        assert success is False
        assert "redis down" in (event.last_error or "")


# =============================================================================
# Empty batch path
# =============================================================================


class TestEmptyBatch:
    async def test_process_batch_returns_zero_when_no_events(self):
        """When no PENDING events exist, _process_batch returns 0 without error."""
        with patch("rest_api.services.events.outbox_processor.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            # No events to return
            mock_execute = MagicMock()
            mock_execute.scalars.return_value.all.return_value = []
            mock_db.execute.return_value = mock_execute

            processor = OutboxProcessor()
            count = await processor._process_batch()
            assert count == 0
            mock_db.close.assert_called_once()


# =============================================================================
# Helper: process_pending_events_once
# =============================================================================


class TestProcessPendingEventsOnce:
    async def test_helper_delegates_to_singleton_process_batch(self):
        """The convenience function calls _process_batch on the singleton."""
        op_module._processor = None
        proc = get_outbox_processor()

        with patch.object(proc, "_process_batch", new=AsyncMock(return_value=3)):
            result = await process_pending_events_once()
        assert result == 3
        op_module._processor = None


# =============================================================================
# JSON payload parsing
# =============================================================================


class TestPayloadParsing:
    async def test_invalid_json_payload_records_error(self):
        """A malformed JSON payload should set last_error and return False."""
        processor = OutboxProcessor()
        event = MagicMock(spec=OutboxEvent)
        event.id = 1
        event.tenant_id = 7
        event.event_type = "ROUND_SUBMITTED"
        event.aggregate_type = "round"
        event.aggregate_id = 100
        event.payload = "{not valid json"
        event.last_error = None

        success = await processor._publish_event(event)
        assert success is False
        assert event.last_error is not None
