"""
Diner — device tracking & implicit preferences feature router.

Endpoints (FASE 1 + FASE 2 — Fidelización):
    GET    /device/{device_id}/history
    PATCH  /preferences
    GET    /device/{device_id}/preferences

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from rest_api.models import Branch, Diner, Round, RoundItem, TableSession
from shared.config.logging import diner_logger as logger
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.utils.schemas import (
    DeviceHistoryOutput,
    DevicePreferencesOutput,
    DeviceVisitOutput,
    ImplicitPreferencesData,
    UpdatePreferencesRequest,
    UpdatePreferencesResponse,
)


router = APIRouter(tags=["diner"])


# =============================================================================
# Device History (FASE 1: Fidelización)
# =============================================================================


@router.get("/device/{device_id}/history", response_model=DeviceHistoryOutput)
def get_device_history(
    device_id: str,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> DeviceHistoryOutput:
    """
    Get visit history for a device.

    FASE 1: Device tracking for cross-session recognition.
    Returns all visits associated with the device_id for the tenant.
    Only returns data for the same tenant as the current session.

    Requires X-Table-Token header with valid table token.
    """
    tenant_id = table_ctx["tenant_id"]

    # Get all diners with this device_id for the tenant
    diners_with_sessions = db.execute(
        select(Diner, TableSession, Branch)
        .join(TableSession, Diner.session_id == TableSession.id)
        .join(Branch, Diner.branch_id == Branch.id)
        .where(
            Diner.device_id == device_id,
            Diner.tenant_id == tenant_id,
        )
        .order_by(Diner.joined_at.desc())
    ).all()

    if not diners_with_sessions:
        return DeviceHistoryOutput(
            device_id=device_id,
            total_visits=0,
            total_spent_cents=0,
            visits=[],
        )

    # RTR-MED-01 FIX: Batch queries to avoid N+1 pattern
    # Collect all session IDs and diner IDs for batch queries
    session_ids = [session.id for _, session, _ in diners_with_sessions]
    diner_ids = [diner.id for diner, _, _ in diners_with_sessions]

    # Batch query 1: Get spent per diner across all sessions
    spent_by_diner = dict(db.execute(
        select(RoundItem.diner_id, func.sum(RoundItem.unit_price_cents * RoundItem.qty))
        .join(Round, RoundItem.round_id == Round.id)
        .where(
            Round.table_session_id.in_(session_ids),
            Round.status != "CANCELED",
            RoundItem.diner_id.in_(diner_ids),
        )
        .group_by(RoundItem.diner_id)
    ).all())

    # Batch query 2: Get total spent per session (for fallback calculation)
    spent_by_session = dict(db.execute(
        select(Round.table_session_id, func.sum(RoundItem.unit_price_cents * RoundItem.qty))
        .join(RoundItem, Round.id == RoundItem.round_id)
        .where(
            Round.table_session_id.in_(session_ids),
            Round.status != "CANCELED",
        )
        .group_by(Round.table_session_id)
    ).all())

    # Batch query 3: Get diner count per session
    diners_per_session = dict(db.execute(
        select(Diner.session_id, func.count(Diner.id))
        .where(Diner.session_id.in_(session_ids))
        .group_by(Diner.session_id)
    ).all())

    # Batch query 4: Get item count per session
    items_per_session = dict(db.execute(
        select(Round.table_session_id, func.count(RoundItem.id))
        .join(RoundItem, Round.id == RoundItem.round_id)
        .where(
            Round.table_session_id.in_(session_ids),
            Round.status != "CANCELED",
        )
        .group_by(Round.table_session_id)
    ).all())

    visits: list[DeviceVisitOutput] = []
    total_spent = 0

    # RTR-LOW-04 FIX: Named constant for default diner count
    DEFAULT_DINER_COUNT = 1  # Fallback when no diners found (shouldn't happen)

    for diner, session, branch in diners_with_sessions:
        # Use pre-fetched data instead of individual queries
        session_spent = spent_by_diner.get(diner.id, 0)

        # If no diner_id on items, calculate total session spent / diners
        if session_spent == 0:
            total_session = spent_by_session.get(session.id, 0)
            diner_count = diners_per_session.get(session.id, DEFAULT_DINER_COUNT)
            session_spent = total_session // diner_count if diner_count > 0 else 0

        items_count = items_per_session.get(session.id, 0)

        visits.append(DeviceVisitOutput(
            session_id=session.id,
            diner_id=diner.id,
            diner_name=diner.name,
            branch_id=branch.id,
            branch_name=branch.name,
            visited_at=diner.joined_at,
            total_spent_cents=session_spent,
            items_ordered=items_count,
        ))
        total_spent += session_spent

    return DeviceHistoryOutput(
        device_id=device_id,
        total_visits=len(visits),
        total_spent_cents=total_spent,
        first_visit=visits[-1].visited_at if visits else None,
        last_visit=visits[0].visited_at if visits else None,
        visits=visits,
    )


# =============================================================================
# Implicit Preferences (FASE 2: Fidelización)
# =============================================================================


@router.patch("/preferences", response_model=UpdatePreferencesResponse)
def update_diner_preferences(
    body: UpdatePreferencesRequest,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> UpdatePreferencesResponse:
    """
    FASE 2: Update implicit preferences for the current diner.

    Syncs filter settings (allergens, dietary, cooking methods) from
    the frontend to the backend for cross-session persistence.

    Requires X-Table-Token header with valid table token.
    """
    session_id = table_ctx["session_id"]

    # Get the most recent diner for this session (current user)
    diner = db.scalar(
        select(Diner)
        .where(Diner.session_id == session_id)
        .order_by(Diner.joined_at.desc())
    )

    if not diner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No diner found for this session",
        )

    # Serialize preferences to JSON
    prefs_json = json.dumps({
        "excluded_allergen_ids": body.implicit_preferences.excluded_allergen_ids,
        "dietary_preferences": body.implicit_preferences.dietary_preferences,
        "excluded_cooking_methods": body.implicit_preferences.excluded_cooking_methods,
        "cross_reactions_enabled": body.implicit_preferences.cross_reactions_enabled,
        "strictness": body.implicit_preferences.strictness,
    })

    diner.implicit_preferences = prefs_json

    try:
        db.commit()
        db.refresh(diner)
    except Exception as e:
        db.rollback()
        logger.error("Failed to update preferences", diner_id=diner.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save preferences",
        )

    logger.info("Preferences updated", diner_id=diner.id, device_id=diner.device_id)

    return UpdatePreferencesResponse(
        diner_id=diner.id,
        device_id=diner.device_id,
        implicit_preferences=body.implicit_preferences,
        updated_at=datetime.now(timezone.utc),
    )


@router.get("/device/{device_id}/preferences", response_model=DevicePreferencesOutput)
def get_device_preferences(
    device_id: str,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> DevicePreferencesOutput:
    """
    FASE 2: Get the most recent preferences for a device.

    Used on app start to pre-fill filter settings for returning visitors.
    Returns the preferences from the most recent visit by this device.

    Requires X-Table-Token header with valid table token.
    """
    tenant_id = table_ctx["tenant_id"]

    # Find the most recent diner with this device_id that has preferences
    diner = db.scalar(
        select(Diner)
        .where(
            Diner.device_id == device_id,
            Diner.tenant_id == tenant_id,
            Diner.implicit_preferences.isnot(None),
        )
        .order_by(Diner.joined_at.desc())
    )

    # Count total visits for this device
    visit_count = db.scalar(
        select(func.count(Diner.id))
        .where(
            Diner.device_id == device_id,
            Diner.tenant_id == tenant_id,
        )
    ) or 0

    if not diner or not diner.implicit_preferences:
        return DevicePreferencesOutput(
            device_id=device_id,
            has_preferences=False,
            visit_count=visit_count,
        )

    # Parse stored preferences
    try:
        prefs_data = json.loads(diner.implicit_preferences)
        preferences = ImplicitPreferencesData(
            excluded_allergen_ids=prefs_data.get("excluded_allergen_ids", []),
            dietary_preferences=prefs_data.get("dietary_preferences", []),
            excluded_cooking_methods=prefs_data.get("excluded_cooking_methods", []),
            cross_reactions_enabled=prefs_data.get("cross_reactions_enabled", False),
            strictness=prefs_data.get("strictness", "strict"),
        )
    except (json.JSONDecodeError, TypeError):
        return DevicePreferencesOutput(
            device_id=device_id,
            has_preferences=False,
            visit_count=visit_count,
        )

    return DevicePreferencesOutput(
        device_id=device_id,
        has_preferences=True,
        implicit_preferences=preferences,
        last_updated=diner.joined_at,
        visit_count=visit_count,
    )


__all__ = ["router"]
