"""
Shared Pydantic schemas used across the application.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, EmailStr


# =============================================================================
# Common Types
# =============================================================================

Role = Literal["WAITER", "KITCHEN", "MANAGER", "ADMIN"]
TableStatus = Literal["FREE", "ACTIVE", "PAYING", "OUT_OF_SERVICE"]
SessionStatus = Literal["OPEN", "PAYING", "CLOSED"]
# Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
RoundStatus = Literal["PENDING", "CONFIRMED", "DRAFT", "SUBMITTED", "IN_KITCHEN", "READY", "SERVED", "CANCELED"]
CheckStatus = Literal["OPEN", "REQUESTED", "IN_PAYMENT", "PAID", "FAILED"]
PaymentProvider = Literal["CASH", "MERCADO_PAGO"]
PaymentStatus = Literal["PENDING", "APPROVED", "REJECTED"]
ServiceCallType = Literal["WAITER_CALL", "PAYMENT_HELP", "OTHER"]
ServiceCallStatus = Literal["OPEN", "ACKED", "CLOSED"]


# =============================================================================
# Authentication Schemas
# =============================================================================


class LoginRequest(BaseModel):
    """Login request body."""

    email: EmailStr
    password: str
    totp_code: str | None = None  # Optional 2FA code
    # S1.4: alternative to totp_code for users that lost their authenticator.
    # Single-use; consumed on successful login.
    backup_code: str | None = Field(default=None, max_length=32)


class LoginResponse(BaseModel):
    """Login response with JWT token."""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int  # seconds
    user: "UserInfo"


class UserInfo(BaseModel):
    """Basic user information included in auth responses."""

    id: int
    email: str
    tenant_id: int
    branch_ids: list[int]
    roles: list[str]


class RefreshTokenRequest(BaseModel):
    """Refresh token request body."""

    refresh_token: str


# =============================================================================
# Diner Schemas (Phase 2)
# =============================================================================


class RegisterDinerRequest(BaseModel):
    """Request to register a diner at a table session."""

    name: str = Field(min_length=1, max_length=50)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")  # Hex color
    local_id: str | None = Field(default=None, max_length=50)  # Frontend UUID
    # FASE 1: Device tracking for cross-session recognition
    device_id: str | None = Field(default=None, max_length=100)  # Persistent device UUID
    device_fingerprint: str | None = Field(default=None, max_length=64)  # Browser fingerprint hash


class DinerOutput(BaseModel):
    """Output for a registered diner."""

    id: int
    session_id: int
    name: str
    color: str
    local_id: str | None = None
    joined_at: datetime
    # FASE 1: Device tracking for cross-session recognition
    device_id: str | None = None


# =============================================================================
# Table and Session Schemas
# =============================================================================


class TableCard(BaseModel):
    """Summary of a table for waiter dashboard."""

    table_id: int
    code: str
    status: TableStatus
    session_id: int | None = None
    open_rounds: int = 0
    pending_calls: int = 0
    check_status: CheckStatus | None = None
    active_service_call_ids: list[int] = []  # IDs of OPEN service calls for resolution
    # Sector info for grouping tables by section
    sector_id: int | None = None
    sector_name: str | None = None
    # Waiter who confirmed the order (last name for display)
    confirmed_by_name: str | None = None


class TableSessionResponse(BaseModel):
    """Response when creating or joining a table session."""

    session_id: int
    table_id: int
    table_code: str
    table_token: str
    status: SessionStatus


# =============================================================================
# Round Schemas
# =============================================================================


class RoundItemInput(BaseModel):
    """Input for a single item in a round."""

    product_id: int
    qty: int = Field(ge=1, le=99)
    notes: str | None = Field(default=None, max_length=200)


class SubmitRoundRequest(BaseModel):
    """Request to submit a new round of orders."""

    items: list[RoundItemInput] = Field(min_length=1)


class SubmitRoundResponse(BaseModel):
    """Response after submitting a round."""

    session_id: int
    round_id: int
    round_number: int
    status: RoundStatus


class RoundItemOutput(BaseModel):
    """Output for a single item in a round."""

    id: int
    product_id: int
    product_name: str
    qty: int
    unit_price_cents: int
    notes: str | None = None


class RoundOutput(BaseModel):
    """Output for a round with its items."""

    id: int
    round_number: int
    status: RoundStatus
    items: list[RoundItemOutput]
    created_at: datetime
    table_id: int | None = None
    table_code: str | None = None
    submitted_at: datetime | None = None


class UpdateRoundStatusRequest(BaseModel):
    """Request to update round status (kitchen/waiter).

    Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
    """

    status: Literal["CONFIRMED", "SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]


# =============================================================================
# Waiter Detail Schemas
# =============================================================================


class RoundItemDetail(BaseModel):
    """Detailed item output including diner info for waiter view."""

    id: int
    product_id: int
    product_name: str
    category_name: str | None = None
    qty: int
    unit_price_cents: int
    notes: str | None = None
    diner_id: int | None = None
    diner_name: str | None = None
    diner_color: str | None = None


class RoundDetail(BaseModel):
    """Detailed round output for waiter view."""

    id: int
    round_number: int
    status: RoundStatus
    created_at: datetime
    submitted_at: datetime | None = None
    items: list[RoundItemDetail]


class TableSessionDetail(BaseModel):
    """Detailed table session for waiter view with rounds and diners."""

    session_id: int
    table_id: int
    table_code: str
    status: SessionStatus
    opened_at: datetime
    diners: list[DinerOutput]
    rounds: list[RoundDetail]
    check_status: CheckStatus | None = None
    total_cents: int = 0
    paid_cents: int = 0


# =============================================================================
# Service Call Schemas
# =============================================================================


class CreateServiceCallRequest(BaseModel):
    """Request to create a service call."""

    type: ServiceCallType = "WAITER_CALL"


class ServiceCallOutput(BaseModel):
    """Output for a service call."""

    id: int
    type: ServiceCallType
    status: ServiceCallStatus
    created_at: datetime
    acked_at: datetime | None = None
    acked_by_user_id: int | None = None
    table_id: int | None = None
    table_code: str | None = None
    session_id: int | None = None


# =============================================================================
# Billing Schemas
# =============================================================================


class RequestCheckResponse(BaseModel):
    """Response after requesting a check."""

    check_id: int
    total_cents: int
    paid_cents: int
    status: CheckStatus


class CashPaymentRequest(BaseModel):
    """Request to record a cash payment."""

    check_id: int
    amount_cents: int = Field(gt=0)
    diner_id: int | None = Field(default=None, description="Optional diner ID for per-diner payment tracking")


class PaymentResponse(BaseModel):
    """Response after recording a payment."""

    payment_id: int
    check_id: int
    amount_cents: int
    provider: PaymentProvider
    status: PaymentStatus
    check_status: CheckStatus
    check_paid_cents: int
    check_total_cents: int


class ClearTableRequest(BaseModel):
    """Request to clear/liberate a table."""

    pass  # Table ID comes from path


class ClearTableResponse(BaseModel):
    """Response after clearing a table."""

    table_id: int
    status: TableStatus


class CheckItemOutput(BaseModel):
    """Single item in a check detail."""

    product_name: str
    qty: int
    unit_price_cents: int
    subtotal_cents: int
    notes: str | None = None
    round_number: int


class PaymentOutput(BaseModel):
    """Payment information."""

    id: int
    provider: PaymentProvider
    status: PaymentStatus
    amount_cents: int
    created_at: datetime


class CheckDetailOutput(BaseModel):
    """Full check detail with items and payments."""

    id: int
    status: CheckStatus
    total_cents: int
    paid_cents: int
    remaining_cents: int
    items: list[CheckItemOutput]
    payments: list[PaymentOutput]
    created_at: datetime
    table_code: str | None = None


class MercadoPagoPreferenceRequest(BaseModel):
    """Request to create a Mercado Pago preference."""

    check_id: int


class MercadoPagoPreferenceResponse(BaseModel):
    """Response with Mercado Pago checkout URL."""

    preference_id: str
    init_point: str
    sandbox_init_point: str


# =============================================================================
# Catalog Schemas (Public API)
# =============================================================================


class ProductAllergensOutput(BaseModel):
    """Allergens grouped by presence type for filtering."""

    contains: list["AllergenInfoOutput"] = Field(default_factory=list)
    may_contain: list["AllergenInfoOutput"] = Field(default_factory=list)
    free_from: list["AllergenInfoOutput"] = Field(default_factory=list)


class ProductDietaryOutput(BaseModel):
    """Dietary profile for filtering."""

    is_vegetarian: bool = False
    is_vegan: bool = False
    is_gluten_free: bool = False
    is_dairy_free: bool = False
    is_celiac_safe: bool = False
    is_keto: bool = False
    is_low_sodium: bool = False


class ProductCookingOutput(BaseModel):
    """Cooking information for filtering."""

    methods: list[str] = Field(default_factory=list)
    uses_oil: bool = False
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None


class ProductOutput(BaseModel):
    """Product information for public menu."""

    id: int
    name: str
    description: str | None
    price_cents: int
    image: str | None = None
    category_id: int
    subcategory_id: int | None = None
    featured: bool = False
    popular: bool = False
    badge: str | None = None
    seal: str | None = None
    allergen_ids: list[int] = Field(default_factory=list)
    is_available: bool = True
    # Canonical model fields (producto3.md) - optional for backward compatibility
    allergens: ProductAllergensOutput | None = None
    dietary: ProductDietaryOutput | None = None
    cooking: ProductCookingOutput | None = None


# =============================================================================
# Product Complete View Schemas (Phase 5 - Canonical Model)
# =============================================================================


class AllergenInfoOutput(BaseModel):
    """Allergen information with presence type."""

    id: int
    name: str
    icon: str | None = None


class CrossReactionPublicOutput(BaseModel):
    """Cross-reaction information for public API."""

    id: int
    cross_reacts_with_id: int
    cross_reacts_with_name: str
    probability: str  # "high", "medium", "low"
    notes: str | None = None


class AllergenPublicOutput(BaseModel):
    """Allergen with cross-reactions for public API (pwaMenu filters)."""

    id: int
    name: str
    icon: str | None = None
    description: str | None = None
    is_mandatory: bool = False
    severity: str = "moderate"
    cross_reactions: list[CrossReactionPublicOutput] = Field(default_factory=list)


class AllergensOutput(BaseModel):
    """Allergens grouped by presence type."""

    contains: list[AllergenInfoOutput] = Field(default_factory=list)
    may_contain: list[AllergenInfoOutput] = Field(default_factory=list)
    free_from: list[AllergenInfoOutput] = Field(default_factory=list)


class DietaryProfileOutput(BaseModel):
    """Dietary profile flags."""

    is_vegetarian: bool = False
    is_vegan: bool = False
    is_gluten_free: bool = False
    is_dairy_free: bool = False
    is_celiac_safe: bool = False
    is_keto: bool = False
    is_low_sodium: bool = False


class SubIngredientOutput(BaseModel):
    """Sub-ingredient of a processed ingredient."""

    id: int
    name: str


class IngredientOutput(BaseModel):
    """Ingredient with sub-ingredients."""

    id: int
    name: str
    group_name: str | None = None
    is_processed: bool = False
    is_main: bool = False
    notes: str | None = None
    sub_ingredients: list[SubIngredientOutput] = Field(default_factory=list)


class CookingOutput(BaseModel):
    """Cooking information."""

    methods: list[str] = Field(default_factory=list)
    uses_oil: bool = False
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None


class SensoryOutput(BaseModel):
    """Sensory profile (flavors and textures)."""

    flavors: list[str] = Field(default_factory=list)
    textures: list[str] = Field(default_factory=list)


class ModificationOutput(BaseModel):
    """Allowed product modification."""

    id: int
    action: str  # "remove" or "substitute"
    item: str
    is_allowed: bool = True
    extra_cost_cents: int = 0


class WarningOutput(BaseModel):
    """Product warning."""

    id: int
    text: str
    severity: str = "info"  # "info", "warning", "danger"


class ProductCompleteOutput(BaseModel):
    """
    Complete product view with all canonical model data.

    Phase 5: Used by pwaMenu for detailed product view and
    includes all nutritional, dietary, and allergen information.
    """

    id: int
    name: str
    description: str | None = None
    price_cents: int
    image: str | None = None
    category_id: int
    subcategory_id: int | None = None
    featured: bool = False
    popular: bool = False
    badge: str | None = None
    is_available: bool = True
    # Canonical model data
    allergens: AllergensOutput
    dietary: DietaryProfileOutput
    ingredients: list[IngredientOutput] = Field(default_factory=list)
    cooking: CookingOutput
    sensory: SensoryOutput
    modifications: list[ModificationOutput] = Field(default_factory=list)
    warnings: list[WarningOutput] = Field(default_factory=list)


class SubcategoryOutput(BaseModel):
    """Subcategory information."""

    id: int
    name: str
    image: str | None = None
    order: int


class CategoryOutput(BaseModel):
    """Category with subcategories and products."""

    id: int
    name: str
    icon: str | None = None
    image: str | None = None
    order: int
    subcategories: list[SubcategoryOutput] = Field(default_factory=list)
    products: list[ProductOutput] = Field(default_factory=list)


class MenuOutput(BaseModel):
    """Complete menu for a branch."""

    branch_id: int
    branch_name: str
    branch_slug: str
    categories: list[CategoryOutput]


# =============================================================================
# Waiter-Managed Table Flow Schemas (HU-WAITER-MESA)
# =============================================================================


# Types for waiter-managed flow
SessionOpenedBy = Literal["DINER", "WAITER"]
RoundSubmittedBy = Literal["DINER", "WAITER"]
PaymentRegisteredBy = Literal["SYSTEM", "DINER", "WAITER"]
PaymentCategory = Literal["DIGITAL", "MANUAL"]
ManualPaymentMethod = Literal["CASH", "CARD_PHYSICAL", "TRANSFER_EXTERNAL", "OTHER_MANUAL"]


class WaiterActivateTableRequest(BaseModel):
    """Request for waiter to activate a table manually."""

    diner_count: int = Field(ge=1, le=20, description="Number of diners at the table")
    notes: str | None = Field(default=None, max_length=200, description="Optional notes about the table")


class WaiterActivateTableResponse(BaseModel):
    """Response after waiter activates a table."""

    session_id: int
    table_id: int
    table_code: str
    status: SessionStatus
    opened_at: datetime
    opened_by: SessionOpenedBy
    opened_by_waiter_id: int
    diner_count: int


class WaiterRoundItemInput(BaseModel):
    """Input for a single item in a waiter-submitted round."""

    product_id: int
    qty: int = Field(ge=1, le=99)
    notes: str | None = Field(default=None, max_length=200)
    # Optional: which diner ordered this item (for split billing)
    diner_index: int | None = Field(default=None, ge=0, description="Index of diner (0-based) for this item")


class WaiterSubmitRoundRequest(BaseModel):
    """Request for waiter to submit a round of orders."""

    items: list[WaiterRoundItemInput] = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=500, description="General round notes")


class WaiterSubmitRoundResponse(BaseModel):
    """Response after waiter submits a round."""

    session_id: int
    round_id: int
    round_number: int
    status: RoundStatus
    submitted_by: RoundSubmittedBy
    submitted_by_waiter_id: int
    items_count: int
    total_cents: int


class WaiterRequestCheckRequest(BaseModel):
    """Request for waiter to request the check for a session."""

    notes: str | None = Field(default=None, max_length=200)


class WaiterRequestCheckResponse(BaseModel):
    """Response after waiter requests the check."""

    check_id: int
    session_id: int
    total_cents: int
    paid_cents: int
    status: CheckStatus
    items_count: int


class ManualPaymentRequest(BaseModel):
    """
    Request to register a manual payment by waiter.

    CRITICAL: This flow does NOT use Mercado Pago or any digital payment provider.
    The waiter physically receives the payment and registers it in the system.
    """

    check_id: int
    amount_cents: int = Field(gt=0, description="Payment amount in cents")
    manual_method: ManualPaymentMethod = Field(description="Payment method: CASH, CARD_PHYSICAL, TRANSFER_EXTERNAL, OTHER_MANUAL")
    notes: str | None = Field(default=None, max_length=500, description="Optional payment notes")


class ManualPaymentResponse(BaseModel):
    """Response after registering a manual payment."""

    payment_id: int
    check_id: int
    amount_cents: int
    manual_method: ManualPaymentMethod
    status: PaymentStatus
    payment_category: PaymentCategory
    registered_by: PaymentRegisteredBy
    registered_by_waiter_id: int
    # Updated check info
    check_status: CheckStatus
    check_total_cents: int
    check_paid_cents: int
    check_remaining_cents: int


class WaiterCloseTableRequest(BaseModel):
    """Request for waiter to close a table after full payment."""

    force: bool = Field(default=False, description="Force close even if check is not fully paid (ADMIN only)")


class WaiterCloseTableResponse(BaseModel):
    """Response after waiter closes a table."""

    table_id: int
    table_code: str
    table_status: TableStatus
    session_id: int
    session_status: SessionStatus
    total_cents: int
    paid_cents: int
    closed_at: datetime


class WaiterSessionSummaryOutput(BaseModel):
    """Summary of a session for waiter view with traceability info."""

    session_id: int
    table_id: int
    table_code: str
    status: SessionStatus
    opened_at: datetime
    opened_by: SessionOpenedBy
    opened_by_waiter_id: int | None = None
    assigned_waiter_id: int | None = None
    diner_count: int
    rounds_count: int
    total_cents: int
    paid_cents: int
    check_status: CheckStatus | None = None
    # Hybrid flow indicator: True if session has both waiter and diner-submitted rounds
    is_hybrid: bool = False


# =============================================================================
# Device History Schemas (FASE 1: Fidelización)
# =============================================================================


class DeviceVisitOutput(BaseModel):
    """Output for a single visit by a device."""

    session_id: int
    diner_id: int
    diner_name: str
    branch_id: int
    branch_name: str | None = None
    visited_at: datetime
    total_spent_cents: int = 0
    items_ordered: int = 0


class DeviceHistoryOutput(BaseModel):
    """
    Output for device visit history.

    FASE 1: Device tracking for cross-session recognition.
    Returns all visits associated with a device_id for a specific tenant.
    """

    device_id: str
    total_visits: int
    total_spent_cents: int
    first_visit: datetime | None = None
    last_visit: datetime | None = None
    visits: list[DeviceVisitOutput] = []


# =============================================================================
# Implicit Preferences Schemas (FASE 2: Fidelización)
# =============================================================================


class ImplicitPreferencesData(BaseModel):
    """Implicit preferences detected during session usage."""

    excluded_allergen_ids: list[int] = Field(default_factory=list)
    dietary_preferences: list[str] = Field(default_factory=list)  # ["vegan", "gluten_free"]
    excluded_cooking_methods: list[str] = Field(default_factory=list)  # ["frito"]
    cross_reactions_enabled: bool = False
    strictness: str = "strict"  # "strict" or "very_strict"


class UpdatePreferencesRequest(BaseModel):
    """Request to update diner's implicit preferences."""

    implicit_preferences: ImplicitPreferencesData


