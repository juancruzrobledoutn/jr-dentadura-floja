"""
Product customization option endpoints for managing reusable modifiers.
Examples: "Sin cebolla", "Extra queso", "Sin gluten".
"""

from fastapi import APIRouter

from rest_api.routers.admin._base import (
    Depends, Session,
    get_db, require_admin_or_manager,
    get_user_id, get_user_email,
)
from rest_api.services.domain import CustomizationService
from shared.utils.admin_schemas import (
    CustomizationOptionOutput,
    CustomizationOptionCreate,
    CustomizationOptionUpdate,
    CustomizationOptionLinkRequest,
)


router = APIRouter(tags=["admin-customizations"])


@router.get("/customizations", response_model=list[CustomizationOptionOutput])
def list_customization_options(
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[CustomizationOptionOutput]:
    """List all customization options for the tenant with linked product IDs."""
    service = CustomizationService(db)
    return service.list_with_products(user["tenant_id"])


@router.get("/customizations/{option_id}", response_model=CustomizationOptionOutput)
def get_customization_option(
    option_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> CustomizationOptionOutput:
    """Get a single customization option by ID."""
    service = CustomizationService(db)
    return service.get_by_id(option_id, user["tenant_id"])


@router.post("/customizations", response_model=CustomizationOptionOutput, status_code=201)
def create_customization_option(
    body: CustomizationOptionCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> CustomizationOptionOutput:
    """Create a new customization option."""
    service = CustomizationService(db)
    return service.create(
        data=body.model_dump(exclude_unset=True),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.put("/customizations/{option_id}", response_model=CustomizationOptionOutput)
def update_customization_option(
    option_id: int,
    body: CustomizationOptionUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> CustomizationOptionOutput:
    """Update a customization option."""
    service = CustomizationService(db)
    return service.update(
        entity_id=option_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.delete("/customizations/{option_id}", status_code=204)
def delete_customization_option(
    option_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> None:
    """Soft delete a customization option."""
    service = CustomizationService(db)
    service.delete(
        entity_id=option_id,
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.post("/customizations/{option_id}/products/{product_id}", status_code=204)
def link_product(
    option_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> None:
    """Link a product to a customization option."""
    service = CustomizationService(db)
    service.link_to_product(option_id, product_id, user["tenant_id"])


@router.delete("/customizations/{option_id}/products/{product_id}", status_code=204)
def unlink_product(
    option_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> None:
    """Unlink a product from a customization option."""
    service = CustomizationService(db)
    service.unlink_from_product(option_id, product_id, user["tenant_id"])


@router.put("/customizations/{option_id}/products", response_model=CustomizationOptionOutput)
def set_product_links(
    option_id: int,
    body: CustomizationOptionLinkRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> CustomizationOptionOutput:
    """Replace all product links for a customization option."""
    service = CustomizationService(db)
    return service.set_product_links(option_id, body.product_ids, user["tenant_id"])
