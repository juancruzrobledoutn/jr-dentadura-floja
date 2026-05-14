"""
Pydantic schemas for the diner router (inline-defined ones).

C8 PASS 6 REFACTOR: Inline schemas from the old monolithic `orders.py` are
consolidated here so the feature modules stay focused on HTTP handling.

C8 PASS 7 REFACTOR: Inline schemas from `cart.py` are now consolidated
here too. Customer schemas live in `shared.utils.schemas`.

Most request/response models for diner endpoints live in
`shared.utils.schemas` (registration, rounds, service calls, billing,
preferences, device history, customer). Only the *feedback* and *cart*
endpoints define their schemas inline — those are moved here.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# =============================================================================
# Customer Feedback
# =============================================================================


class FeedbackRequest(BaseModel):
    """Request body for submitting feedback."""
    rating: int = Field(ge=1, le=5, description="Rating from 1 to 5 stars")
    comment: str | None = Field(None, max_length=500, description="Optional comment")


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""
    id: int
    rating: int
    comment: str | None
    created_at: str


# =============================================================================
# Shared Cart
# =============================================================================


class AddToCartRequest(BaseModel):
    """Request to add an item to the shared cart."""
    product_id: int
    quantity: int = Field(ge=1, le=99, default=1)
    notes: str | None = Field(default=None, max_length=500)
    diner_id: int | None = Field(default=None, description="Backend diner ID (optional, for multi-diner support)")


class UpdateCartItemRequest(BaseModel):
    """Request to update a cart item."""
    quantity: int = Field(ge=1, le=99)
    notes: str | None = Field(default=None, max_length=500)


class CartItemOutput(BaseModel):
    """Output for a cart item."""
    item_id: int
    product_id: int
    product_name: str
    product_image: str | None
    price_cents: int
    quantity: int
    notes: str | None
    diner_id: int
    diner_name: str
    diner_color: str

    model_config = {"from_attributes": True}


class CartOutput(BaseModel):
    """Output for the full cart."""
    items: list[CartItemOutput]
    version: int


__all__ = [
    "FeedbackRequest",
    "FeedbackResponse",
    "AddToCartRequest",
    "UpdateCartItemRequest",
    "CartItemOutput",
    "CartOutput",
]