class UpdatePreferencesResponse(BaseModel):
    """Response after updating preferences."""

    diner_id: int
    device_id: str | None
    implicit_preferences: ImplicitPreferencesData
    updated_at: datetime


class DevicePreferencesOutput(BaseModel):
    """
    Aggregated preferences for a device across all visits.

    Returns the most recent preferences set by this device,
    allowing pre-filling filters on return visits.
    """

    device_id: str
    has_preferences: bool = False
    implicit_preferences: ImplicitPreferencesData | None = None
    last_updated: datetime | None = None
    visit_count: int = 0


# =============================================================================
# Customer Schemas (FASE 4: Fidelización)
# =============================================================================


class CustomerRegisterRequest(BaseModel):
    """
    Request to create a customer with opt-in consent.

    All identification fields are optional - customer can be
    created with only device_id for anonymous tracking.

    QA-CRIT-01 FIX: Added birthday fields and data_consent alias for frontend compatibility.
    """

    # Optional identification
    name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=100)

    # QA-CRIT-01 FIX: Birthday for personalized greetings (optional)
    birthday_month: int | None = Field(default=None, ge=1, le=12)
    birthday_day: int | None = Field(default=None, ge=1, le=31)

    # Required device link (to merge history)
    device_id: str = Field(min_length=1, max_length=100)

    # Preferences to save
    excluded_allergen_ids: list[int] = Field(default_factory=list)
    dietary_preferences: list[str] = Field(default_factory=list)
    excluded_cooking_methods: list[str] = Field(default_factory=list)

    # GDPR consent
    # QA-CRIT-01 FIX: data_consent is alias for consent_remember (frontend uses data_consent)
    consent_remember: bool = Field(default=True, alias="data_consent")
    # QA-CRIT-05 FIX: marketing_consent is alias for consent_marketing (frontend uses marketing_consent)
    consent_marketing: bool = Field(default=False, alias="marketing_consent")
    # QA-CRIT-01 FIX: AI personalization opt-in
    ai_personalization_enabled: bool = Field(default=True)

    model_config = {"populate_by_name": True}  # Allow both field name and alias


