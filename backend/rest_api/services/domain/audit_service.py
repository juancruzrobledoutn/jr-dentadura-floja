"""
Audit Service - Centralized audit logging for domain operations.

Wraps the existing CRUD audit module with a convenient class interface
for use in domain services (billing, rounds, staff, inventory, tips).
"""

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from rest_api.models import AuditLog
from rest_api.services.crud.audit import log_change, serialize_model


class AuditService:
    """
    Centralized audit logging service for domain operations.

    Usage:
        audit = AuditService(db)
        audit.log(
            tenant_id=1,
            user_id=5,
            user_email="admin@demo.com",
            action="PAYMENT",
            entity_type="payment",
            entity_id=42,
            new_values={"amount_cents": 5000, "provider": "CASH"},
        )
    """

    def __init__(self, db: Session):
        self._db = db

    def log(
        self,
        tenant_id: int,
        user_id: Optional[int],
        user_email: Optional[str],
        action: str,
        entity_type: str,
        entity_id: int,
        old_values: Optional[dict] = None,
        new_values: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log an audit event to the database.

        Actions: CREATE, UPDATE, DELETE, VOID, PAYMENT, REFUND,
                 SUBMIT, CANCEL, ROLE_CHANGE, STOCK_ADJUSTMENT
        """
        return log_change(
            self._db,
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            old_values=old_values,
            new_values=new_values,
        )

    def log_entity(
        self,
        tenant_id: int,
        user_id: Optional[int],
        user_email: Optional[str],
        action: str,
        entity_type: str,
        entity: Any,
        old_values: Optional[dict] = None,
    ) -> AuditLog:
        """
        Log an audit event using a SQLAlchemy model instance.

        Automatically serializes the entity for new_values.
        """
        return log_change(
            self._db,
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
            entity_type=entity_type,
            entity_id=entity.id,
            action=action,
            old_values=old_values,
            new_values=serialize_model(entity),
        )
