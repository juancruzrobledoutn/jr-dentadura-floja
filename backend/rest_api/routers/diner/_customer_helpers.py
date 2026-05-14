"""
Internal helpers for the customer feature within the diner package.

C8 PASS 7 REFACTOR: Extracted from the old monolithic `customer.py`.

The customer endpoints (recognize / me / update / suggestions) all share
two pieces of boilerplate that lived inside the router:

1. Device ID resolution — query param OR `X-Device-Id` header (QA-CRIT-02).
2. Customer-to-output mapping plus JSON-array parsing for the textual
   columns Customer stores (excluded_allergen_ids, dietary_preferences,
   excluded_cooking_methods, favorite_product_ids).

Keeping them here lets the feature modules stay focused on business logic
without duplicating the helpers.
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from rest_api.models import Customer
from shared.utils.schemas import CustomerOutput


def get_device_id_from_header(
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
) -> str | None:
    """
    QA-CRIT-02 FIX: Extract device_id from X-Device-Id header.
    Returns None if header is not present.
    """
    return x_device_id


def resolve_device_id(
    query_device_id: str | None,
    header_device_id: str | None,
) -> str:
    """
    QA-CRIT-02 FIX: Resolve effective device_id from query param or header.

    Mirrors the original behavior — prefer the query param, fall back to
    the `X-Device-Id` header, and raise HTTP 400 if neither is present.
    The detail string is preserved verbatim from the pre-refactor router.
    """
    effective_device_id = query_device_id or header_device_id
    if not effective_device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="device_id required (query param or X-Device-Id header)",
        )
    return effective_device_id


def _parse_json_list(json_str: str | None) -> list:
    """Parse JSON array string to list, returning empty list on failure."""
    if not json_str:
        return []
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return []


def _customer_to_output(customer: Customer) -> CustomerOutput:
    """Convert Customer model to output schema."""
    return CustomerOutput(
        id=customer.id,
        tenant_id=customer.tenant_id,
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        first_visit_at=customer.first_visit_at,
        last_visit_at=customer.last_visit_at,
        total_visits=customer.total_visits,
        total_spent_cents=customer.total_spent_cents,
        avg_ticket_cents=customer.avg_ticket_cents,
        excluded_allergen_ids=_parse_json_list(customer.excluded_allergen_ids),
        dietary_preferences=_parse_json_list(customer.dietary_preferences),
        excluded_cooking_methods=_parse_json_list(customer.excluded_cooking_methods),
        favorite_product_ids=_parse_json_list(customer.favorite_product_ids),
        segment=customer.segment,
        consent_remember=customer.consent_remember,
        consent_marketing=customer.consent_marketing,
    )


__all__ = [
    "get_device_id_from_header",
    "resolve_device_id",
    "_parse_json_list",
    "_customer_to_output",
]