class CustomerOutput(BaseModel):
    """Output for a registered customer."""

    id: int
    tenant_id: int
    name: str | None = None
    phone: str | None = None
    email: str | None = None

    # Metrics
    first_visit_at: datetime
    last_visit_at: datetime
    total_visits: int
    total_spent_cents: int
    avg_ticket_cents: int

    # Preferences
    excluded_allergen_ids: list[int] = Field(default_factory=list)
    dietary_preferences: list[str] = Field(default_factory=list)
    excluded_cooking_methods: list[str] = Field(default_factory=list)
    favorite_product_ids: list[int] = Field(default_factory=list)

    # Segmentation
    segment: str | None = None

    # Consent
    consent_remember: bool = True
    consent_marketing: bool = False


class CustomerUpdateRequest(BaseModel):
    """Request to update customer preferences."""

    name: str | None = None
    phone: str | None = None
    email: str | None = None
    excluded_allergen_ids: list[int] | None = None
    dietary_preferences: list[str] | None = None
    excluded_cooking_methods: list[str] | None = None
    consent_marketing: bool | None = None


class CustomerRecognizeResponse(BaseModel):
    """
    Response when checking if a device is linked to a customer.

    Used on app start to determine if user should see personalized greeting.
    """

    recognized: bool = False
    customer_id: int | None = None
    customer_name: str | None = None
    last_visit: datetime | None = None
    visit_count: int = 0
    # Prompt opt-in after 3+ anonymous visits
    should_prompt_optin: bool = False
    anonymous_visit_count: int = 0


