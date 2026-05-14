"""
Service Call Domain Service.

CRIT-01 FIX: Extracted from diner/orders.py for thin controller pattern.
Handles all service call business logic.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from rest_api.models import (
    Table,
    TableSession,
    ServiceCall,
)
from rest_api.services.events.outbox_service import write_service_call_outbox_event
from shared.infrastructure.events import SERVICE_CALL_CREATED
from shared.utils.exceptions import NotFoundError, ConflictError

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger = get_logger(__name__)


class ServiceCallService:
    """
    Domain service for ServiceCall operations.
    
    CRIT-01 FIX: Extracted from diner/orders.py and waiter/routes.py routers.
    """
    
    def __init__(self, db: Session):
        self._db = db
    
    def validate_session(self, session_id: int) -> TableSession:
        """Validate session is active."""
        session = self._db.scalar(
            select(TableSession).where(
                TableSession.id == session_id,
                TableSession.status.in_(["OPEN", "PAYING"]),
            )
        )
        if not session:
            raise ConflictError("Session is not active", session_id=session_id)
        return session
    
    def get_table_info(self, table_id: int) -> tuple[Table | None, int | None]:
        """Get table and its sector_id."""
        table = self._db.scalar(select(Table).where(Table.id == table_id))
        sector_id = table.sector_id if table else None
        return table, sector_id
    
    def get_pending_calls(self, branch_ids: list[int]) -> list[ServiceCall]:
        """
        Get all pending service calls for given branches.

        REF-02: Improved with eager loading and soft delete filter.
        Returns calls with status OPEN or ACKED.
        """
        calls = self._db.execute(
            select(ServiceCall)
            .options(
                joinedload(ServiceCall.session).joinedload(TableSession.table),
            )
            .where(
                ServiceCall.branch_id.in_(branch_ids),
                ServiceCall.status.in_(["OPEN", "ACKED"]),
                ServiceCall.is_active.is_(True),
            )
            .order_by(ServiceCall.created_at.asc())
        ).scalars().unique().all()

        return list(calls)

    def get_pending_calls_dto(self, branch_ids: list[int]) -> list[dict]:
        """
        C8 PASS 3 REFACTOR: Get pending service calls as router-ready dicts.

        Extracted from rest_api/routers/waiter/routes.py:get_pending_service_calls.
        Returns a list of dicts ready to be unpacked into ServiceCallOutput by
        the router (no schema coupling in the service).
        """
        calls = self.get_pending_calls(branch_ids)
        result: list[dict] = []
        for call in calls:
            session = call.session
            table = session.table if session else None
            result.append(
                {
                    "id": call.id,
                    "type": call.type,
                    "status": call.status,
                    "created_at": call.created_at,
                    "acked_at": call.acked_at if hasattr(call, "acked_at") else None,
                    "acked_by_user_id": call.acked_by_user_id,
                    "table_id": table.id if table else None,
                    "table_code": table.code if table else None,
                    "session_id": call.table_session_id,
                }
            )
        return result
    
    def create_service_call(
        self,
        tenant_id: int,
        branch_id: int,
        session_id: int,
        table_id: int,
        call_type: str,
    ) -> tuple[ServiceCall, int | None, bool]:
        """
        Create a service call.
        
        Returns (call, sector_id, is_new) tuple.
        If a call already exists (idempotency), returns existing call with is_new=False.
        
        Uses outbox pattern for guaranteed event delivery.
        """
        # Validate session
        self.validate_session(session_id)
        
        # Get table info
        table, sector_id = self.get_table_info(table_id)
        
        # Check for existing open call (idempotency)
        existing = self._db.scalar(
            select(ServiceCall).where(
                ServiceCall.table_session_id == session_id,
                ServiceCall.type == call_type,
                ServiceCall.status == "OPEN",
            )
        )
        
        if existing:
            logger.info(
                "Service call already exists (idempotency)",
                call_id=existing.id,
                session_id=session_id,
            )
            return existing, sector_id, False
        
        # Create new call
        call = ServiceCall(
            tenant_id=tenant_id,
            branch_id=branch_id,
            table_session_id=session_id,
            type=call_type,
            status="OPEN",
        )
        self._db.add(call)
        self._db.flush()
        
        # Write outbox event (atomic with business data)
        write_service_call_outbox_event(
            db=self._db,
            tenant_id=tenant_id,
            event_type=SERVICE_CALL_CREATED,
            call_id=call.id,
            branch_id=branch_id,
            session_id=session_id,
            table_id=table_id,
            call_type=call_type,
            sector_id=sector_id,
            actor_role="DINER",
        )
        
        safe_commit(self._db)
        self._db.refresh(call)
        
        logger.info(
            "Service call created",
            call_id=call.id,
            session_id=session_id,
            type=call_type,
        )
        
        return call, sector_id, True
    
    def acknowledge(
        self,
        call_id: int,
        user_id: int,
        branch_ids: list[int],
    ) -> ServiceCall:
        """
        Acknowledge a service call.
        
        Changes status from OPEN to ACKED.
        Validates waiter has access to the call's branch.
        """
        call = self._db.scalar(
            select(ServiceCall).where(
                ServiceCall.id == call_id,
                ServiceCall.branch_id.in_(branch_ids),
            )
        )
        
        if not call:
            raise NotFoundError("Llamada de servicio", call_id)
        
        if call.status != "OPEN":
            raise ValueError(f"Cannot acknowledge call with status {call.status}")
        
        call.status = "ACKED"
        call.acked_by_user_id = user_id
        call.acked_at = datetime.now(timezone.utc)
        
        safe_commit(self._db)
        
        logger.info(
            "Service call acknowledged",
            call_id=call_id,
            user_id=user_id,
        )
        
        return call
    
    def resolve(
        self,
        call_id: int,
        user_id: int,
        branch_ids: list[int],
    ) -> ServiceCall:
        """
        Resolve (close) a service call.

        Changes status to CLOSED.
        """
        call = self._db.scalar(
            select(ServiceCall).where(
                ServiceCall.id == call_id,
                ServiceCall.branch_id.in_(branch_ids),
            )
        )

        if not call:
            raise NotFoundError("Llamada de servicio", call_id)

        if call.status == "CLOSED":
            raise ValueError("Service call is already closed")

        call.status = "CLOSED"
        call.closed_at = datetime.now(timezone.utc)

        safe_commit(self._db)

        logger.info(
            "Service call resolved",
            call_id=call_id,
            user_id=user_id,
        )

        return call

    # -------------------------------------------------------------------------
    # C8 PASS 3 REFACTOR: Combined operations that also return the table/sector
    # info the router needs for event publication. Avoid a second roundtrip
    # via get_table_info. Backward-compatible: original acknowledge/resolve
    # remain (still used by test_service_call_service.py).
    # -------------------------------------------------------------------------

    def acknowledge_with_table_info(
        self,
        call_id: int,
        user_id: int,
        branch_ids: list[int],
    ) -> tuple[ServiceCall, Table | None, int | None]:
        """Acknowledge a call and return (call, table, sector_id)."""
        call = self.acknowledge(call_id, user_id, branch_ids)
        table_id = call.session.table_id if call.session else 0
        table, sector_id = self.get_table_info(table_id)
        return call, table, sector_id

    def resolve_with_table_info(
        self,
        call_id: int,
        user_id: int,
        branch_ids: list[int],
    ) -> tuple[ServiceCall, Table | None, int | None]:
        """Resolve a call and return (call, table, sector_id)."""
        call = self.resolve(call_id, user_id, branch_ids)
        table_id = call.session.table_id if call.session else 0
        table, sector_id = self.get_table_info(table_id)
        return call, table, sector_id

    def to_output_dict(
        self,
        call: ServiceCall,
        table: Table | None,
    ) -> dict:
        """
        Build the ServiceCallOutput-compatible dict from a call + table.

        C8 PASS 3: Centralizes the response mapping that was duplicated in
        get_pending_service_calls, acknowledge_service_call, and
        resolve_service_call.
        """
        return {
            "id": call.id,
            "type": call.type,
            "status": call.status,
            "created_at": call.created_at,
            "acked_at": call.acked_at if hasattr(call, "acked_at") else None,
            "acked_by_user_id": call.acked_by_user_id,
            "table_id": table.id if table else None,
            "table_code": table.code if table else None,
            "session_id": call.table_session_id,
        }
