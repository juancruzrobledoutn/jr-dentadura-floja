/**
 * Backend API types
 * These types match exactly with the FastAPI backend schemas
 */

// =============================================================================
// Session Types
// =============================================================================

/** Response from POST /api/tables/{table_id}/session */
export interface TableSessionResponse {
  session_id: number
  table_id: number
  table_code: string
  table_token: string
  status: 'OPEN' | 'PAYING'
}

// =============================================================================
// Menu Types
// =============================================================================

/** Response from GET /api/public/menu/{slug} */
export interface MenuResponse {
  branch_id: number
  branch_name: string
  branch_slug: string
  categories: CategoryAPI[]
}

export interface CategoryAPI {
  id: number
  name: string
  icon: string | null
  image: string | null
  order: number
  subcategories: SubcategoryAPI[]
  products: ProductAPI[]
}

export interface SubcategoryAPI {
  id: number
  name: string
  image: string | null
  order: number
}

export interface ProductAPI {
  id: number
  name: string
  description: string | null
  price_cents: number
  image: string | null
  category_id: number
  subcategory_id: number | null
  featured: boolean
  popular: boolean
  badge: string | null
  seal: string | null
  allergen_ids: number[]
  is_available: boolean
  // Canonical model fields (producto3.md) - optional for backward compatibility
  allergens?: ProductAllergensAPI | null
  dietary?: DietaryProfileAPI | null
  cooking?: CookingAPI | null
}

// =============================================================================
// Canonical Model Types (producto3.md)
// =============================================================================

/** Allergen info with presence type */
export interface AllergenInfoAPI {
  id: number
  name: string
  icon: string | null
}

/** Allergens grouped by presence type */
export interface ProductAllergensAPI {
  contains: AllergenInfoAPI[]
  may_contain: AllergenInfoAPI[]
  free_from: AllergenInfoAPI[]
}

/** Dietary profile (7 boolean flags) */
export interface DietaryProfileAPI {
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  is_dairy_free: boolean
  is_celiac_safe: boolean
  is_keto: boolean
  is_low_sodium: boolean
}

/** Cooking methods and properties */
export interface CookingAPI {
  methods: string[]
  uses_oil: boolean
  prep_time_minutes: number | null
  cook_time_minutes: number | null
}

export interface AllergenAPI {
  id: number
  name: string
  icon: string | null
}

/**
 * Cross-reaction information from public API
 * Used for allergen filtering (e.g., latex-fruit syndrome)
 */
export interface CrossReactionAPI {
  id: number
  cross_reacts_with_id: number
  cross_reacts_with_name: string
  probability: 'high' | 'medium' | 'low'
  notes: string | null
}

/**
 * Allergen with cross-reactions from public API
 * GET /api/public/menu/{slug}/allergens
 */
export interface AllergenWithCrossReactionsAPI {
  id: number
  name: string
  icon: string | null
  description: string | null
  is_mandatory: boolean
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening'
  cross_reactions: CrossReactionAPI[]
}

// =============================================================================
// Diner Types (Phase 2)
// =============================================================================

/** Request for POST /api/diner/register */
export interface RegisterDinerRequest {
  name: string
  color: string // Hex color (#RRGGBB)
  local_id?: string // Frontend UUID for syncing
  // FASE 1: Device tracking for cross-session recognition
  device_id?: string // Persistent device UUID
  device_fingerprint?: string // Browser fingerprint hash
}

/** Response from POST /api/diner/register */
export interface DinerOutput {
  id: number
  session_id: number
  name: string
  color: string
  local_id: string | null
  joined_at: string
  // FASE 1: Device tracking for cross-session recognition
  device_id: string | null
}

// =============================================================================
// Device History Types (FASE 1: Fidelización)
// =============================================================================

/** Single visit from device history */
export interface DeviceVisitOutput {
  session_id: number
  diner_id: number
  diner_name: string
  branch_id: number
  branch_name: string | null
  visited_at: string
  total_spent_cents: number
  items_ordered: number
}

/** Response from GET /api/diner/device/{device_id}/history */
export interface DeviceHistoryOutput {
  device_id: string
  total_visits: number
  total_spent_cents: number
  first_visit: string | null
  last_visit: string | null
  visits: DeviceVisitOutput[]
}

// =============================================================================
// Implicit Preferences Types (FASE 2: Fidelización)
// =============================================================================

/** Implicit preferences detected during session */
export interface ImplicitPreferencesData {
  excluded_allergen_ids: number[]
  dietary_preferences: string[]
  excluded_cooking_methods: string[]
  cross_reactions_enabled: boolean
  strictness: 'strict' | 'very_strict'
}