class FavoriteProductOutput(BaseModel):
    """Product that customer orders frequently."""

    id: int
    name: str
    image: str | None = None
    times_ordered: int
    last_ordered: datetime | None = None


class CustomerSuggestionsOutput(BaseModel):
    """
    Personalized suggestions for a customer/device.

    Based on order history and preferences.
    """

    device_id: str
    customer_id: int | None = None
    favorites: list[FavoriteProductOutput] = Field(default_factory=list)
    last_ordered: list[FavoriteProductOutput] = Field(default_factory=list)
    # Products similar to favorites but never ordered
    recommendations: list[FavoriteProductOutput] = Field(default_factory=list)


# =============================================================================
# Error Schemas
# =============================================================================


class ErrorResponse(BaseModel):
    """Standard error response."""

    detail: str
    code: str | None = None


# =============================================================================
# S4.4: Response schemas for previously dict-returning endpoints.
#
# These schemas REPLICATE the existing dict[str, Any] returns exactly — they
# add type safety to OpenAPI codegen without changing the response shape.
# Datetime fields use `str` because the endpoints call `.isoformat()` before
# returning (NOT datetime objects).
# =============================================================================


# --- Billing ----------------------------------------------------------------


class BillingCheckPaymentInfo(BaseModel):
    """Payment subobject used by GET /api/billing/check/{check_id}.

    NOTE: NOT the same as `PaymentOutput` — this version exposes provider as
    a free-form string (whatever the DB stores) and created_at as ISO-string.
    """

    id: int
    provider: str
    status: str
    amount_cents: int
    created_at: str


