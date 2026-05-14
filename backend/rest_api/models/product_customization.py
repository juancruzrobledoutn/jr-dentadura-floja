"""
Product Customization Models: CustomizationOption, ProductCustomizationLink.

Reusable customization options per tenant (e.g., "Sin cebolla", "Extra queso")
that can be linked to multiple products via M:N relationship.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import AuditMixin, Base, BigIntPK

if TYPE_CHECKING:
    from .tenant import Tenant
    from .catalog import Product


class CustomizationOption(AuditMixin, Base):
    """
    Reusable customization option at the tenant level.
    Examples: "Sin cebolla", "Sin gluten", "Extra queso", "Sin sal".
    Grouped by category (e.g., "Ingredientes", "Extras", "Cocción").
    Inherits: is_active, created_at, updated_at, deleted_at, *_by_id/email from AuditMixin.
    """

    __tablename__ = "customization_option"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)  # e.g., "Sin cebolla"
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g., "Ingredientes", "Extras"
    extra_cost_cents: Mapped[int] = mapped_column(Integer, default=0)  # Additional cost (e.g., "Extra queso" = 200)
    order: Mapped[int] = mapped_column(Integer, default=0)  # Display order

    # Relationships
    tenant: Mapped["Tenant"] = relationship()
    product_links: Mapped[list["ProductCustomizationLink"]] = relationship(
        back_populates="customization_option", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # Prevent duplicate names within same tenant+category
        UniqueConstraint("tenant_id", "name", "category", name="uq_customization_option_tenant_name_category"),
        Index("ix_customization_option_tenant_active", "tenant_id", "is_active"),
    )


class ProductCustomizationLink(Base):
    """
    M:N linking products to their available customization options.
    When a product has this link, customers can select the option when ordering.
    """

    __tablename__ = "product_customization_link"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customization_option_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customization_option.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    product: Mapped["Product"] = relationship()
    customization_option: Mapped["CustomizationOption"] = relationship(back_populates="product_links")

    __table_args__ = (
        UniqueConstraint("product_id", "customization_option_id", name="uq_product_customization_link"),
    )
