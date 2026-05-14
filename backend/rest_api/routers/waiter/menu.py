"""
Waiter — comanda rápida menu feature router.

Endpoints:
    GET /branches/{branch_id}/menu

C8 PASS 5 REFACTOR: Split out of `routes.py` for module size <800 LoC.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context, require_roles

from rest_api.routers.waiter._schemas import (
    CategoryCompactOutput,
    MenuCompactOutput,
    ProductCompactOutput,
)


router = APIRouter(tags=["waiter"])


@router.get("/branches/{branch_id}/menu", response_model=MenuCompactOutput)
def get_branch_menu_compact(
    branch_id: int,
    db: Session = Depends(get_db),
    ctx: dict[str, Any] = Depends(current_user_context),
) -> MenuCompactOutput:
    """
    COMANDA RÁPIDA: Get compact menu for a branch.

    C8 PASS 2 REFACTOR: Thin controller — delegates to ProductService.
    Router maps service raw dicts to Pydantic schemas (router-owned).
    """
    from rest_api.services.domain import ProductService
    from shared.utils.exceptions import (
        NotFoundError as _NotFoundError,
        ForbiddenError as _ForbiddenError,
    )

    require_roles(ctx, ["WAITER", "MANAGER", "ADMIN"])

    tenant_id = ctx.get("tenant_id")
    branch_ids = ctx.get("branch_ids", [])

    service = ProductService(db)
    try:
        data = service.get_compact_branch_menu(
            tenant_id=tenant_id,
            branch_id=branch_id,
            branch_ids=branch_ids,
        )
    except _NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch {branch_id} not found",
        )
    except _ForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this branch",
        )

    branch = data["branch"]
    result_categories = [
        CategoryCompactOutput(
            id=category.id,
            name=category.name,
            products=[ProductCompactOutput(**p) for p in products],
        )
        for category, products in data["categories_with_products"]
    ]

    return MenuCompactOutput(
        branch_id=branch.id,
        branch_name=branch.name,
        categories=result_categories,
        total_products=data["total_products"],
    )