class BillingCheckGetOutput(BaseModel):
    """Response model for GET /api/billing/check/{check_id}.

    Distinct from `CheckDetailOutput` (which is the diner-facing schema used
    by GET /api/diner/check and has a different shape: items, table_code).
    """

    id: int
    session_id: int
    status: str
    total_cents: int
    paid_cents: int
    remaining_cents: int
    created_at: str
    payments: list[BillingCheckPaymentInfo]


# --- Cash Register ----------------------------------------------------------


class CashSessionOpenOutput(BaseModel):
    """Response for POST /api/admin/cash/open."""

    id: int
    cash_register_id: int
    status: str
    opened_at: str
    opening_amount_cents: int


class CashMovementOutput(BaseModel):
    """Response for POST /api/admin/cash/movement."""

    id: int
    movement_type: str
    amount_cents: int
    payment_method: str
    description: str | None = None
    created_at: str | None = None


class CashSessionCloseOutput(BaseModel):
    """Response for POST /api/admin/cash/close."""

    id: int
    status: str
    opened_at: str | None = None
    closed_at: str | None = None
    opening_amount_cents: int
    expected_amount_cents: int | None = None
    actual_amount_cents: int | None = None
    difference_cents: int | None = None
    notes: str | None = None


class CashSessionInfo(BaseModel):
    """Inner session object used by GET /api/admin/cash/current."""

    id: int
    cash_register_id: int
    status: str
    opened_at: str | None = None
    opening_amount_cents: int
    opened_by_id: int | None = None


