"""
Admin API router - combines all admin sub-routers.

This module provides a single router that includes all admin endpoints
organized by domain:

- tenant: Restaurant/tenant info and settings
- branches: Branch CRUD operations
- categories: Category CRUD operations
- subcategories: Subcategory CRUD operations
- products: Product CRUD with canonical model (Phases 0-4)
- allergens: Allergen CRUD with cross-reactions
- staff: Staff management with branch access control
- tables: Table CRUD with batch creation
- sectors: Sector management
- orders: Active orders and stats
- exclusions: Branch category/subcategory exclusions
- assignments: Daily waiter-sector assignments
- reports: Sales analytics and statistics
- cash_register: Cash session lifecycle (open, movements, close)
- tips: Tip recording, distribution, pools, reporting
- fiscal: AFIP electronic invoicing (facturas, notas de crédito)
- scheduling: Employee shifts, templates, attendance, labor cost
- crm: Customer profiles, loyalty points, visit history, reports
- floor_plan: Floor plan CRUD, table positioning, live view, auto-generation
- customizations: Product customization options (modifiers like "sin cebolla", "extra queso")
- reservations: Table reservation CRUD with status FSM
- delivery: Delivery and takeout order management
- receipts: Kitchen tickets, customer receipts, daily closing reports (HTML for printing)
- overrides: Manager override operations (voids, discounts, adjustments)
- data_export: GDPR compliance (customer data export, anonymization, audit log)
- audit: Audit log viewing
- restore: Entity restoration

All routes are prefixed with /api/admin
"""

from fastapi import APIRouter

from .tenant import router as tenant_router
from .branches import router as branches_router
from .categories import router as categories_router
from .subcategories import router as subcategories_router
from .products import router as products_router
from .allergens import router as allergens_router
from .staff import router as staff_router
from .tables import router as tables_router
from .sectors import router as sectors_router
from .orders import router as orders_router
from .exclusions import router as exclusions_router
from .assignments import router as assignments_router
from .reports import router as reports_router
from .audit import router as audit_router
from .restore import router as restore_router
from .inventory import router as inventory_router
from .cash_register import router as cash_register_router
from .tips import router as tips_router
from .fiscal import router as fiscal_router
from .scheduling import router as scheduling_router
from .crm import router as crm_router
from .floor_plan import router as floor_plan_router
from .customizations import router as customizations_router
from .reservations import router as reservations_router
from .delivery import router as delivery_router
from .receipts import router as receipts_router
from .overrides import router as overrides_router
from .data_export import router as data_export_router


# Create the main admin router with /api/admin prefix
router = APIRouter(prefix="/api/admin", tags=["admin"])

# Include all sub-routers
# Note: Order matters for route matching - more specific routes first

# Core entity management
router.include_router(tenant_router)
router.include_router(branches_router)
router.include_router(categories_router)
router.include_router(subcategories_router)
router.include_router(products_router)
router.include_router(allergens_router)

# Staff and resource management
router.include_router(staff_router)
router.include_router(tables_router)
router.include_router(sectors_router)

# Operations and orders
router.include_router(orders_router)

# Branch configuration
router.include_router(exclusions_router)
router.include_router(assignments_router)

# Analytics and reporting
router.include_router(reports_router)

# Inventory and cost management
router.include_router(inventory_router)

# Cash register and tips
router.include_router(cash_register_router)
router.include_router(tips_router)

# Fiscal and scheduling
router.include_router(fiscal_router)
router.include_router(scheduling_router)

# CRM and floor plans
router.include_router(crm_router)
router.include_router(floor_plan_router)

# Product customizations
router.include_router(customizations_router)

# Reservations
router.include_router(reservations_router)

# Delivery / Takeout
router.include_router(delivery_router)

# Receipts and printing
router.include_router(receipts_router)

# Manager overrides (voids, discounts)
router.include_router(overrides_router)

# GDPR / Data export
router.include_router(data_export_router)

# Audit and restore (generic endpoints)
router.include_router(audit_router)
router.include_router(restore_router)


__all__ = ["router"]
