"""
SQLAlchemy ORM Models Package.

All models are organized into domain-specific modules:
- base: Base class and AuditMixin
- tenant: Tenant, Branch
- user: User, UserBranchRole
- catalog: Category, Subcategory, Product, BranchProduct
- allergen: Allergen, ProductAllergen, AllergenCrossReaction
- ingredient: IngredientGroup, Ingredient, SubIngredient, ProductIngredient
- product_profile: Dietary, cooking, flavor, texture profiles
- sector: BranchSector, WaiterSectorAssignment
- table: Table, TableSession
- customer: Customer, Diner
- order: Round, RoundItem
- kitchen: KitchenTicket, KitchenTicketItem, ServiceCall
- billing: Check, Payment, Charge, Allocation
- knowledge: KnowledgeDocument, ChatLog (RAG)
- promotion: Promotion, PromotionBranch, PromotionItem
- exclusion: BranchCategoryExclusion, BranchSubcategoryExclusion
- audit: AuditLog
- recipe: Recipe, RecipeAllergen
- outbox: OutboxEvent (transactional event publishing)
- reservation: Reservation (table booking)
- delivery: DeliveryOrder, DeliveryOrderItem (takeout/delivery)
- inventory: StockItem, StockMovement, StockAlert, Supplier, PurchaseOrder,
             PurchaseOrderItem, WasteLog, RecipeCost (stock & cost management)
- cash_register: CashRegister, CashSession, CashMovement (cash closing)
- tip: Tip, TipDistribution, TipPool (tip tracking)
- fiscal: FiscalPoint, FiscalInvoice, CreditNote (AFIP electronic invoicing)
- scheduling: Shift, ShiftTemplate, ShiftTemplateItem, AttendanceLog (employee shifts)
- crm: CustomerProfile, CustomerVisit, LoyaltyTransaction, LoyaltyRule (CRM & loyalty)
- floor_plan: FloorPlan, FloorPlanTable (visual table layout)
- product_customization: CustomizationOption, ProductCustomizationLink (product modifiers)
- manager_override: ManagerOverride (manager-approved voids, discounts, adjustments)
"""

# Base classes
from .base import Base, AuditMixin

# Core tenant models
from .tenant import Tenant, Branch

# User and roles
from .user import User, UserBranchRole

# 2FA backup codes (S1.4)
from .backup_code import BackupCode2FA

# Catalog (menu structure)
from .catalog import Category, Subcategory, Product, BranchProduct

# Allergens
from .allergen import Allergen, ProductAllergen, AllergenCrossReaction

# Ingredients
from .ingredient import IngredientGroup, Ingredient, SubIngredient, ProductIngredient

# Product profiles (dietary, cooking, flavor, texture)
from .product_profile import (
    ProductDietaryProfile,
    CookingMethod,
    FlavorProfile,
    TextureProfile,
    CuisineType,
    ProductCookingMethod,
    ProductFlavor,
    ProductTexture,
    ProductCooking,
    ProductModification,
    ProductWarning,
    ProductRAGConfig,
)

# Branch sectors and waiter assignments
from .sector import BranchSector, WaiterSectorAssignment

# Tables and sessions
from .table import Table, TableSession

# Customers and diners
from .customer import Customer, Diner

# Cart (real-time shared cart)
from .cart import CartItem

# Orders (rounds)
from .order import Round, RoundItem

# Kitchen
from .kitchen import KitchenTicket, KitchenTicketItem, ServiceCall

# Billing
from .billing import Check, Payment, Charge, Allocation

# RAG knowledge base
from .knowledge import KnowledgeDocument, ChatLog

# Promotions
from .promotion import Promotion, PromotionBranch, PromotionItem

# Branch exclusions
from .exclusion import BranchCategoryExclusion, BranchSubcategoryExclusion

# Audit log
from .audit import AuditLog

# Recipes
from .recipe import Recipe, RecipeAllergen

# Outbox (transactional event publishing)
from .outbox import OutboxEvent, OutboxStatus

# Reservations (table booking)
from .reservation import Reservation

