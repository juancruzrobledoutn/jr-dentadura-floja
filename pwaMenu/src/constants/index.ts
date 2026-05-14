/**
 * Centralized constants for pwamenu
 * Single source of truth for hardcoded values used across the app
 */

// =============================================================================
// DINER COLORS
// 16 colors to identify diners at a table (prevents repetition for most cases)
// =============================================================================
export const DINER_COLORS = [
  '#4b5563', // gray-600 (dark gray)
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#10b981', // emerald
  '#6366f1', // indigo
  '#eab308', // yellow
] as const

export type DinerColor = typeof DINER_COLORS[number]

// =============================================================================
// SESSION CONFIGURATION
// =============================================================================
export const SESSION_CONFIG = {
  /** Default session expiry in hours (one restaurant shift) */
  DEFAULT_EXPIRY_HOURS: 8,
  /** LocalStorage key for table session */
  STORAGE_KEY: 'pwamenu-table-storage',
  /** LocalStorage key for language preference */
  LANGUAGE_STORAGE_KEY: 'pwamenu-language',
} as const

// =============================================================================
// UI CONFIGURATION
// =============================================================================
export const UI_CONFIG = {
  /** Maximum items to show in cart badge before showing "9+" */
  MAX_CART_BADGE: 9,
  /** Maximum diners to show as avatars before collapsing */
  MAX_DINER_AVATARS: 3,
  /** Debounce delay for search input (ms) */
  SEARCH_DEBOUNCE_MS: 300,
  /** Animation duration for modal transitions (ms) */
  MODAL_ANIMATION_MS: 300,
  /** Order success animation duration (ms) */
  ORDER_SUCCESS_ANIMATION_MS: 2000,
} as const

// =============================================================================
// API CONFIGURATION
// =============================================================================
export const API_CONFIG = {
  /** Default request timeout (ms) */
  DEFAULT_TIMEOUT_MS: 30000,
  /** Allowed hosts for SSRF prevention (exact match, no subdomain wildcards) */
  ALLOWED_HOSTS: ['localhost', '127.0.0.1', '::1', '0.0.0.0'] as const,
  /** Allowed ports for development */
  ALLOWED_PORTS: ['', '80', '443', '3000', '5173', '5174', '5175', '5176', '8000', '8080'] as const,
} as const

// Re-export timing constants for convenience
export * from './timing'
