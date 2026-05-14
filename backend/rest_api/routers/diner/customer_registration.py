"""
Customer — registration feature router.

Endpoint:
    POST /register

C8 PASS 7 REFACTOR: Split out of `customer.py` to keep modules <500 LoC.
Mounted under the parent `/api/customer` prefix from the customer aggregator.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from rest_api.models import Customer, Diner, Round, RoundItem
from rest_api.routers.diner._customer_helpers import (
    _customer_to_output,
    _parse_json_list,
)
from shared.config.logging import get_logger
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.utils.schemas import CustomerOutput, CustomerRegisterRequest


logger = get_logger("customer")

router = APIRouter(tags=["customer"])


@router.post("/register", response_model=CustomerOutput)
def register_customer(
    body: CustomerRegisterRequest,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
) -> CustomerOutput:
    """
    FASE 4: Register a new customer with opt-in consent.

    Creates a Customer entity and links all previous visits (Diners)
    with the same device_id to this customer.

    If customer already exists for this device, returns existing.
    """
    tenant_id = table_ctx["tenant_id"]

    # RTR-RACE-01 FIX: Check if customer already exists with this device
    # Use with_for_update() to prevent race condition during concurrent registration
    existing_device_ids = db.scalar(
        select(Customer)
        .where(
            Customer.tenant_id == tenant_id,
            Customer.device_ids.contains(body.device_id),
        )
        .with_for_update()  # Block if locked by another transaction (prevents duplicate registration)
    )

    if existing_device_ids:
        logger.info("Customer already exists for device", device_id=body.device_id)
        return _customer_to_output(existing_device_ids)

    # RTR-RACE-01 FIX: Check for existing customer by phone or email with locking
    if body.phone:
        existing_phone = db.scalar(
            select(Customer)
            .where(
                Customer.tenant_id == tenant_id,
                Customer.phone == body.phone,
            )
            .with_for_update()
        )
        if existing_phone:
            # HIGH-COMMIT-01 FIX: Add device_id to existing customer with proper error handling
            device_ids = _parse_json_list(existing_phone.device_ids)
            if body.device_id not in device_ids:
                device_ids.append(body.device_id)
                existing_phone.device_ids = json.dumps(device_ids)
                try:
                    db.commit()
                    db.refresh(existing_phone)
                except Exception as e:
                    db.rollback()
                    logger.error("Failed to add device to customer", error=str(e))
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to update customer",
                    )
            return _customer_to_output(existing_phone)

    if body.email:
        existing_email = db.scalar(
            select(Customer)
            .where(
                Customer.tenant_id == tenant_id,
                Customer.email == body.email,
            )
            .with_for_update()
        )
        if existing_email:
            # HIGH-COMMIT-02 FIX: Add device_id to existing customer with proper error handling
            device_ids = _parse_json_list(existing_email.device_ids)
            if body.device_id not in device_ids:
                device_ids.append(body.device_id)
                existing_email.device_ids = json.dumps(device_ids)
                try:
                    db.commit()
                    db.refresh(existing_email)
                except Exception as e:
                    db.rollback()
                    logger.error("Failed to add device to customer", error=str(e))
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to update customer",
                    )
            return _customer_to_output(existing_email)

    # Calculate metrics from previous visits
    previous_visits = db.execute(
        select(Diner)
        .where(
            Diner.device_id == body.device_id,
            Diner.tenant_id == tenant_id,
        )
        .order_by(Diner.joined_at)
    ).scalars().all()

    total_visits = len(previous_visits)
    first_visit = previous_visits[0].joined_at if previous_visits else datetime.now(timezone.utc)
    last_visit = previous_visits[-1].joined_at if previous_visits else datetime.now(timezone.utc)

    # QA-CRIT-04 FIX: Calculate total spent with single aggregated query (avoid N+1)
    total_spent = 0
    if previous_visits:
        session_ids = [d.session_id for d in previous_visits]
        total_spent = db.scalar(
            select(func.coalesce(func.sum(RoundItem.unit_price_cents * RoundItem.qty), 0))
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.table_session_id.in_(session_ids),
                Round.status != "CANCELED",
            )
        ) or 0

    avg_ticket = total_spent // total_visits if total_visits > 0 else 0

    # Create new customer
    # QA-CRIT-01 FIX: Include new fields (birthday, ai_personalization)
    new_customer = Customer(
        tenant_id=tenant_id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        birthday_month=body.birthday_month,
        birthday_day=body.birthday_day,
        first_visit_at=first_visit,
        last_visit_at=last_visit,
        total_visits=max(1, total_visits),
        total_spent_cents=total_spent,
        avg_ticket_cents=avg_ticket,
        excluded_allergen_ids=json.dumps(body.excluded_allergen_ids) if body.excluded_allergen_ids else None,
        dietary_preferences=json.dumps(body.dietary_preferences) if body.dietary_preferences else None,
        excluded_cooking_methods=json.dumps(body.excluded_cooking_methods) if body.excluded_cooking_methods else None,
        segment="new" if total_visits <= 1 else ("occasional" if total_visits <= 3 else "regular"),
        consent_remember=body.consent_remember,
        consent_marketing=body.consent_marketing,
        ai_personalization_enabled=body.ai_personalization_enabled,
        device_ids=json.dumps([body.device_id]),
    )

    db.add(new_customer)

    try:
        db.commit()
        db.refresh(new_customer)
    except Exception as e:
        db.rollback()
        logger.error("Failed to create customer", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create customer",
        )

    # RACE-01 FIX: Link previous visits to customer with proper error handling
    # This is separate from customer creation to avoid rolling back the customer
    # if visit linking fails (customer already exists and is valid)
    if previous_visits:
        try:
            for diner in previous_visits:
                diner.customer_id = new_customer.id
            db.commit()
        except Exception as e:
            # Visit linking failed - log but don't fail the registration
            # Customer is already created, visits can be linked later
            db.rollback()
            logger.warning(
                "Failed to link visits to customer (customer created successfully)",
                customer_id=new_customer.id,
                device_id=body.device_id,
                visits_count=len(previous_visits),
                error=str(e),
            )
            # Refresh customer from DB to return valid data
            db.refresh(new_customer)

    logger.info(
        "Customer registered",
        customer_id=new_customer.id,
        device_id=body.device_id,
        visits_linked=len(previous_visits),
    )

    return _customer_to_output(new_customer)
