// Audit fields for soft delete and user tracking
export interface AuditFields {
  is_active: boolean
  created_at?: string
  updated_at?: string | null
  deleted_at?: string | null
  created_by_id?: number | null
  created_by_email?: string | null
  updated_by_id?: number | null
  updated_by_email?: string | null
  deleted_by_id?: number | null
  deleted_by_email?: string | null
}

// Restaurant types
export interface Restaurant {
  id: string
  name: string
  slug: string
  description: string
  logo?: string
  banner?: string
  theme_color: string
  address?: string
  phone?: string
  email?: string
  created_at?: string
  updated_at?: string
}

// Branch types (sucursales)
export interface Branch {
  id: string
  name: string
  restaurant_id: string
  address?: string
  phone?: string
  email?: string
  image?: string
  opening_time: string              // Horario de apertura (HH:mm)
  closing_time: string              // Horario de cierre (HH:mm)
  is_active?: boolean
  order: number
  created_at?: string
  updated_at?: string
}

export interface BranchFormData {
  name: string
  address?: string
  phone?: string
  email?: string
  image?: string
  opening_time: string              // HH:mm format
  closing_time: string              // HH:mm format
  is_active: boolean
  order: number
}

// Category types
export interface Category {
  id: string
  name: string
  icon?: string
  image?: string
  order: number
  branch_id: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

// Subcategory types
export interface Subcategory {
  id: string
  name: string
  category_id: string
  image?: string
  order: number
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

// Allergen types
// Severity levels for allergens
export type AllergenSeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening'

// Cross-reaction probability
export type CrossReactionProbability = 'low' | 'medium' | 'high'

// Cross-reaction info returned with allergen
export interface CrossReactionInfo {
  id: number
  cross_reacts_with_id: number
  cross_reacts_with_name: string
  probability: CrossReactionProbability
  notes?: string | null
}

export interface Allergen {
  id: string
  name: string
  icon?: string
  description?: string
  is_mandatory?: boolean  // EU 1169/2011 - 14 mandatory allergens
  severity?: AllergenSeverity  // mild, moderate, severe, life_threatening
  is_active?: boolean
  cross_reactions?: CrossReactionInfo[] | null
  created_at?: string
  updated_at?: string
}

export interface AllergenFormData {
  name: string
  icon?: string
  description?: string
  is_mandatory: boolean
  severity: AllergenSeverity
  is_active: boolean
}

// Cross-reaction management
export interface CrossReactionFormData {
  allergen_id: number
  cross_reacts_with_id: number
  probability: CrossReactionProbability
  notes?: string
}

export interface CrossReaction {
  id: number
  tenant_id: number
  allergen_id: number
  allergen_name: string
  cross_reacts_with_id: number
  cross_reacts_with_name: string
  probability: CrossReactionProbability
  notes?: string | null
  is_active: boolean
}

// =============================================================================
// Allergen Presence Types (Phase 0 - Canonical Model)
// =============================================================================

export type AllergenPresenceType = 'contains' | 'may_contain' | 'free_from'

// Risk level for product-allergen combination
export type AllergenRiskLevel = 'low' | 'standard' | 'high'

export interface AllergenPresence {
  allergen_id: number
  allergen_name: string
  allergen_icon?: string
  presence_type: AllergenPresenceType
  risk_level?: AllergenRiskLevel
}

export interface AllergenPresenceInput {
  allergen_id: number
  presence_type: AllergenPresenceType
  risk_level?: AllergenRiskLevel
}

// Badge types (product insignias)
export interface ProductBadge {
  id: string
  name: string
  color: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface BadgeFormData {
  name: string
  color: string
  is_active: boolean
}

// Seal types (product seals/stamps for special characteristics like vegan, organic, etc.)
export interface ProductSeal {
  id: string
  name: string
  color: string
  icon?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface SealFormData {
  name: string
  color: string
  icon?: string
  is_active: boolean
}

// Branch price for products (per-branch pricing)
export interface BranchPrice {
  branch_id: string
  price: number
  is_active: boolean  // true = product is sold at this branch
}

// Product types
export interface Product {
  id: string
  name: string
  description: string
  price: number                    // Base price (used when use_branch_prices is false)
  branch_prices?: BranchPrice[]    // Per-branch pricing (optional, defaults to [])
  use_branch_prices: boolean       // Toggle for per-branch pricing mode
  image?: string                   // Optional image URL
  category_id: string
  subcategory_id: string
  featured: boolean
  popular: boolean
  badge?: string
  seal?: string
  allergen_ids?: string[]          // Legacy format (backward compatible) - will be deprecated
  allergens?: AllergenPresence[]   // New format with presence types (Phase 0)
  // Recipe linkage (propuesta1.md)
  recipe_id?: number | null        // Optional reference to Recipe
  inherits_from_recipe?: boolean   // When true, product inherits allergens from recipe
  recipe_name?: string | null      // Display name of linked recipe
  is_active?: boolean
  stock?: number
  created_at?: string
  updated_at?: string
}

// Form types for CRUD operations
export interface CategoryFormData {
  name: string
  icon?: string
  image?: string
  order: number
  branch_id: string
  is_active: boolean
}

export interface SubcategoryFormData {
  name: string
  category_id: string
  image?: string
  order: number
  is_active: boolean
}

/**
 * Dietary profile for product (canonical model Phase 2)
 */
export interface ProductDietaryProfile {
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  is_dairy_free: boolean
  is_celiac_safe: boolean
  is_keto: boolean
  is_low_sodium: boolean
}

/**
 * Ingredient reference for product (canonical model Phase 1)
 */
export interface ProductIngredientInput {
  ingredient_id: number
  is_main: boolean
  notes?: string
}

/**
 * Sensory profile for product (canonical model Phase 3)
 */
export interface ProductSensoryProfile {
  flavors: string[]    // From FlavorProfile catalog
  textures: string[]   // From TextureProfile catalog
}

/**
 * Cooking information for product (canonical model Phase 3)
 */
export interface ProductCookingInfo {
  methods: string[]           // From CookingMethod catalog
  uses_oil: boolean
  prep_time_minutes?: number
  cook_time_minutes?: number
}

export interface ProductFormData {
  name: string
  description: string
  price: number                    // Base price
  branch_prices: BranchPrice[]     // Per-branch pricing
  use_branch_prices: boolean       // Toggle for per-branch pricing mode
  image?: string                   // Optional image URL
  category_id: string
  subcategory_id: string
  featured: boolean
  popular: boolean
  badge?: string
  seal?: string
  allergen_ids: string[]           // Legacy format (backward compatible)
  allergens: AllergenPresenceInput[] // New format with presence types (Phase 0)
  // Recipe linkage (propuesta1.md)
  recipe_id?: number | null        // Optional reference to Recipe
  inherits_from_recipe?: boolean   // When true, product inherits allergens from recipe
  is_active: boolean
  stock?: number
  // Canonical model fields (producto3.md improvements)
  ingredients: ProductIngredientInput[]     // Phase 1: Ingredient references
  dietary_profile: ProductDietaryProfile    // Phase 2: Dietary flags
  cooking: ProductCookingInfo               // Phase 3: Cooking methods
  sensory: ProductSensoryProfile            // Phase 3: Flavors and textures
}

export interface RestaurantFormData {
  name: string
  slug: string
  description: string
  logo?: string
  banner?: string
  theme_color: string
  address?: string
  phone?: string
  email?: string
}

// Table column definition for reusable table component
export interface TableColumn<T> {
  key: keyof T | string
  label: React.ReactNode
  render?: (item: T) => React.ReactNode
  sortable?: boolean
  width?: string
}

// Toast notification
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

// Promotion Type types
export interface PromotionType {
  id: string
  name: string
  description?: string
  icon?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface PromotionTypeFormData {
  name: string
  description?: string
  icon?: string
  is_active: boolean
}

// Promotion types
export interface PromotionItem {
  product_id: string
  quantity: number
}

export interface Promotion {
  id: string
  name: string
  description?: string
  price: number
  image?: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  promotion_type_id: string
  branch_ids: string[]
  items: PromotionItem[]
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface PromotionFormData {
  name: string
  description?: string             // Optional, matches Promotion interface
  price: number
  image?: string                   // Optional, matches Promotion interface
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  promotion_type_id: string
  branch_ids: string[]
  items: PromotionItem[]
  is_active: boolean
}

// Table status for order tracking
export type TableStatus = 'libre' | 'solicito_pedido' | 'pedido_cumplido' | 'cuenta_solicitada' | 'ocupada'

// Order/Round status for tracking order progress
// Maps to Round status: PENDING → pending, CONFIRMED → confirmed, SUBMITTED → submitted, etc.
// Flow: pending → confirmed → submitted → in_kitchen → ready → served
// 'ready_with_kitchen' = at least one round is ready AND at least one is still in kitchen
export type OrderStatus = 'none' | 'pending' | 'confirmed' | 'submitted' | 'in_kitchen' | 'ready' | 'ready_with_kitchen' | 'served'

// Table types (mesas)
export interface RestaurantTable {
  id: string
  branch_id: string
  number: number                   // Table number/identifier within branch
  capacity: number                 // Number of seats/diners
  sector: string                   // Location sector (e.g., "Interior", "Terraza", "VIP")
  status: TableStatus
  orderStatus?: OrderStatus        // Aggregate order status (worst status across all rounds)
  roundStatuses?: Record<string, OrderStatus>  // Individual round statuses by round_id
  order_time: string               // Time of first order (HH:mm format), "00:00" when libre
  close_time: string               // Closing time (HH:mm format), "00:00" when libre
  hasNewOrder?: boolean            // True when a new order arrives (triggers blink animation)
  statusChanged?: boolean          // True when status just changed (triggers blink animation)
  confirmedByName?: string         // Last name of waiter who confirmed the order
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface RestaurantTableFormData {
  branch_id: string
  number: number
  capacity: number
  sector: string
  status: TableStatus
  order_time: string               // HH:mm format
  close_time: string               // HH:mm format
  is_active: boolean
}

// Order command item (producto en una comanda)
export interface OrderCommandItem {
  product_id: string
  product_name: string             // Snapshot del nombre al momento del pedido
  quantity: number
  unit_price: number               // Precio unitario al momento del pedido
  notes?: string                   // Notas especiales (sin sal, bien cocido, etc.)
}

// Order command (comanda individual)
export interface OrderCommand {
  id: string
  order_history_id: string         // Referencia al historial de la mesa
  items: OrderCommandItem[]
  subtotal: number                 // Suma de (quantity * unit_price)
  created_at: string               // Timestamp de cuando se creo la comanda
  status: 'pendiente' | 'en_preparacion' | 'listo' | 'entregado'
}

// Order history record (registro historico por mesa/fecha)
export interface OrderHistory {
  id: string
  branch_id: string
  table_id: string
  table_number: number             // Snapshot del numero de mesa
  date: string                     // Fecha YYYY-MM-DD
  staff_id?: string                // ID del mozo que atendio (opcional por ahora)
  staff_name?: string              // Nombre del mozo (snapshot)
  commands: OrderCommand[]         // Lista de comandas de esta sesion
  order_time: string               // Hora del primer pedido (HH:mm)
  close_time: string | undefined   // Hora de cierre (HH:mm), undefined si aun abierta
  total: number                    // Suma de subtotales de todas las comandas
  status: 'abierta' | 'cerrada'    // Estado del registro
  created_at: string
  updated_at?: string
}

// =============================================================================
// Branch Exclusion Types (Categories/Subcategories excluded per branch)
// =============================================================================

// Summary of category exclusions across branches
export interface CategoryExclusionSummary {
  category_id: number
  category_name: string
  excluded_branch_ids: number[]
}

// Summary of subcategory exclusions across branches
export interface SubcategoryExclusionSummary {
  subcategory_id: number
  subcategory_name: string
  category_id: number
  category_name: string
  excluded_branch_ids: number[]
}

// Complete overview of all exclusions
export interface ExclusionOverview {
  category_exclusions: CategoryExclusionSummary[]
  subcategory_exclusions: SubcategoryExclusionSummary[]
}

// Request body for updating exclusions
export interface ExclusionBulkUpdate {
  excluded_branch_ids: number[]
}

// =============================================================================
// Recipe Types (Kitchen Technical Sheets - matches backend schema)
// =============================================================================

export interface RecipeIngredient {
  ingredient_id?: number | null  // Optional reference to Ingredient table
  name: string                   // Display name (from selected ingredient or manual)
  quantity: string
  unit: string
  notes?: string
}

export interface RecipePreparationStep {
  step: number
  instruction: string
  time_minutes?: number
}

// Modification allowed/disallowed for a recipe (Phase 4 - planteo.md)
export interface RecipeModification {
  action: 'remove' | 'substitute'  // "remove" or "substitute"
  item: string                      // What can be removed/substituted
  allowed: boolean
}

// Allergen info returned from Recipe API (M:N relationship)
export interface RecipeAllergenInfo {
  id: number
  name: string
  icon?: string | null
}

export interface Recipe {
  id: string
  branch_id: string
  branch_name?: string
  product_id?: string
  product_name?: string
  subcategory_id?: string
  subcategory_name?: string
  category_id?: string
  category_name?: string
  name: string
  description?: string
  short_description?: string  // Short description for preview (100-150 chars)
  image?: string
  cuisine_type?: string
  difficulty?: string
  prep_time_minutes?: number
  cook_time_minutes?: number
  total_time_minutes?: number
  servings?: number
  calories_per_serving?: number
  ingredients: RecipeIngredient[]
  preparation_steps: RecipePreparationStep[]
  chef_notes?: string
  presentation_tips?: string
  storage_instructions?: string
  allergen_ids: number[]  // IDs for form binding (M:N relationship)
  allergens: RecipeAllergenInfo[]  // Full allergen info for display
  dietary_tags: string[]
  // Sensory profile (Phase 3 - planteo.md)
  flavors: string[]  // ["suave", "intenso", "dulce", "salado", "acido", "amargo", "umami", "picante"]
  textures: string[]  // ["crocante", "cremoso", "tierno", "firme", "esponjoso", "gelatinoso", "granulado"]
  // Cooking info
  cooking_methods: string[]  // ["horneado", "frito", "grillado", "crudo", "hervido", "vapor", "salteado", "braseado"]
  uses_oil: boolean
  // Celiac safety
  is_celiac_safe: boolean
  allergen_notes?: string
  // Modifications and warnings (Phase 4 - planteo.md)
  modifications: RecipeModification[]
  warnings: string[]
  // Cost and yield
  cost_cents?: number
  suggested_price_cents?: number
  yield_quantity?: string  // e.g., "2kg", "24 unidades"
  yield_unit?: string
  portion_size?: string  // e.g., "200g", "1 unidad"
  // RAG config (Phase 5 - planteo.md)
  risk_level: 'low' | 'medium' | 'high'
  custom_rag_disclaimer?: string
  // Status
  is_active: boolean
  is_ingested: boolean
  last_ingested_at?: string
  created_at?: string
  created_by_email?: string
}

export interface RecipeFormData {
  branch_id: string
  product_id?: string
  category_id?: string
  subcategory_id?: string
  name: string
  description?: string
  short_description?: string
  image?: string
  cuisine_type?: string
  difficulty?: string
  prep_time_minutes?: number
  cook_time_minutes?: number
  servings?: number
  calories_per_serving?: number
  ingredients: RecipeIngredient[]
  preparation_steps: RecipePreparationStep[]
  chef_notes?: string
  presentation_tips?: string
  storage_instructions?: string
  allergen_ids: number[]  // IDs for M:N relationship (replaces allergens: string[])
  dietary_tags: string[]
  // Sensory profile
  flavors: string[]
  textures: string[]
  // Cooking info
  cooking_methods: string[]
  uses_oil: boolean
  // Celiac safety
  is_celiac_safe: boolean
  allergen_notes?: string
  // Modifications and warnings
  modifications: RecipeModification[]
  warnings: string[]
  // Cost and yield
  cost_cents?: number
  suggested_price_cents?: number
  yield_quantity?: string
  yield_unit?: string
  portion_size?: string
  // RAG config
  risk_level: 'low' | 'medium' | 'high'
  custom_rag_disclaimer?: string
  // Status
  is_active: boolean
}

// Difficulty type for recipes
export type RecipeDifficulty = 'EASY' | 'MEDIUM' | 'HARD'

// =============================================================================
// Ingredient Types (Phase 1 - Canonical Product Model)
// =============================================================================

export interface IngredientGroup {
  id: string
  name: string
  description?: string
  icon?: string
  is_active: boolean
}

export interface SubIngredient {
  id: number
  ingredient_id: number
  name: string
  description?: string
  is_active: boolean
}

export interface Ingredient {
  id: string
  tenant_id: number
  name: string
  description?: string
  group_id?: number
  group_name?: string
  is_processed: boolean
  is_active: boolean
  created_at: string
  sub_ingredients: SubIngredient[]
}

export interface IngredientFormData {
  name: string
  description?: string
  group_id?: number
  is_processed: boolean
}

export interface SubIngredientFormData {
  name: string
  description?: string
}

// =============================================================================
// Canonical Product Model Types (Phases 1-4)
// =============================================================================

// Phase 1: Product Ingredients
export interface ProductIngredientInput {
  ingredient_id: number
  is_main: boolean
  notes?: string
}

// Phase 2: Dietary Profile
export interface DietaryProfileInput {
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  is_dairy_free: boolean
  is_celiac_safe: boolean
  is_keto: boolean
  is_low_sodium: boolean
}

// Phase 3: Cooking Information
export interface CookingInfoInput {
  cooking_method_ids: number[]
  uses_oil: boolean
  prep_time_minutes?: number
  cook_time_minutes?: number
}

// Phase 3: Sensory Profile
export interface SensoryProfileInput {
  flavor_ids: number[]
  texture_ids: number[]
}

// Phase 4: Product Modifications
export type ModificationAction = 'remove' | 'substitute'

export interface ModificationInput {
  action: ModificationAction
  item: string
  is_allowed: boolean
  extra_cost_cents: number
}

// Phase 4: Product Warnings
export type WarningSeverity = 'info' | 'warning' | 'danger'

export interface WarningInput {
  text: string
  severity: WarningSeverity
}

// Phase 4: RAG Configuration
export type RAGRiskLevel = 'low' | 'medium' | 'high'

export interface RAGConfigInput {
  risk_level: RAGRiskLevel
  custom_disclaimer?: string
  highlight_allergens: boolean
}

// Cooking Method catalog item
export interface CookingMethod {
  id: number
  name: string
  description?: string
  icon?: string
  is_active: boolean
}

// Flavor Profile catalog item
export interface FlavorProfile {
  id: number
  name: string
  description?: string
  icon?: string
  is_active: boolean
}

// Texture Profile catalog item
export interface TextureProfile {
  id: number
  name: string
  description?: string
  icon?: string
  is_active: boolean
}

// Extended ProductFormData with canonical model fields
export interface ProductFormDataCanonical extends ProductFormData {
  // Phase 1: Ingredients
  ingredients: ProductIngredientInput[]
  // Phase 2: Dietary Profile
  dietary_profile?: DietaryProfileInput
  // Phase 3: Cooking & Sensory
  cooking_info?: CookingInfoInput
  sensory_profile?: SensoryProfileInput
  // Phase 4: Advanced
  modifications: ModificationInput[]
  warnings: WarningInput[]
  rag_config?: RAGConfigInput
}
