"""
Pydantic schemas for the waiter router.

C8 PASS 5 REFACTOR: All inline `class XxxRequest/Response(BaseModel)` definitions
from `routes.py` are consolidated here so the route modules stay focused on
HTTP handling. The aggregator router re-exports schemas as needed.

Schemas grouped by feature:
    - Sector assignments    (SectorAssignmentOutput, MyAssignmentsOutput,
                             BranchAssignmentVerifyOutput)
    - Table session detail  (RoundItemDetailOutput, RoundDetailOutput,
                             DinerDetailOutput, TableSessionDetailOutput)
    - Comanda rápida menu   (ProductCompactOutput, CategoryCompactOutput,
                             MenuCompactOutput)
    - Round item management (DeleteRoundItemResponse, VoidRoundItemRequest,
                             VoidRoundItemResponse)
    - Shift handoff         (TransferWaiterRequest, TransferWaiterResponse)
    - Ad-hoc discounts      (ApplyDiscountRequest, ApplyDiscountResponse)
    - Table move            (MoveTableResponse)
    - Enums                 (ShiftType)
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


# =============================================================================
# Enums
# =============================================================================


class ShiftType(str, Enum):
    """Valid shift types for waiter assignments (RTR-MED-05)."""
    MORNING = "MORNING"
    AFTERNOON = "AFTERNOON"
    NIGHT = "NIGHT"


# =============================================================================
# Sector Assignments
# =============================================================================


class SectorAssignmentOutput(BaseModel):
    """Output schema for a sector assignment."""
    sector_id: int
    sector_name: str
    sector_prefix: str
    branch_id: int
    assignment_date: date
    shift: Optional[str] = None


class MyAssignmentsOutput(BaseModel):
    """Output schema for waiter's current assignments."""
    waiter_id: int
    assignment_date: date
    sectors: list[SectorAssignmentOutput]
    sector_ids: list[int]  # Convenience list for filtering


class BranchAssignmentVerifyOutput(BaseModel):
    """Output for branch assignment verification."""
    is_assigned: bool
    branch_id: int
    branch_name: str | None = None
    assignment_date: date
    sectors: list[SectorAssignmentOutput] = []
    message: str


# =============================================================================
# Table Session Detail (Dashboard Integration)
# =============================================================================


class RoundItemDetailOutput(BaseModel):
    """Detailed round item info for Dashboard TableSessionModal."""
    id: int
    product_id: int
    product_name: str
    category_name: Optional[str] = None
    qty: int
    unit_price_cents: int
    notes: Optional[str] = None
    diner_id: Optional[int] = None
    diner_name: Optional[str] = None
    diner_color: Optional[str] = None


class RoundDetailOutput(BaseModel):
    """Detailed round info for Dashboard TableSessionModal."""
    id: int
    round_number: int
    status: str
    created_at: datetime
    submitted_at: Optional[datetime] = None
    items: list[RoundItemDetailOutput] = []


class DinerDetailOutput(BaseModel):
    """Diner info for Dashboard TableSessionModal."""
    id: int
    session_id: int
    name: str
    color: str
    local_id: Optional[str] = None
    joined_at: datetime
    device_id: Optional[str] = None


class TableSessionDetailOutput(BaseModel):
    """Complete session detail for Dashboard TableSessionModal."""
    session_id: int
    table_id: int
    table_code: str
    status: str
    opened_at: datetime
    diners: list[DinerDetailOutput] = []
    rounds: list[RoundDetailOutput] = []
    check_status: Optional[str] = None
    total_cents: int = 0
    paid_cents: int = 0


# =============================================================================
# Comanda Rápida — Menu for Waiter
# =============================================================================


class ProductCompactOutput(BaseModel):
    """Compact product info for waiter comanda (no images)."""
    id: int
    name: str
    description: Optional[str] = None
    price_cents: int
    category_id: int
    category_name: str
    subcategory_id: Optional[int] = None
    subcategory_name: Optional[str] = None
    allergen_icons: list[str] = []
    is_available: bool = True


class CategoryCompactOutput(BaseModel):
    """Category with its products for comanda view."""
    id: int
    name: str
    products: list[ProductCompactOutput] = []


class MenuCompactOutput(BaseModel):
    """Compact menu structure for waiter comanda."""
    branch_id: int
    branch_name: str
    categories: list[CategoryCompactOutput] = []
    total_products: int = 0


# =============================================================================
# Round Item Management
# =============================================================================


class DeleteRoundItemResponse(BaseModel):
    """Response for deleting a round item."""
    success: bool
    round_id: int
    item_id: int
    remaining_items: int
    round_deleted: bool = False  # True if round was deleted because it became empty
    message: str


class VoidRoundItemRequest(BaseModel):
    """Request body for voiding a round item."""
    reason: str


class VoidRoundItemResponse(BaseModel):
    """Response for voiding a round item."""
    success: bool
    item_id: int
    round_id: int
    is_voided: bool
    void_reason: str
    round_canceled: bool
    message: str


# =============================================================================
# Waiter Shift Handoff
# =============================================================================


class TransferWaiterRequest(BaseModel):
    """Request body for transferring a table's session to another waiter."""
    target_waiter_id: int


class TransferWaiterResponse(BaseModel):
    """Response for waiter shift handoff."""
    success: bool
    table_id: int
    table_code: str
    session_id: int
    previous_waiter_id: Optional[int]
    new_waiter_id: int
    message: str


# =============================================================================
# Ad-hoc Discounts
# =============================================================================


class ApplyDiscountRequest(BaseModel):
    """Request body for applying a discount to a session's check."""
    discount_type: str  # "PERCENT" or "AMOUNT"
    value: int  # Percentage (1-100) or amount in cents
    reason: str


class ApplyDiscountResponse(BaseModel):
    """Response for discount application."""
    success: bool
    session_id: int
    check_id: int
    discount_type: str
    discount_value: int
    discount_amount_cents: int
    old_total_cents: int
    new_total_cents: int
    message: str


# =============================================================================
# Table Move
# =============================================================================


class MoveTableResponse(BaseModel):
    """Response for moving customers from one table to another."""
    success: bool
    source_table_id: int
    source_table_code: str
    target_table_id: int
    target_table_code: str
    session_id: int
    message: str


__all__ = [
    # Enums
    "ShiftType",
    # Assignments
    "SectorAssignmentOutput",
    "MyAssignmentsOutput",
    "BranchAssignmentVerifyOutput",
    # Table session detail
    "RoundItemDetailOutput",
    "RoundDetailOutput",
    "DinerDetailOutput",
    "TableSessionDetailOutput",
    # Comanda
    "ProductCompactOutput",
    "CategoryCompactOutput",
    "MenuCompactOutput",
    # Rounds
    "DeleteRoundItemResponse",
    "VoidRoundItemRequest",
    "VoidRoundItemResponse",
    # Shift handoff
    "TransferWaiterRequest",
    "TransferWaiterResponse",
    # Discounts
    "ApplyDiscountRequest",
    "ApplyDiscountResponse",
    # Move
    "MoveTableResponse",
]
