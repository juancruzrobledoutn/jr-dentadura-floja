"""
Customization Option Service - Clean Architecture Implementation.

Handles CRUD for reusable product customization options (modifiers)
and M:N linking to products.

Usage:
    from rest_api.services.domain import CustomizationService

    service = CustomizationService(db)
    options = service.list_all(tenant_id)
    option = service.create(data, tenant_id, user_id, user_email)
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rest_api.models import Product
from rest_api.models.product_customization import CustomizationOption, ProductCustomizationLink
from shared.utils.admin_schemas import CustomizationOptionOutput
from rest_api.services.base_service import BaseCRUDService
from rest_api.services.crud.soft_delete import soft_delete
from shared.utils.exceptions import ValidationError, NotFoundError
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger

logger = get_logger(__name__)


class CustomizationService(BaseCRUDService[CustomizationOption, CustomizationOptionOutput]):
    """
    Service for product customization option management.

    Business rules:
    - Options belong to a tenant (tenant-scoped)
    - Options can be linked to multiple products (M:N)
    - Soft delete preserves audit trail
    - Name + category must be unique within tenant
    """

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=CustomizationOption,
            output_schema=CustomizationOptionOutput,
            entity_name="Opción de personalización",
            image_url_fields=set(),
        )

    # =========================================================================
    # Overrides
    # =========================================================================

    def to_output(self, entity: CustomizationOption) -> CustomizationOptionOutput:
        """Convert entity to output DTO, including product links if loaded."""
        # If product_links are loaded (eagerly), include them
        if hasattr(entity, 'product_links') and entity.product_links is not None:
            return self._to_output_with_products(entity)
        return CustomizationOptionOutput.model_validate(entity)

    # =========================================================================
    # Query Methods
    # =========================================================================

    def list_with_products(
        self,
        tenant_id: int,
        *,
        include_inactive: bool = False,
    ) -> list[CustomizationOptionOutput]:
        """List all customization options with linked product IDs."""
        query = (
            select(CustomizationOption)
            .options(selectinload(CustomizationOption.product_links))
            .where(CustomizationOption.tenant_id == tenant_id)
        )

        if not include_inactive:
            query = query.where(CustomizationOption.is_active.is_(True))

        options = self._db.execute(
            query.order_by(CustomizationOption.category, CustomizationOption.order, CustomizationOption.name)
        ).scalars().unique().all()

        return [self._to_output_with_products(opt) for opt in options]

    # =========================================================================
    # Product Linking
    # =========================================================================

    def link_to_product(
        self,
        option_id: int,
        product_id: int,
        tenant_id: int,
    ) -> None:
        """Link a customization option to a product."""
        # Validate option exists
        option = self._db.scalar(
            select(CustomizationOption).where(
                CustomizationOption.id == option_id,
                CustomizationOption.tenant_id == tenant_id,
                CustomizationOption.is_active.is_(True),
            )
        )
        if not option:
            raise NotFoundError(self._entity_name, option_id, tenant_id=tenant_id)

        # Validate product exists
        product = self._db.scalar(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == tenant_id,
                Product.is_active.is_(True),
            )
        )
        if not product:
            raise NotFoundError("Producto", product_id, tenant_id=tenant_id)

        # Check if link already exists
        existing = self._db.scalar(
            select(ProductCustomizationLink).where(
                ProductCustomizationLink.product_id == product_id,
                ProductCustomizationLink.customization_option_id == option_id,
            )
        )

        if existing:
            if existing.is_active:
                raise ValidationError("El producto ya tiene esta opción de personalización")
            # Restore soft-deleted link
            existing.is_active = True
            safe_commit(self._db)
            return

        link = ProductCustomizationLink(
            product_id=product_id,
            customization_option_id=option_id,
        )
        self._db.add(link)
        safe_commit(self._db)

    def unlink_from_product(
        self,
        option_id: int,
        product_id: int,
        tenant_id: int,
    ) -> None:
        """Unlink a customization option from a product."""
        # Validate option belongs to tenant
        option = self._db.scalar(
            select(CustomizationOption).where(
                CustomizationOption.id == option_id,
                CustomizationOption.tenant_id == tenant_id,
            )
        )
        if not option:
            raise NotFoundError(self._entity_name, option_id, tenant_id=tenant_id)

        link = self._db.scalar(
            select(ProductCustomizationLink).where(
                ProductCustomizationLink.product_id == product_id,
                ProductCustomizationLink.customization_option_id == option_id,
                ProductCustomizationLink.is_active.is_(True),
            )
        )
        if not link:
            raise NotFoundError("Enlace de personalización", f"{option_id}-{product_id}", tenant_id=tenant_id)

        link.is_active = False
        safe_commit(self._db)

    def set_product_links(
        self,
        option_id: int,
        product_ids: list[int],
        tenant_id: int,
    ) -> CustomizationOptionOutput:
        """Replace all product links for an option with the given list."""
        option = self._db.scalar(
            select(CustomizationOption)
            .options(selectinload(CustomizationOption.product_links))
            .where(
                CustomizationOption.id == option_id,
                CustomizationOption.tenant_id == tenant_id,
                CustomizationOption.is_active.is_(True),
            )
        )
        if not option:
            raise NotFoundError(self._entity_name, option_id, tenant_id=tenant_id)

        # Validate all product IDs belong to tenant
        if product_ids:
            valid_products = self._db.execute(
                select(Product.id).where(
                    Product.id.in_(product_ids),
                    Product.tenant_id == tenant_id,
                    Product.is_active.is_(True),
                )
            ).scalars().all()
            valid_ids = set(valid_products)
            invalid = set(product_ids) - valid_ids
            if invalid:
                raise ValidationError(f"Productos no válidos: {list(invalid)}")

        # Deactivate existing links
        for link in option.product_links:
            link.is_active = False

        # Create new links
        for pid in product_ids:
            # Check if link exists (reactivate)
            existing = next(
                (l for l in option.product_links if l.product_id == pid),
                None,
            )
            if existing:
                existing.is_active = True
            else:
                new_link = ProductCustomizationLink(
                    product_id=pid,
                    customization_option_id=option_id,
                )
                self._db.add(new_link)

        safe_commit(self._db)
        self._db.refresh(option)

        return self._to_output_with_products(option)

    # =========================================================================
    # Validation Hooks
    # =========================================================================

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Validate name uniqueness within tenant+category."""
        name = data.get("name", "").strip()
        if not name:
            raise ValidationError("El nombre es obligatorio", field="name")

        category = data.get("category")
        existing = self._db.scalar(
            select(CustomizationOption).where(
                CustomizationOption.tenant_id == tenant_id,
                CustomizationOption.name == name,
                CustomizationOption.category == category,
                CustomizationOption.is_active.is_(True),
            )
        )
        if existing:
            raise ValidationError(
                f"Ya existe una opción '{name}' en la categoría '{category or 'Sin categoría'}'",
                field="name",
            )

    # =========================================================================
    # Transformation
    # =========================================================================

    def _to_output_with_products(self, option: CustomizationOption) -> CustomizationOptionOutput:
        """Build output with product IDs from pre-loaded relationships."""
        product_ids = [
            link.product_id
            for link in option.product_links
            if link.is_active
        ]
        return CustomizationOptionOutput(
            id=option.id,
            tenant_id=option.tenant_id,
            name=option.name,
            category=option.category,
            extra_cost_cents=option.extra_cost_cents,
            order=option.order,
            is_active=option.is_active,
            product_ids=product_ids,
        )
