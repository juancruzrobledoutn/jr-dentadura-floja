"""
Customer — personalized suggestions feature router.

Endpoint:
    GET /suggestions

C8 PASS 7 REFACTOR: Split out of `customer.py` to keep modules <500 LoC.
Mounted under the parent `/api/customer` prefix from the customer aggregator.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from rest_api.models import Customer, Diner, Product, Round, RoundItem
from rest_api.routers.diner._customer_helpers import (
    get_device_id_from_header,
    resolve_device_id,
)
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context
from shared.utils.schemas import CustomerSuggestionsOutput, FavoriteProductOutput


router = APIRouter(tags=["customer"])


@router.get("/suggestions", response_model=CustomerSuggestionsOutput)
def get_suggestions(
    device_id: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    table_ctx: dict[str, int] = Depends(current_table_context),
    header_device_id: str | None = Depends(get_device_id_from_header),
) -> CustomerSuggestionsOutput:
    """
    FASE 4: Get personalized product suggestions.

    Returns:
    - favorites: Top 5 most ordered products
    - last_ordered: Products from last visit
    - recommendations: Products similar to favorites (same subcategory, not yet ordered)

    QA-CRIT-02 FIX: device_id can come from query param OR X-Device-Id header.
    """
    effective_device_id = resolve_device_id(device_id, header_device_id)

    tenant_id = table_ctx["tenant_id"]
    # NOTE: branch_id is accepted for backward compatibility but not used downstream.
    _ = branch_id or table_ctx.get("branch_id")

    # Check for customer
    customer = db.scalar(
        select(Customer)
        .where(
            Customer.tenant_id == tenant_id,
            Customer.device_ids.contains(effective_device_id),
        )
    )

    customer_id = customer.id if customer else None

    # Get all diners for this device
    # QA-CRIT-02 FIX: Use effective_device_id
    diner_ids = db.execute(
        select(Diner.id)
        .where(
            Diner.device_id == effective_device_id,
            Diner.tenant_id == tenant_id,
        )
    ).scalars().all()

    if not diner_ids:
        return CustomerSuggestionsOutput(
            device_id=effective_device_id,
            customer_id=customer_id,
        )

    # Get favorite products (top 5 by order count)
    favorites_query = db.execute(
        select(
            Product.id,
            Product.name,
            Product.image,
            func.sum(RoundItem.qty).label("times_ordered"),
            func.max(Round.submitted_at).label("last_ordered"),
        )
        .join(RoundItem, Product.id == RoundItem.product_id)
        .join(Round, RoundItem.round_id == Round.id)
        .join(Diner, Round.table_session_id == Diner.session_id)
        .where(
            Diner.device_id == effective_device_id,  # QA-CRIT-02 FIX
            Diner.tenant_id == tenant_id,
            Round.status != "CANCELED",
            Product.is_active.is_(True),
        )
        .group_by(Product.id, Product.name, Product.image)
        .order_by(func.sum(RoundItem.qty).desc())
        .limit(5)
    ).all()

    favorites = [
        FavoriteProductOutput(
            id=row.id,
            name=row.name,
            image=row.image,
            times_ordered=row.times_ordered,
            last_ordered=row.last_ordered,
        )
        for row in favorites_query
    ]

    # Get last ordered products (from most recent session)
    # QA-CRIT-02 FIX: Use effective_device_id
    last_session = db.scalar(
        select(Diner)
        .where(
            Diner.device_id == effective_device_id,
            Diner.tenant_id == tenant_id,
        )
        .order_by(Diner.joined_at.desc())
    )

    last_ordered = []
    if last_session:
        last_items = db.execute(
            select(
                Product.id,
                Product.name,
                Product.image,
                func.sum(RoundItem.qty).label("times_ordered"),
            )
            .join(RoundItem, Product.id == RoundItem.product_id)
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.table_session_id == last_session.session_id,
                Round.status != "CANCELED",
                Product.is_active.is_(True),
            )
            .group_by(Product.id, Product.name, Product.image)
            .limit(5)
        ).all()

        last_ordered = [
            FavoriteProductOutput(
                id=row.id,
                name=row.name,
                image=row.image,
                times_ordered=row.times_ordered,
            )
            for row in last_items
        ]

    # Get recommendations (same subcategory as favorites, not yet ordered)
    recommendations = []
    if favorites:
        # Get subcategories of favorite products
        favorite_ids = [f.id for f in favorites]
        favorite_subcategories = db.execute(
            select(Product.subcategory_id)
            .where(
                Product.id.in_(favorite_ids),
                Product.subcategory_id.isnot(None),
            )
            .distinct()
        ).scalars().all()

        if favorite_subcategories:
            # Get ordered product IDs
            # QA-CRIT-02 FIX: Use effective_device_id
            ordered_ids = db.execute(
                select(RoundItem.product_id)
                .join(Round, RoundItem.round_id == Round.id)
                .join(Diner, Round.table_session_id == Diner.session_id)
                .where(
                    Diner.device_id == effective_device_id,
                    Diner.tenant_id == tenant_id,
                )
                .distinct()
            ).scalars().all()

            # Find unordered products in same subcategories
            recs_query = db.execute(
                select(Product.id, Product.name, Product.image)
                .where(
                    Product.subcategory_id.in_(favorite_subcategories),
                    Product.id.notin_(ordered_ids) if ordered_ids else True,
                    Product.is_active.is_(True),
                    Product.tenant_id == tenant_id,
                )
                .limit(5)
            ).all()

            # QA-HIGH-03 FIX: Explicitly set last_ordered=None for recommendations (never ordered)
            recommendations = [
                FavoriteProductOutput(
                    id=row.id,
                    name=row.name,
                    image=row.image,
                    times_ordered=0,
                    last_ordered=None,
                )
                for row in recs_query
            ]

    # Update customer favorites if exists
    if customer and favorites:
        customer.favorite_product_ids = json.dumps([f.id for f in favorites])
        db.commit()

    return CustomerSuggestionsOutput(
        device_id=effective_device_id,  # QA-CRIT-02 FIX
        customer_id=customer_id,
        favorites=favorites,
        last_ordered=last_ordered,
        recommendations=recommendations,
    )