class CashCurrentSessionOutput(BaseModel):
    """Response for GET /api/admin/cash/current.

    When no session is open, `session` is None. Otherwise contains session info.
    """

    session: CashSessionInfo | None = None


class CashSessionHistoryItem(BaseModel):
    """Item in GET /api/admin/cash/sessions list."""

    id: int
    status: str
    opened_at: str | None = None
    closed_at: str | None = None
    opening_amount_cents: int
    expected_amount_cents: int | None = None
    actual_amount_cents: int | None = None
    difference_cents: int | None = None


# --- Tips -------------------------------------------------------------------


class TipRecordOutput(BaseModel):
    """Response for POST /api/admin/tips."""

    id: int
    amount_cents: int
    payment_method: str
    waiter_id: int | None = None
    created_at: str | None = None


class TipListItemOutput(BaseModel):
    """Item in GET /api/admin/tips list."""

    id: int
    branch_id: int
    amount_cents: int
    payment_method: str
    waiter_id: int | None = None
    table_session_id: int | None = None
    check_id: int | None = None
    created_at: str | None = None


# --- Data Export (GDPR) -----------------------------------------------------


class DataExportMetadata(BaseModel):
    """Metadata block for GDPR customer data export."""

    exported_at: str
    exported_by_user_id: int
    tenant_id: int
    customer_id: int
    format_version: str


class DataExportProfile(BaseModel):
    """Customer profile block for GDPR export."""

    id: int
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    device_id: str | None = None
    dietary_preferences: str | None = None
    allergen_ids: str | None = None
    preferred_language: str | None = None
    notes: str | None = None
    loyalty_points: int | None = None
    loyalty_tier: str | None = None
    total_visits: int | None = None
    total_spent_cents: int | None = None
    last_visit_at: str | None = None
    marketing_consent: bool | None = None
    data_consent: bool | None = None
    consent_date: str | None = None
    is_active: bool | None = None
    created_at: str | None = None


class DataExportVisit(BaseModel):
    """Visit record in GDPR export."""

    id: int
    branch_id: int | None = None
    visit_date: str | None = None
    party_size: int | None = None
    total_spent_cents: int | None = None
    rating: int | None = None
    feedback: str | None = None
    created_at: str | None = None


class DataExportLoyaltyTx(BaseModel):
    """Loyalty transaction in GDPR export."""

    id: int
    transaction_type: str | None = None
    points: int | None = None
    balance_after: int | None = None
    description: str | None = None
    reference_type: str | None = None
    reference_id: int | None = None
    created_at: str | None = None


class CustomerDataExportOutput(BaseModel):
    """Response for GET /api/admin/data-export/customer/{id} (GDPR Article 15)."""

    export_metadata: DataExportMetadata
    profile: DataExportProfile
    visits: list[DataExportVisit]
    loyalty_transactions: list[DataExportLoyaltyTx]


# --- Notifications ----------------------------------------------------------


class PushSubscribeOutput(BaseModel):
    """Response for POST /api/waiter/notifications/subscribe.

    `detail` is only populated on the fail-open Redis error path.
    """

    status: str
    detail: str | None = None


class PushUnsubscribeOutput(BaseModel):
    """Response for DELETE /api/waiter/notifications/unsubscribe."""

    status: str


# =============================================================================
# S4.4 (Round 2): Response schemas for admin/* routers previously returning
# untyped dicts. Each schema mirrors the service-layer dict shape exactly to
# avoid breaking existing tests. Datetime fields use `str` because services
# call `.isoformat()` before returning (NOT datetime objects).
# =============================================================================


# --- CRM (admin/crm.py) -----------------------------------------------------


