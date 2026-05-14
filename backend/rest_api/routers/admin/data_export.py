"""
GDPR/Data Protection Compliance endpoints.

Handles customer data export ("right to access") and anonymization
("right to be forgotten"). Requires ADMIN role for all operations.

CLEAN-ARCH: Data collection logic is inline here since it spans multiple
models and is specific to compliance — not reusable business logic.
"""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from shared.infrastructure.db import get_db, safe_commit
from shared.security.auth import current_user_context as current_user
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError
from rest_api.services.permissions import PermissionContext
from rest_api.models.crm import CustomerProfile, CustomerVisit, LoyaltyTransaction
from rest_api.models.audit import AuditLog
from shared.utils.schemas import CustomerDataExportOutput

logger = get_logger(__name__)

router = APIRouter(prefix="/data-export", tags=["admin-data-export"])


# =============================================================================
# Customer Data Export (Right to Access)
# =============================================================================


@router.get("/customer/{customer_id}", response_model=CustomerDataExportOutput)
def export_customer_data(
    customer_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Export ALL data for a customer as JSON. Requires ADMIN role.

    Collects: profile, visits, loyalty transactions, and related data.
    Compliant with GDPR Article 15 (Right of Access).
    """
    ctx = PermissionContext(user)
    ctx.require_admin()

    # Get customer profile with relationships
    profile = db.scalar(
        select(CustomerProfile)
        .where(
            CustomerProfile.id == customer_id,
            CustomerProfile.tenant_id == ctx.tenant_id,
        )
        .options(
            selectinload(CustomerProfile.visits),
            selectinload(CustomerProfile.loyalty_transactions),
        )
    )
    if not profile:
        raise NotFoundError("Cliente", customer_id, tenant_id=ctx.tenant_id)

    # Build export data
    export = {
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by_user_id": ctx.user_id,
            "tenant_id": ctx.tenant_id,
            "customer_id": customer_id,
            "format_version": "1.0",
        },
        "profile": {
            "id": profile.id,
            "name": profile.name,
            "email": profile.email,
            "phone": profile.phone,
            "device_id": profile.device_id,
            "dietary_preferences": profile.dietary_preferences,
            "allergen_ids": profile.allergen_ids,
            "preferred_language": profile.preferred_language,
            "notes": profile.notes,
            "loyalty_points": profile.loyalty_points,
            "loyalty_tier": profile.loyalty_tier,
            "total_visits": profile.total_visits,
            "total_spent_cents": profile.total_spent_cents,
            "last_visit_at": profile.last_visit_at.isoformat() if profile.last_visit_at else None,
            "marketing_consent": profile.marketing_consent,
            "data_consent": profile.data_consent,
            "consent_date": profile.consent_date.isoformat() if profile.consent_date else None,
            "is_active": profile.is_active,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
        },
        "visits": [
            {
                "id": v.id,
                "branch_id": v.branch_id,
                "visit_date": v.visit_date.isoformat() if v.visit_date else None,
                "party_size": v.party_size,
                "total_spent_cents": v.total_spent_cents,
                "rating": v.rating,
                "feedback": v.feedback,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in (profile.visits or [])
        ],
        "loyalty_transactions": [
            {
                "id": lt.id,
                "transaction_type": lt.transaction_type,
                "points": lt.points,
                "balance_after": lt.balance_after,
                "description": lt.description,
                "reference_type": lt.reference_type,
                "reference_id": lt.reference_id,
                "created_at": lt.created_at.isoformat() if lt.created_at else None,
            }
            for lt in (profile.loyalty_transactions or [])
        ],
    }

    logger.info(
        "Customer data exported (GDPR Article 15)",
        extra={
            "customer_id": customer_id,
            "exported_by": ctx.user_id,
            "visits_count": len(export["visits"]),
            "loyalty_tx_count": len(export["loyalty_transactions"]),
        },
    )

    return export


# =============================================================================
# Customer Anonymization (Right to Be Forgotten)
# =============================================================================


@router.delete("/customer/{customer_id}")
def anonymize_customer_data(
    customer_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Anonymize customer data (right to be forgotten). Requires ADMIN role.

    Replaces PII with redacted placeholders while keeping aggregate data
    intact for business analytics. Compliant with GDPR Article 17.

    Anonymized fields: name, email, phone, device_id, notes, feedback.
    Preserved fields: visit dates, amounts, points (aggregates).
    """
    ctx = PermissionContext(user)
    ctx.require_admin()

    profile = db.scalar(
        select(CustomerProfile)
        .where(
            CustomerProfile.id == customer_id,
            CustomerProfile.tenant_id == ctx.tenant_id,
        )
        .options(
            selectinload(CustomerProfile.visits),
        )
    )
    if not profile:
        raise NotFoundError("Cliente", customer_id, tenant_id=ctx.tenant_id)

    # Anonymize profile PII
    original_name = profile.name
    profile.name = "Cliente Anonimo"
    profile.email = "anonimo@redacted.com"
    profile.phone = "0000000000"
    profile.device_id = None
    profile.notes = None
    profile.dietary_preferences = None
    profile.allergen_ids = None
    profile.marketing_consent = False
    profile.data_consent = False
    profile.set_updated_by(ctx.user_id, ctx.user_email)

    # Anonymize visit feedback (keep dates and amounts for analytics)
    visits_anonymized = 0
    for visit in (profile.visits or []):
        if visit.feedback:
            visit.feedback = "[REDACTED]"
            visits_anonymized += 1

    # Log the anonymization as an audit event
    audit_entry = AuditLog(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
        entity_type="customer_profile",
        entity_id=customer_id,
        action="ANONYMIZE",
        old_values=None,  # Do not store original PII in audit log
        new_values='{"name": "Cliente Anonimo", "email": "anonimo@redacted.com", "phone": "0000000000"}',
        changes='{"reason": "GDPR Article 17 - Right to be forgotten"}',
    )
    db.add(audit_entry)

    safe_commit(db)

    logger.info(
        "Customer data anonymized (GDPR Article 17)",
        extra={
            "customer_id": customer_id,
            "anonymized_by": ctx.user_id,
            "original_name_length": len(original_name) if original_name else 0,
            "visits_anonymized": visits_anonymized,
        },
    )

    return {
        "status": "anonymized",
        "customer_id": customer_id,
        "fields_anonymized": [
            "name", "email", "phone", "device_id", "notes",
            "dietary_preferences", "allergen_ids",
        ],
        "visits_feedback_anonymized": visits_anonymized,
        "message": "Los datos personales han sido anonimizados. "
                   "Los datos agregados se mantienen para analíticas.",
    }


# =============================================================================
# Audit Log Export
# =============================================================================


@router.get("/audit-log")
def export_audit_log(
    entity_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Export audit log entries for compliance review. Requires ADMIN role.

    Filterable by entity type and date range.
    """
    ctx = PermissionContext(user)
    ctx.require_admin()

    stmt = select(AuditLog).where(
        AuditLog.tenant_id == ctx.tenant_id,
        AuditLog.is_active.is_(True),
    )

    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if date_from:
        stmt = stmt.where(func.date(AuditLog.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(AuditLog.created_at) <= date_to)

    stmt = stmt.order_by(AuditLog.created_at.desc())
    stmt = stmt.offset(offset).limit(limit)

    entries = db.scalars(stmt).all()

    return [
        {
            "id": e.id,
            "user_id": e.user_id,
            "user_email": e.user_email,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "action": e.action,
            "old_values": e.old_values,
            "new_values": e.new_values,
            "changes": e.changes,
            "ip_address": e.ip_address,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]
