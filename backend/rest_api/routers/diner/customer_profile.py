"""
Customer — profile feature router.

Endpoints:
    GET   /recognize
    GET   /me
    PATCH /me

C8 PASS 7 REFACTOR: Split out of `customer.py` to keep modules <500 LoC.
Mounted under the parent `/api/customer` prefix from the customer aggregator.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from rest_api.models import Customer, Diner
from rest_api.routers.diner._customer_helpers import (
    _customer_to_output,
    get_device_id_from_header,
    resolve_device_id,
)
from shared.config.logging import get_logger
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.utils.schemas import (
    CustomerOutput,
    CustomerRecognizeResponse,
    CustomerUpdateRequest,
)


logger = get_logger("customer")

router = APIRouter(tags=["customer"])


@router.get("/recognize", response_model=CustomerRecognizeResponse)
def recognize_customer(
    device_id: str | None = None,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
    header_device_id: str | None = Depends(get_device_id_from_header),
) -> CustomerRecognizeResponse:
    """
    FASE 4: Check if a device is linked to a known customer.

    Called on app start to determine personalized greeting.
    Also returns whether to prompt for opt-in (after 3+ anonymous visits).

    QA-CRIT-02 FIX: device_id can come from query param OR X-Device-Id header.
    """
    effective_device_id = resolve_device_id(device_id, header_device_id)

    tenant_id = table_ctx["tenant_id"]

    # Check for existing customer with this device
    customer = db.scalar(
        select(Customer)
        .where(
            Customer.tenant_id == tenant_id,
            Customer.device_ids.contains(effective_device_id),
        )
    )

    if customer:
        return CustomerRecognizeResponse(
            recognized=True,
            customer_id=customer.id,
            customer_name=customer.name,
            last_visit=customer.last_visit_at,
            visit_count=customer.total_visits,
            should_prompt_optin=False,
            anonymous_visit_count=0,
        )

    # Count anonymous visits for this device
    anonymous_visits = db.scalar(
        select(func.count(Diner.id))
        .where(
            Diner.device_id == effective_device_id,
            Diner.tenant_id == tenant_id,
            Diner.customer_id.is_(None),
        )
    ) or 0

    # Prompt opt-in after 3+ visits
    should_prompt = anonymous_visits >= 3

    return CustomerRecognizeResponse(
        recognized=False,
        should_prompt_optin=should_prompt,
        anonymous_visit_count=anonymous_visits,
    )


@router.get("/me", response_model=CustomerOutput)
def get_current_customer(
    device_id: str | None = None,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
    header_device_id: str | None = Depends(get_device_id_from_header),
) -> CustomerOutput:
    """
    FASE 4: Get profile of customer linked to this device.

    QA-CRIT-02 FIX: device_id can come from query param OR X-Device-Id header.
    """
    effective_device_id = resolve_device_id(device_id, header_device_id)

    tenant_id = table_ctx["tenant_id"]

    customer = db.scalar(
        select(Customer)
        .where(
            Customer.tenant_id == tenant_id,
            Customer.device_ids.contains(effective_device_id),
        )
    )

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer found for this device",
        )

    return _customer_to_output(customer)


@router.patch("/me", response_model=CustomerOutput)
def update_customer(
    body: CustomerUpdateRequest,
    device_id: str | None = None,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
    header_device_id: str | None = Depends(get_device_id_from_header),
) -> CustomerOutput:
    """
    FASE 4: Update customer preferences.

    QA-CRIT-02 FIX: device_id can come from query param OR X-Device-Id header.
    """
    effective_device_id = resolve_device_id(device_id, header_device_id)

    tenant_id = table_ctx["tenant_id"]

    customer = db.scalar(
        select(Customer)
        .where(
            Customer.tenant_id == tenant_id,
            Customer.device_ids.contains(effective_device_id),
        )
    )

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer found for this device",
        )

    # Update fields if provided
    if body.name is not None:
        customer.name = body.name
    if body.phone is not None:
        customer.phone = body.phone
    if body.email is not None:
        customer.email = body.email
    if body.excluded_allergen_ids is not None:
        customer.excluded_allergen_ids = json.dumps(body.excluded_allergen_ids)
    if body.dietary_preferences is not None:
        customer.dietary_preferences = json.dumps(body.dietary_preferences)
    if body.excluded_cooking_methods is not None:
        customer.excluded_cooking_methods = json.dumps(body.excluded_cooking_methods)
    if body.consent_marketing is not None:
        customer.consent_marketing = body.consent_marketing

    try:
        db.commit()
        db.refresh(customer)
    except Exception as e:
        db.rollback()
        logger.error("Failed to update customer", customer_id=customer.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update customer",
        )

    return _customer_to_output(customer)
