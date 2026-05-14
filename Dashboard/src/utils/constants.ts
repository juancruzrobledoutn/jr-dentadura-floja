// Category constants
export const HOME_CATEGORY_NAME = 'Home'

// Storage keys for localStorage persistence
export const STORAGE_KEYS = {
  AUTH: 'dashboard-auth',
  RESTAURANT: 'dashboard-restaurant',
  BRANCHES: 'dashboard-branches',
  CATEGORIES: 'dashboard-categories',
  SUBCATEGORIES: 'dashboard-subcategories',
  PRODUCTS: 'dashboard-products',
  ALLERGENS: 'dashboard-allergens',
  BADGES: 'dashboard-badges',
  SEALS: 'dashboard-seals',
  PROMOTIONS: 'dashboard-promotions',
  PROMOTION_TYPES: 'dashboard-promotion-types',
  TABLES: 'dashboard-tables',
  ORDER_HISTORY: 'dashboard-order-history',
  STAFF: 'dashboard-staff',
  ROLES: 'dashboard-roles',
  RECIPES: 'dashboard-recipes',
  INGREDIENTS: 'dashboard-ingredients',
} as const

// Store versions for migration support
// Increment when changing data structure to trigger migration
export const STORE_VERSIONS = {
  RESTAURANT: 2,          // v2: Removed mock data, data comes from backend
  BRANCHES: 5,          // v5: Removed mock data, data comes from backend
  CATEGORIES: 4,        // v4: Removed mock data
  SUBCATEGORIES: 4,     // v4: Removed mock data
  PRODUCTS: 6,          // v6: Removed mock data
  ALLERGENS: 2,         // v2: Non-destructive merge (system data kept)
  BADGES: 1,            // v1: Initial version (system data kept)
  SEALS: 1,             // v1: Initial version (system data kept)
  PROMOTIONS: 4,        // v4: Removed mock data
  PROMOTION_TYPES: 2,   // v2: Non-destructive merge (system data kept)
  TABLES: 7,            // v7: Removed mock data
  ORDER_HISTORY: 1,     // v1: Initial version
  STAFF: 3,             // v3: Removed mock data
  ROLES: 1,             // v1: Initial version with predefined roles (system data kept)
  RECIPES: 1,           // v1: Initial version for kitchen recipes
  INGREDIENTS: 1,       // v1: Initial version for canonical product model
} as const

// Table status labels for UI display
export const TABLE_STATUS_LABELS: Record<string, string> = {
  libre: 'Libre',
  solicito_pedido: 'Solicito Pedido',
  pedido_cumplido: 'Pedido Cumplido',
  cuenta_solicitada: 'Cuenta Solicitada',
  ocupada: 'Ocupada',
} as const

// Common table sectors
export const TABLE_SECTORS = [
  'Interior',
  'Terraza',
  'VIP',
  'Barra',
  'Jardin',
  'Salon Principal',
] as const

// Default time for table (00:00 when libre/ocupada, or close_time when solicito_pedido)
export const TABLE_DEFAULT_TIME = '00:00' as const

// Default branch operating hours
export const BRANCH_DEFAULT_OPENING_TIME = '09:00' as const
export const BRANCH_DEFAULT_CLOSING_TIME = '23:00' as const

// Currency and locale settings
export const LOCALE = {
  CURRENCY: 'ARS',
  LANGUAGE: 'es-AR',
} as const

// Validation patterns
export const PATTERNS = {
  SLUG: /^[a-z0-9-]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  TIME: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,  // HH:mm format (00:00 - 23:59)
} as const

// Default values
export const DEFAULTS = {
  THEME_COLOR: '#f97316',
  TOAST_DURATION: 3000,
  ITEMS_PER_PAGE: 10,
} as const

// Validation limits - centralized for consistency across all validators
export const VALIDATION_LIMITS = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_ADDRESS_LENGTH: 200,
  MAX_ORDER_VALUE: 9999,
  MAX_CAPACITY: 999,
  MAX_PRICE: 999999999,
  MAX_TOASTS: 5,
} as const

/**
 * Generate a unique ID using crypto.randomUUID()
 * Centralized to avoid duplication across stores
 */
export const generateId = (): string => crypto.randomUUID()

// Centralized price formatter using locale settings
export function formatPrice(price: number): string {
  // Handle edge cases
  if (!Number.isFinite(price)) {
    return '$0,00'
  }
  return new Intl.NumberFormat(LOCALE.LANGUAGE, {
    style: 'currency',
    currency: LOCALE.CURRENCY,
  }).format(price)
}