# Delivery and takeout orders
from .delivery import DeliveryOrder, DeliveryOrderItem

# Inventory and cost management
from .inventory import (
    StockItem,
    StockMovement,
    StockAlert,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    WasteLog,
    RecipeCost,
)

# Cash register and closing
from .cash_register import CashRegister, CashSession, CashMovement

# Tips
from .tip import Tip, TipDistribution, TipPool

# Fiscal (AFIP electronic invoicing)
from .fiscal import FiscalPoint, FiscalInvoice, CreditNote

# Scheduling (shifts, attendance)
from .scheduling import Shift, ShiftTemplate, ShiftTemplateItem, AttendanceLog

# CRM (customer profiles, loyalty)
from .crm import CustomerProfile, CustomerVisit, LoyaltyTransaction, LoyaltyRule

# Floor plans (visual table layout)
from .floor_plan import FloorPlan, FloorPlanTable

# Product customization options (modifiers like "sin cebolla", "extra queso")
from .product_customization import CustomizationOption, ProductCustomizationLink

# Manager overrides (voids, discounts, adjustments)
from .manager_override import ManagerOverride

# Customer feedback
from .feedback import Feedback

__all__ = [
    # Base
    "Base",
    "AuditMixin",
    # Tenant
    "Tenant",
    "Branch",
    # User
    "User",
    "UserBranchRole",
    # 2FA
    "BackupCode2FA",
    # Catalog
    "Category",
    "Subcategory",
    "Product",
    "BranchProduct",
    # Allergen
    "Allergen",
    "ProductAllergen",
    "AllergenCrossReaction",
    # Ingredient
    "IngredientGroup",
    "Ingredient",
    "SubIngredient",
    "ProductIngredient",
    # Product profiles
    "ProductDietaryProfile",
    "CookingMethod",
    "FlavorProfile",
    "TextureProfile",
    "CuisineType",
    "ProductCookingMethod",
    "ProductFlavor",
    "ProductTexture",
    "ProductCooking",
    "ProductModification",
    "ProductWarning",
    "ProductRAGConfig",
    # Sector
    "BranchSector",
    "WaiterSectorAssignment",
    # Table
    "Table",
    "TableSession",
    # Customer
    "Customer",
    "Diner",
    # Cart
    "CartItem",
    # Order
    "Round",
    "RoundItem",
    # Kitchen
    "KitchenTicket",
    "KitchenTicketItem",
    "ServiceCall",
    # Billing
    "Check",
    "Payment",
    "Charge",
    "Allocation",
    # Knowledge
    "KnowledgeDocument",
    "ChatLog",
    # Promotion
    "Promotion",
    "PromotionBranch",
    "PromotionItem",
    # Exclusion
    "BranchCategoryExclusion",
    "BranchSubcategoryExclusion",
    # Audit
    "AuditLog",
    # Recipe
    "Recipe",
    "RecipeAllergen",
    # Outbox
    "OutboxEvent",
    "OutboxStatus",
    # Reservation
    "Reservation",
    # Delivery
    "DeliveryOrder",
    "DeliveryOrderItem",
    # Inventory
    "StockItem",
    "StockMovement",
    "StockAlert",
    "Supplier",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "WasteLog",
    "RecipeCost",
    # Cash Register
    "CashRegister",
    "CashSession",
    "CashMovement",
    # Tips
    "Tip",
    "TipDistribution",
    "TipPool",
    # Fiscal
    "FiscalPoint",
    "FiscalInvoice",
    "CreditNote",
    # Scheduling
    "Shift",
    "ShiftTemplate",
    "ShiftTemplateItem",
    "AttendanceLog",
    # CRM
    "CustomerProfile",
    "CustomerVisit",
    "LoyaltyTransaction",
    "LoyaltyRule",
    # Floor Plan
    "FloorPlan",
    "FloorPlanTable",
    # Product Customization
    "CustomizationOption",
    "ProductCustomizationLink",
    # Manager Override
    "ManagerOverride",
    # Feedback
    "Feedback",
]
