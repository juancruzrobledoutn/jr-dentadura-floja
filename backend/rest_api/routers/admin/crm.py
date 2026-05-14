"""
Customer CRM endpoints.

CLEAN-ARCH: Thin router that delegates to CRMService.
Handles: customer profiles, visit history, loyalty points, rules, reports.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from shared.infrastructure.db import get_db
from shared.security.auth import current_user_context as current_user
from rest_api.services.permissions import PermissionContext
from rest_api.services.domain.crm_service import CRMService
from shared.utils.schemas import (
    CustomerProfileOutput,
    CustomerHistoryOutput,
    LoyaltyTransactionOutput,
    LoyaltyRuleOutput,
    LoyaltyReportOutput,
    PointsAdjustmentOutput,
)


router = APIRouter(tags=["admin-crm"])


# =============================================================================
# Request Schemas
# =============================================================================


class CustomerProfileCreate(BaseModel):
    name: str = Field(min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    device_id: Optional[str] = None
    dietary_preferences: Optional[str] = None
    allergen_ids: Optional[str] = None
    preferred_language: Optional[str] = Field(default=None, pattern="^(es|en|pt)$")
    notes: Optional[str] = None
    marketing_consent: bool = False
    data_consent: bool = False


class CustomerProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    device_id: Optional[str] = None
    dietary_preferences: Optional[str] = None
    allergen_ids: Optional[str] = None
    preferred_language: Optional[str] = Field(default=None, pattern="^(es|en|pt)$")
    notes: Optional[str] = None
    marketing_consent: Optional[bool] = None
    data_consent: Optional[bool] = None


class PointsAdjustment(BaseModel):
    points: int
    description: str = Field(min_length=1)


class LoyaltyRuleCreate(BaseModel):
    name: str = Field(min_length=1)
    rule_type: str = Field(pattern="^(SPEND_BASED|VISIT_BASED|PRODUCT_BASED)$")
    points_per_unit: int = Field(ge=1)
    unit_amount_cents: Optional[int] = Field(default=None, ge=1)
    min_spend_cents: Optional[int] = Field(default=None, ge=0)
    silver_threshold: int = Field(default=500, ge=1)
    gold_threshold: int = Field(default=2000, ge=1)
    platinum_threshold: int = Field(default=5000, ge=1)


class LoyaltyRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    rule_type: Optional[str] = Field(default=None, pattern="^(SPEND_BASED|VISIT_BASED|PRODUCT_BASED)$")
    points_per_unit: Optional[int] = Field(default=None, ge=1)
    unit_amount_cents: Optional[int] = Field(default=None, ge=1)
    min_spend_cents: Optional[int] = Field(default=None, ge=0)
    silver_threshold: Optional[int] = Field(default=None, ge=1)
    gold_threshold: Optional[int] = Field(default=None, ge=1)
    platinum_threshold: Optional[int] = Field(default=None, ge=1)


# =============================================================================
# Customer Profiles
# =============================================================================


@router.get("/customers", response_model=list[CustomerProfileOutput])
def list_customers(
    search: str | None = None,
    tier: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List customer profiles with optional search and tier filter."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.list_profiles(
        tenant_id=ctx.tenant_id,
        search=search,
        tier=tier,
        limit=limit,
        offset=offset,
    )


@router.get("/customers/top", response_model=list[CustomerProfileOutput])
def get_top_customers(
    sort_by: str = Query(default="total_spent_cents", pattern="^(total_spent_cents|total_visits)$"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Top customers by spending or visits."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_top_customers(
        tenant_id=ctx.tenant_id,
        sort_by=sort_by,
        limit=limit,
    )


@router.get("/customers/{customer_id}", response_model=CustomerProfileOutput)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Get a customer profile."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_profile(customer_id, ctx.tenant_id)


@router.post("/customers", status_code=201, response_model=CustomerProfileOutput)
def create_customer(
    body: CustomerProfileCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a customer profile."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_or_create_profile(
        tenant_id=ctx.tenant_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        device_id=body.device_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.patch("/customers/{customer_id}", response_model=CustomerProfileOutput)
def update_customer(
    customer_id: int,
    body: CustomerProfileUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update a customer profile."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.update_profile(
        profile_id=customer_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.delete("/customers/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a customer profile."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    service.delete_profile(
        profile_id=customer_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Visit History
# =============================================================================


@router.get("/customers/{customer_id}/history", response_model=CustomerHistoryOutput)
def get_customer_history(
    customer_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Full visit history for a customer."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_customer_history(
        profile_id=customer_id,
        tenant_id=ctx.tenant_id,
        limit=limit,
        offset=offset,
    )


# =============================================================================
# Loyalty Points
# =============================================================================


@router.get("/customers/{customer_id}/loyalty", response_model=list[LoyaltyTransactionOutput])
def get_loyalty_history(
    customer_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Points transaction history for a customer."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_loyalty_history(
        profile_id=customer_id,
        tenant_id=ctx.tenant_id,
        limit=limit,
        offset=offset,
    )


@router.post("/customers/{customer_id}/points", response_model=PointsAdjustmentOutput)
def adjust_points(
    customer_id: int,
    body: PointsAdjustment,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Manual point adjustment (admin action)."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.adjust_points(
        profile_id=customer_id,
        points=body.points,
        tenant_id=ctx.tenant_id,
        description=body.description,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Loyalty Rules
# =============================================================================


@router.get("/loyalty-rules", response_model=list[LoyaltyRuleOutput])
def list_loyalty_rules(
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """List loyalty rules for the tenant."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.list_rules(ctx.tenant_id)


@router.post("/loyalty-rules", status_code=201, response_model=LoyaltyRuleOutput)
def create_loyalty_rule(
    body: LoyaltyRuleCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Create a loyalty rule."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.create_rule(
        tenant_id=ctx.tenant_id,
        data=body.model_dump(),
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.patch("/loyalty-rules/{rule_id}", response_model=LoyaltyRuleOutput)
def update_loyalty_rule(
    rule_id: int,
    body: LoyaltyRuleUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Update a loyalty rule."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.update_rule(
        rule_id=rule_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


@router.delete("/loyalty-rules/{rule_id}", status_code=204)
def delete_loyalty_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Soft delete a loyalty rule."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    service.delete_rule(
        rule_id=rule_id,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        actor_email=ctx.user_email,
    )


# =============================================================================
# Reports
# =============================================================================


@router.get("/loyalty/report", response_model=LoyaltyReportOutput)
def get_loyalty_report(
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    """Loyalty program statistics."""
    ctx = PermissionContext(user)
    ctx.require_management()

    service = CRMService(db)
    return service.get_loyalty_report(ctx.tenant_id)