class CustomerProfileOutput(BaseModel):
    """Customer profile dict produced by CRMService._profile_to_dict."""

    id: int
    tenant_id: int
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    device_id: str | None = None
    customer_id: int | None = None
    dietary_preferences: str | None = None
    allergen_ids: str | None = None
    preferred_language: str | None = None
    notes: str | None = None
    loyalty_points: int
    loyalty_tier: str
    total_visits: int
    total_spent_cents: int
    last_visit_at: str | None = None
    marketing_consent: bool | None = None
    data_consent: bool | None = None
    consent_date: str | None = None
    is_active: bool
    created_at: str | None = None


class CustomerVisitDictOutput(BaseModel):
    """Customer visit dict produced by CRMService._visit_to_dict."""

    id: int
    tenant_id: int
    branch_id: int | None = None
    customer_profile_id: int
    table_session_id: int | None = None
    visit_date: str
    party_size: int | None = None
    total_spent_cents: int
    rating: int | None = None
    feedback: str | None = None
    is_active: bool
    created_at: str | None = None


class LoyaltyTransactionOutput(BaseModel):
    """Loyalty transaction dict produced by CRMService._transaction_to_dict."""

    id: int
    tenant_id: int
    customer_profile_id: int
    transaction_type: str
    points: int
    balance_after: int
    description: str | None = None
    reference_type: str | None = None
    reference_id: int | None = None
    created_at: str | None = None


class LoyaltyRuleOutput(BaseModel):
    """Loyalty rule dict produced by CRMService._rule_to_dict."""

    id: int
    tenant_id: int
    name: str
    rule_type: str
    points_per_unit: int
    unit_amount_cents: int | None = None
    min_spend_cents: int | None = None
    silver_threshold: int
    gold_threshold: int
    platinum_threshold: int
    is_active: bool
    created_at: str | None = None


class CustomerHistoryStats(BaseModel):
    total_visits: int
    total_spent_cents: int
    average_spend_cents: int


class CustomerHistoryOutput(BaseModel):
    """Response for GET /api/admin/customers/{id}/history."""

    profile: CustomerProfileOutput
    visits: list[CustomerVisitDictOutput]
    stats: CustomerHistoryStats


class PointsAdjustmentOutput(BaseModel):
    """Response for POST /api/admin/customers/{id}/points."""

    points_adjusted: int
    new_balance: int


class LoyaltyReportOutput(BaseModel):
    """Response for GET /api/admin/loyalty/report."""

    total_customers: int
    tier_distribution: dict[str, int]
    total_points_in_circulation: int
    average_spend_cents: int


# --- Scheduling (admin/scheduling.py) ---------------------------------------


class ShiftOutput(BaseModel):
    """Shift dict produced by SchedulingService._shift_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    user_id: int
    shift_date: str
    start_time: str
    end_time: str
    role: str
    notes: str | None = None
    status: str
    is_active: bool
    created_at: str | None = None


class ShiftTemplateItemOutput(BaseModel):
    """Inline item inside a ShiftTemplate."""

    id: int
    day_of_week: int
    start_time: str
    end_time: str
    role: str
    min_staff: int


class ShiftTemplateOutput(BaseModel):
    """ShiftTemplate dict produced by SchedulingService._template_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    name: str
    items: list[ShiftTemplateItemOutput]
    is_active: bool
    created_at: str | None = None


class AttendanceLogOutput(BaseModel):
    """AttendanceLog dict produced by SchedulingService._attendance_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    user_id: int
    shift_id: int | None = None
    clock_in: str | None = None
    clock_out: str | None = None
    hours_worked: float | None = None
    overtime_hours: float | None = None
    status: str
    notes: str | None = None
    is_active: bool
    created_at: str | None = None


class WeeklyScheduleOutput(BaseModel):
    """Response for GET /api/admin/scheduling/weekly."""

    branch_id: int
    week_start: str
    week_end: str
    schedule: dict[str, list[ShiftOutput]]
    total_shifts: int


class LaborCostShiftByRole(BaseModel):
    role: str
    shift_count: int


class LaborCostAttendance(BaseModel):
    total_hours: float
    total_overtime_hours: float
    total_records: int


class LaborCostReportOutput(BaseModel):
    """Response for GET /api/admin/scheduling/labor-cost."""

    branch_id: int
    date_from: str
    date_to: str
    shifts_by_role: list[LaborCostShiftByRole]
    attendance: LaborCostAttendance


# --- Fiscal (admin/fiscal.py) -----------------------------------------------


class FiscalPointOutput(BaseModel):
    """FiscalPoint dict produced by FiscalService._point_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    point_number: int
    type: str
    status: str
    last_invoice_number: int | None = None
    cuit: str
    business_name: str
    iva_condition: str
    is_active: bool
    created_at: str | None = None


