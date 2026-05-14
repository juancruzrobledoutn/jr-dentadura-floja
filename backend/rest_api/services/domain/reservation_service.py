"""
Reservation Service - Clean Architecture Implementation.

Handles reservation business logic including status transitions,
overlap validation, and branch-scoped queries.
"""

from __future__ import annotations

from datetime import date, time, timedelta, datetime
from typing import Any, TYPE_CHECKING

from sqlalchemy import select, and_
from sqlalchemy.orm import Session

import threading

from rest_api.models import Reservation, Branch
from shared.utils.admin_schemas import ReservationOutput
from rest_api.services.base_service import BranchScopedService
from rest_api.services.events import publish_entity_deleted
from shared.utils.exceptions import ValidationError, NotFoundError
from shared.config.logging import get_logger

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger = get_logger(__name__)


# Valid status transitions (FSM)
VALID_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"CONFIRMED", "CANCELED", "NO_SHOW"},
    "CONFIRMED": {"SEATED", "CANCELED", "NO_SHOW"},
    "SEATED": {"COMPLETED", "CANCELED"},
    "COMPLETED": set(),
    "CANCELED": set(),
    "NO_SHOW": set(),
}

ALL_STATUSES = {"PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELED", "NO_SHOW"}


class ReservationService(BranchScopedService[Reservation, ReservationOutput]):
    """Service for reservation management."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=Reservation,
            output_schema=ReservationOutput,
            entity_name="Reserva",
            image_url_fields=set(),
        )

    # =========================================================================
    # Query Methods
    # =========================================================================

    def list_by_branch_filtered(
        self,
        tenant_id: int,
        branch_id: int,
        *,
        filter_date: date | None = None,
        filter_status: str | None = None,
        include_inactive: bool = False,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ReservationOutput]:
        """List reservations for a branch with optional date/status filters."""
        entities = self.list_by_branch(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            limit=limit,
            offset=offset,
            order_by=Reservation.reservation_date,
        )

        # Apply filters on output DTOs
        if filter_date is not None:
            entities = [
                e for e in entities
                if e.reservation_date == filter_date
            ]

        if filter_status is not None:
            entities = [
                e for e in entities
                if e.status == filter_status.upper()
            ]

        return entities

    # =========================================================================
    # Command Methods
    # =========================================================================

    def update_status(
        self,
        tenant_id: int,
        reservation_id: int,
        new_status: str,
        user_id: int,
        user_email: str,
    ) -> ReservationOutput:
        """
        Update reservation status following the FSM.

        Validates that the transition is allowed before applying.
        """
        new_status = new_status.upper()

        if new_status not in ALL_STATUSES:
            raise ValidationError(
                f"Estado inválido: {new_status}",
                field="status",
            )

        entity = self._repo.find_by_id(reservation_id, tenant_id)
        if entity is None:
            raise NotFoundError("Reserva", reservation_id, tenant_id=tenant_id)

        current_status = entity.status
        allowed = VALID_TRANSITIONS.get(current_status, set())

        if new_status not in allowed:
            raise ValidationError(
                f"No se puede cambiar de {current_status} a {new_status}. "
                f"Transiciones válidas: {', '.join(sorted(allowed)) if allowed else 'ninguna'}",
                field="status",
            )

        result = self.update(
            entity_id=reservation_id,
            data={"status": new_status},
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
        )

        # Send confirmation email in background if transitioning to CONFIRMED
        if new_status == "CONFIRMED" and entity.customer_email:
            self._send_confirmation_email_async(entity)

        return result

    def cancel(
        self,
        tenant_id: int,
        reservation_id: int,
        user_id: int,
        user_email: str,
    ) -> ReservationOutput:
        """Cancel a reservation."""
        return self.update_status(
            tenant_id=tenant_id,
            reservation_id=reservation_id,
            new_status="CANCELED",
            user_id=user_id,
            user_email=user_email,
        )

    # =========================================================================
    # Email Notifications
    # =========================================================================

    @staticmethod
    def _send_confirmation_email_async(reservation: Reservation) -> None:
        """Send reservation confirmation email without blocking the request."""
        def _send() -> None:
            try:
                from shared.infrastructure.email import EmailService

                html = (
                    f"<h2>Reserva Confirmada</h2>"
                    f"<p>Hola {reservation.customer_name},</p>"
                    f"<p>Tu reserva ha sido confirmada:</p>"
                    f"<ul>"
                    f"<li><strong>Fecha:</strong> {reservation.reservation_date}</li>"
                    f"<li><strong>Hora:</strong> {reservation.reservation_time}</li>"
                    f"<li><strong>Personas:</strong> {reservation.party_size}</li>"
                    f"</ul>"
                    f"<p>Te esperamos.</p>"
                )
                EmailService.send(
                    to=reservation.customer_email,
                    subject="Reserva Confirmada",
                    html_body=html,
                )
            except Exception as e:
                logger.error(
                    "Failed to send reservation confirmation email",
                    reservation_id=reservation.id,
                    error=str(e),
                )

        thread = threading.Thread(target=_send, daemon=True)
        thread.start()

    # =========================================================================
    # Validation Hooks
    # =========================================================================

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Validate reservation creation."""
        branch_id = data.get("branch_id")
        if not branch_id:
            raise ValidationError("branch_id es requerido", field="branch_id")

        # Verify branch belongs to tenant
        branch = self._db.scalar(
            select(Branch).where(
                Branch.id == branch_id,
                Branch.tenant_id == tenant_id,
            )
        )
        if not branch:
            raise ValidationError("branch_id inválido", field="branch_id")

        # Validate party_size
        party_size = data.get("party_size", 0)
        if party_size < 1:
            raise ValidationError("El tamaño del grupo debe ser al menos 1", field="party_size")

        # Validate customer_name
        customer_name = data.get("customer_name", "").strip()
        if not customer_name:
            raise ValidationError("El nombre del cliente es requerido", field="customer_name")

        # Check for overlapping reservations on the same table
        table_id = data.get("table_id")
        if table_id:
            reservation_date = data.get("reservation_date")
            reservation_time = data.get("reservation_time")
            duration_minutes = data.get("duration_minutes", 90)

            if reservation_date and reservation_time:
                self._check_overlap(
                    tenant_id=tenant_id,
                    branch_id=branch_id,
                    table_id=table_id,
                    reservation_date=reservation_date,
                    reservation_time=reservation_time,
                    duration_minutes=duration_minutes,
                    exclude_id=None,
                )

        # Default status
        data.setdefault("status", "PENDING")

    def _check_overlap(
        self,
        tenant_id: int,
        branch_id: int,
        table_id: int,
        reservation_date: date,
        reservation_time: time,
        duration_minutes: int,
        exclude_id: int | None = None,
    ) -> None:
        """Check if there's an overlapping reservation for the same table."""
        # Build the time window for the new reservation
        start_dt = datetime.combine(reservation_date, reservation_time)
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        # Find active reservations on the same table & date that aren't canceled/no-show
        stmt = (
            select(Reservation)
            .where(
                Reservation.tenant_id == tenant_id,
                Reservation.branch_id == branch_id,
                Reservation.table_id == table_id,
                Reservation.reservation_date == reservation_date,
                Reservation.is_active.is_(True),
                Reservation.status.notin_(["CANCELED", "NO_SHOW", "COMPLETED"]),
            )
        )

        if exclude_id:
            stmt = stmt.where(Reservation.id != exclude_id)

        existing = self._db.scalars(stmt).all()

        for res in existing:
            existing_start = datetime.combine(res.reservation_date, res.reservation_time)
            existing_end = existing_start + timedelta(minutes=res.duration_minutes)

            # Check overlap: two intervals overlap if start1 < end2 AND start2 < end1
            if start_dt < existing_end and existing_start < end_dt:
                raise ValidationError(
                    f"La mesa ya tiene una reserva entre "
                    f"{res.reservation_time.strftime('%H:%M')} y "
                    f"{existing_end.strftime('%H:%M')}",
                    field="table_id",
                )

    # =========================================================================
    # Lifecycle Hooks
    # =========================================================================

    def _after_delete(
        self,
        entity_info: dict[str, Any],
        user_id: int,
        user_email: str,
        *,
        background_tasks: "BackgroundTasks | None" = None,
    ) -> None:
        """Publish deletion event."""
        publish_entity_deleted(
            tenant_id=entity_info["tenant_id"],
            entity_type="reservation",
            entity_id=entity_info["id"],
            entity_name=entity_info.get("name"),
            branch_id=entity_info.get("branch_id"),
            actor_user_id=user_id,
            background_tasks=background_tasks,
        )

    def _get_entity_info_for_event(self, entity: Reservation) -> dict[str, Any]:
        """Get entity info including customer name."""
        return {
            "id": entity.id,
            "name": entity.customer_name,
            "tenant_id": entity.tenant_id,
            "branch_id": entity.branch_id,
        }