/** Request for PATCH /api/diner/preferences */
export interface UpdatePreferencesRequest {
  implicit_preferences: ImplicitPreferencesData
}

/** Response from PATCH /api/diner/preferences */
export interface UpdatePreferencesResponse {
  diner_id: number
  device_id: string | null
  implicit_preferences: ImplicitPreferencesData
  updated_at: string
}

/** Response from GET /api/diner/device/{device_id}/preferences */
export interface DevicePreferencesOutput {
  device_id: string
  has_preferences: boolean
  implicit_preferences: ImplicitPreferencesData | null
  last_updated: string | null
  visit_count: number
}

// =============================================================================
// Customer Types (FASE 4: Fidelización)
// =============================================================================

/**
 * QA-CRIT-03 FIX: DeviceHistoryResponse is an alias for DeviceHistoryOutput.
 * Use DeviceHistoryOutput directly for GET /api/diner/device/{device_id}/history
 * This type is kept for backward compatibility.
 */
export type DeviceHistoryResponse = DeviceHistoryOutput

/** Request for POST /api/customer/register */
export interface CustomerRegisterRequest {
  name: string
  phone?: string
  email?: string
  birthday_month?: number
  birthday_day?: number
  // QA-CRIT-05 FIX: device_id is required by backend
  device_id?: string
  data_consent: boolean
  marketing_consent?: boolean
  ai_personalization_enabled?: boolean
}

/** Response from customer endpoints */
export interface CustomerOutput {
  id: number
  tenant_id: number
  name: string | null
  phone: string | null
  email: string | null
  first_visit_at: string
  last_visit_at: string
  total_visits: number
  total_spent_cents: number
  avg_ticket_cents: number
  excluded_allergen_ids: number[]
  dietary_preferences: string[]
  excluded_cooking_methods: string[]
  favorite_product_ids: number[]
  segment: string | null
  consent_remember: boolean
  consent_marketing: boolean
}

/** Request for PATCH /api/customer/me */
export interface CustomerUpdateRequest {
  name?: string
  phone?: string
  email?: string
  excluded_allergen_ids?: number[]
  dietary_preferences?: string[]
  excluded_cooking_methods?: string[]
  consent_marketing?: boolean
}

/** Response from GET /api/customer/recognize */
export interface CustomerRecognizeResponse {
  recognized: boolean
  customer_id: number | null
  customer_name: string | null
  last_visit: string | null
  visit_count: number
  should_prompt_optin: boolean
  anonymous_visit_count: number
}

/** Favorite product for suggestions */
export interface FavoriteProductOutput {
  id: number
  name: string
  image: string | null
  times_ordered: number
  last_ordered: string | null
}

/** Response from GET /api/customer/suggestions */
export interface CustomerSuggestionsOutput {
  device_id: string
  customer_id: number | null
  favorites: FavoriteProductOutput[]
  last_ordered: FavoriteProductOutput[]
  recommendations: FavoriteProductOutput[]
}

// =============================================================================
// Round/Order Types
// =============================================================================

/** Request for POST /api/diner/rounds/submit */
export interface SubmitRoundRequest {
  items: SubmitRoundItem[]
}

export interface SubmitRoundItem {
  product_id: number
  qty: number
  notes?: string
}

/** Response from POST /api/diner/rounds/submit */
export interface SubmitRoundResponse {
  session_id: number
  round_id: number
  round_number: number
  status: 'SUBMITTED'
}

/** Response from GET /api/diner/session/{id}/rounds */
export interface RoundOutput {
  id: number
  round_number: number
  status: RoundStatus
  items: RoundItemOutput[]
  created_at: string
}

export type RoundStatus = 'DRAFT' | 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED' | 'CANCELED'

export interface RoundItemOutput {
  id: number
  product_id: number
  product_name: string
  qty: number
  unit_price_cents: number
  notes: string | null
}

// =============================================================================
// Service Call Types
// =============================================================================

export type ServiceCallType = 'WAITER_CALL' | 'PAYMENT_HELP' | 'OTHER'

/** Request for POST /api/diner/service-call */
export interface CreateServiceCallRequest {
  type: ServiceCallType
}

/** Response from POST /api/diner/service-call */
export interface ServiceCallOutput {
  id: number
  type: string
  status: 'OPEN' | 'ACKED' | 'CLOSED'
  created_at: string
  acked_by_user_id: number | null
}

// =============================================================================
// Check/Billing Types
// =============================================================================