class FiscalInvoiceOutput(BaseModel):
    """FiscalInvoice dict produced by FiscalService._invoice_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    fiscal_point_id: int
    check_id: int | None = None
    invoice_type: str
    invoice_number: int | None = None
    cae: str | None = None
    cae_expiry: str | None = None
    issue_date: str | None = None
    customer_doc_type: str | None = None
    customer_doc_number: str | None = None
    customer_name: str | None = None
    net_amount_cents: int
    iva_amount_cents: int
    total_cents: int
    iva_rate: float | None = None
    afip_result: str | None = None
    afip_observations: str | None = None
    status: str
    is_active: bool
    created_at: str | None = None


class FiscalCreditNoteOutput(BaseModel):
    """CreditNote dict produced by FiscalService._credit_note_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    fiscal_point_id: int
    original_invoice_id: int
    note_type: str
    note_number: int | None = None
    cae: str | None = None
    cae_expiry: str | None = None
    amount_cents: int
    reason: str | None = None
    status: str
    is_active: bool
    created_at: str | None = None


class FiscalMonthlyInvoiceSummary(BaseModel):
    invoice_type: str
    count: int
    net_amount_cents: int
    iva_amount_cents: int
    total_cents: int


class FiscalMonthlyCreditNoteSummary(BaseModel):
    note_type: str
    count: int
    total_cents: int


class FiscalMonthlyTotals(BaseModel):
    net_amount_cents: int
    iva_amount_cents: int
    total_cents: int
    credit_notes_cents: int
    net_fiscal_cents: int


class FiscalMonthlyReportOutput(BaseModel):
    """Response for GET /api/admin/fiscal/report/monthly."""

    year: int
    month: int
    branch_id: int
    invoices: list[FiscalMonthlyInvoiceSummary]
    credit_notes: list[FiscalMonthlyCreditNoteSummary]
    totals: FiscalMonthlyTotals


# --- Floor Plan (admin/floor_plan.py) ---------------------------------------


class FloorPlanTableOutput(BaseModel):
    """Inline table position inside a FloorPlan."""

    id: int
    table_id: int
    x: float
    y: float
    width: float
    height: float
    rotation: float
    shape: str
    label: str | None = None


class FloorPlanOutput(BaseModel):
    """FloorPlan dict produced by FloorPlanService._plan_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    name: str
    width: int
    height: int
    background_image: str | None = None
    is_default: bool
    sector_id: int | None = None
    tables: list[FloorPlanTableOutput]
    is_active: bool
    created_at: str | None = None


class FloorPlanLiveTableOutput(BaseModel):
    """Live table view added by FloorPlanService.get_plan_with_status."""

    floor_plan_table_id: int
    table_id: int
    table_number: str
    capacity: int | None = None
    x: float
    y: float
    width: float
    height: float
    rotation: float
    shape: str
    label: str | None = None
    status: str
    elapsed_minutes: int | None = None


class FloorPlanLiveOutput(FloorPlanOutput):
    """Response for GET /api/admin/floor-plans/{id}/live.

    Inherits all FloorPlan fields and adds `live_tables`.
    """

    live_tables: list[FloorPlanLiveTableOutput]


# --- Delivery (admin/delivery.py) -------------------------------------------


class DeliveryOrderItemOutput(BaseModel):
    """Inline item in a delivery order."""

    id: int
    product_id: int
    product_name: str
    qty: int
    unit_price_cents: int
    subtotal_cents: int
    notes: str | None = None


class DeliveryOrderOutput(BaseModel):
    """DeliveryOrder dict produced by DeliveryService._order_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    order_type: str
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_email: str | None = None
    delivery_address: str | None = None
    delivery_instructions: str | None = None
    delivery_lat: float | None = None
    delivery_lng: float | None = None
    estimated_ready_at: str | None = None
    estimated_delivery_at: str | None = None
    status: str
    total_cents: int
    payment_method: str | None = None
    is_paid: bool
    notes: str | None = None
    items: list[DeliveryOrderItemOutput]
    is_active: bool
    created_at: str | None = None
    updated_at: str | None = None


# --- Overrides (admin/overrides.py) -----------------------------------------


class ManagerOverrideOutput(BaseModel):
    """ManagerOverride dict produced by OverrideService._override_to_dict."""

    id: int
    tenant_id: int
    branch_id: int
    override_type: str
    reason: str
    approved_by: int
    requested_by: int
    entity_type: str
    entity_id: int
    old_values: str | None = None
    new_values: str | None = None
    status: str
    amount_cents: int | None = None
    is_active: bool
    created_at: str | None = None


# --- Tips (admin/tips.py extras) --------------------------------------------


class TipDistributionOutput(BaseModel):
    """Single entry in POST /api/admin/tips/distribute response."""

    id: int
    role: str
    amount_cents: int
    user_id: int | None = None


class TipReportOutput(BaseModel):
    """Response for GET /api/admin/tips/report."""

    branch_id: int
    total_cents: int
    tip_count: int
    by_method: dict[str, int]
    by_waiter: dict[str, int]


class TipPoolOutput(BaseModel):
    """Tip pool dict used by list/create/update tip-pools endpoints."""

    id: int
    branch_id: int | None = None
    name: str
    waiter_percent: int
    kitchen_percent: int
    other_percent: int
    is_active: bool | None = None


# Update forward references
LoginResponse.model_rebuild()
