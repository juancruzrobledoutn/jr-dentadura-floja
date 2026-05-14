/**
 * Centralized timing constants
 *
 * All timeouts, delays, and animation durations should be defined here
 * to ensure consistency and make adjustments easier.
 */

// Animation durations
export const ANIMATION = {
  /** Modal slide up/fade in duration (CSS transition) */
  MODAL_DURATION_MS: 300,
  /** Success feedback display time before closing */
  SUCCESS_FEEDBACK_MS: 800,
  /** Cart/notification auto-close delay */
  AUTO_CLOSE_MS: 2000,
  /** Debounce delay for search input */
  SEARCH_DEBOUNCE_MS: 300,
  /** Carousel scroll animation delay */
  CAROUSEL_SCROLL_DELAY_MS: 300,
  /** API call simulation delay */
  API_SIMULATION_MS: 1000,
} as const

// Service Worker
export const SERVICE_WORKER = {
  /** Interval to check for SW updates */
  UPDATE_CHECK_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
} as const

// Session
export const SESSION = {
  /** Default session expiry (8 hours = restaurant shift) */
  DEFAULT_EXPIRY_HOURS: 8,
  /** Stale data warning threshold */
  STALE_THRESHOLD_MS: 2 * 60 * 60 * 1000, // 2 hours
} as const

// API
export const API = {
  /** Request timeout */
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  /** Rate limit window */
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
} as const

// Close table flow simulation
export const CLOSE_TABLE_FLOW = {
  /** Initial requesting state duration */
  REQUESTING_DELAY_MS: 1500,
  /** Min wait time for waiter response */
  WAITER_RESPONSE_MIN_MS: 2000,
  /** Max wait time for waiter response */
  WAITER_RESPONSE_MAX_MS: 4000,
} as const

// Throttle configuration
export const THROTTLE = {
  /** Cleanup interval for throttle map */
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
  /** Max age for throttle entries before cleanup */
  MAX_AGE_MS: 30 * 1000, // 30 seconds
  /** Cart action throttle delay */
  CART_ACTION_MS: 100,
  /** Update quantity throttle delay */
  UPDATE_QUANTITY_MS: 200,
} as const

// Auth configuration
export const AUTH = {
  /** Token expiry buffer before considering expired */
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000, // 5 minutes
  /** Auth request timeout */
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  /** Max retries for auth requests */
  MAX_RETRIES: 2,
  /** Base delay between retries */
  RETRY_DELAY_MS: 1000,
  /** Max age for pending auth requests before cleanup */
  PENDING_REQUEST_MAX_AGE_MS: 60 * 1000, // 60 seconds
} as const

// UI quantities
export const QUANTITY = {
  /** Maximum product quantity per cart item */
  MAX_PRODUCT_QUANTITY: 10,
  /** Minimum product quantity per cart item */
  MIN_PRODUCT_QUANTITY: 1,
  /** Maximum notes length */
  MAX_NOTES_LENGTH: 200,
} as const