/** Response from POST /api/billing/check/request */
export interface RequestCheckResponse {
  check_id: number
  total_cents: number
  paid_cents: number
  status: CheckStatus
}

export type CheckStatus = 'OPEN' | 'REQUESTED' | 'IN_PAYMENT' | 'PAID' | 'FAILED'

/** Response from GET /api/diner/check */
export interface CheckDetailOutput {
  id: number
  status: CheckStatus
  total_cents: number
  paid_cents: number
  remaining_cents: number
  items: CheckItemOutput[]
  payments: PaymentOutput[]
  created_at: string
  table_code: string | null
}

export interface CheckItemOutput {
  product_name: string
  qty: number
  unit_price_cents: number
  subtotal_cents: number
  notes: string | null
  round_number: number
}

export interface PaymentOutput {
  id: number
  provider: PaymentProvider
  status: PaymentStatus
  amount_cents: number
  created_at: string
}

export type PaymentProvider = 'CASH' | 'MERCADO_PAGO'
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** Response from GET /api/diner/session/{id}/total */
export interface SessionTotalResponse {
  session_id: number
  total_cents: number
  paid_cents: number
  check_id: number | null
  check_status: CheckStatus | null
}

// =============================================================================
// Mercado Pago Types
// =============================================================================

/** Request for POST /api/billing/mercadopago/preference */
export interface MercadoPagoPreferenceRequest {
  check_id: number
  /** A002 FIX: Optional amount in cents for partial payments */
  amount_cents?: number
}

/** Response from POST /api/billing/mercadopago/preference */
export interface MercadoPagoPreferenceResponse {
  preference_id: string
  init_point: string
  sandbox_init_point: string
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

export interface WSEvent {
  type: WSEventType
  tenant_id: number
  branch_id: number
  table_id: number
  session_id: number
  entity: Record<string, unknown>
  actor: {
    user_id: number | null
    role: string
  }
  ts: string
  v: number
}

export type WSEventType =
  | 'ROUND_SUBMITTED'
  | 'ROUND_IN_KITCHEN'
  | 'ROUND_READY'
  | 'ROUND_SERVED'
  | 'ROUND_ITEM_DELETED'
  | 'SERVICE_CALL_CREATED'
  | 'SERVICE_CALL_ACKED'
  | 'SERVICE_CALL_CLOSED'
  | 'CHECK_REQUESTED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'CHECK_PAID'
  | 'TABLE_CLEARED'
  // Shared cart events
  | 'CART_ITEM_ADDED'
  | 'CART_ITEM_UPDATED'
  | 'CART_ITEM_REMOVED'
  | 'CART_CLEARED'
  | 'CART_SYNC'
  // Product availability
  | 'PRODUCT_AVAILABILITY_CHANGED'

// =============================================================================
// Shared Cart Types (Real-time sync)
// =============================================================================

/** Request for POST /api/diner/cart/add */
export interface AddToCartRequest {
  product_id: number
  quantity: number
  notes?: string
  diner_id?: number  // Backend diner ID for multi-diner support
}

/** Request for PATCH /api/diner/cart/{item_id} */
export interface UpdateCartItemRequest {
  quantity: number
  notes?: string
}

/** Response from cart endpoints */
export interface CartItemAPI {
  item_id: number
  product_id: number
  product_name: string
  product_image: string | null
  price_cents: number
  quantity: number
  notes: string | null
  diner_id: number
  diner_name: string
  diner_color: string
}

/** Response from GET /api/diner/cart */
export interface CartOutput {
  items: CartItemAPI[]
  version: number
}

// =============================================================================
// Utility Types
// =============================================================================

/** Convert backend product to frontend format */
export interface ProductFrontend {
  id: number
  name: string
  description: string | null
  price: number // In pesos (converted from cents)
  priceCents: number // Original cents for backend
  image: string | null
  categoryId: number
  subcategoryId: number | null
  featured: boolean
  popular: boolean
  badge: string | null
  seal: string | null
  allergenIds: number[]
  isAvailable: boolean
  // Canonical model fields (producto3.md) - optional for backward compatibility
  allergens?: ProductAllergensAPI | null
  dietary?: DietaryProfileAPI | null
  cooking?: CookingAPI | null
}

/** Convert backend category to frontend format */
export interface CategoryFrontend {
  id: number
  name: string
  icon: string | null
  image: string | null
  order: number
  subcategories: SubcategoryFrontend[]
}

export interface SubcategoryFrontend {
  id: number
  name: string
  image: string | null
  order: number
}
