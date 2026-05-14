"""
Domain Services - Clean Architecture Application Layer.

CLEAN-ARCH: Services contain business logic and orchestrate operations.
They use Repositories for data access and emit domain events.

Structure:
    Router (thin controller)
        ↓
    Service (business logic)  ← YOU ARE HERE
        ↓
    Repository (data access)
        ↓
    Model (entity)

Usage:
    from rest_api.services.domain import CategoryService

    # In router
    service = CategoryService(db)
    categories = service.list_by_branch(tenant_id, branch_id)
"""

from .category_service import CategoryService
from .subcategory_service import SubcategoryService
from .branch_service import BranchService
from .table_service import TableService
from .sector_service import SectorService
from .product_service import ProductService
from .allergen_service import AllergenService
from .staff_service import StaffService
from .promotion_service import PromotionService
from .ticket_service import TicketService

# CRIT-01 FIX: New domain services for thin controller pattern
from .round_service import RoundService
from .service_call_service import ServiceCallService
from .billing_service import BillingService
from .diner_service import DinerService

# Inventory and cost management
from .inventory_service import InventoryService, SupplierService, PurchaseOrderService

# Cash register
from .cash_service import CashService

# Tips
from .tip_service import TipService

# Fiscal (AFIP)
from .fiscal_service import FiscalService

# Scheduling
from .scheduling_service import SchedulingService

# CRM
from .crm_service import CRMService

# Floor Plan
from .floor_plan_service import FloorPlanService

# Product Customization
from .customization_service import CustomizationService

# Reservations
from .reservation_service import ReservationService

# Delivery / Takeout
from .delivery_service import DeliveryService

# Receipts / Printing
from .receipt_service import ReceiptService

# Audit
from .audit_service import AuditService

# Manager Overrides
from .override_service import OverrideService

# Waiter-Sector Assignment (bulk atomic ops)
from .assignment_service import AssignmentService

# Branch Exclusions (replace-all atomic)
from .exclusion_service import ExclusionService

__all__ = [
    # Existing services
    "CategoryService",
    "SubcategoryService",
    "BranchService",
    "TableService",
    "SectorService",
    "ProductService",
    "AllergenService",
    "StaffService",
    "PromotionService",
    "TicketService",
    # CRIT-01: New domain services
    "RoundService",
    "ServiceCallService",
    "BillingService",
    "DinerService",
    # Inventory
    "InventoryService",
    "SupplierService",
    "PurchaseOrderService",
    # Cash register
    "CashService",
    # Tips
    "TipService",
    # Fiscal
    "FiscalService",
    # Scheduling
    "SchedulingService",
    # CRM
    "CRMService",
    # Floor Plan
    "FloorPlanService",
    # Product Customization
    "CustomizationService",
    # Reservations
    "ReservationService",
    # Delivery / Takeout
    "DeliveryService",
    # Receipts / Printing
    "ReceiptService",
    # Manager Overrides
    "OverrideService",
    # Audit
    "AuditService",
    # Waiter-Sector Assignment (bulk atomic ops)
    "AssignmentService",
    # Branch Exclusions (replace-all atomic)
    "ExclusionService",
]
