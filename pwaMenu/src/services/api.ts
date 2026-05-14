import type { Product, Category } from '../types'
import { apiLogger } from '../utils/logger'
import { API_CONFIG, API } from '../constants'
import { ApiError, ERROR_CODES } from '../utils/errors'
// QA-HIGH-01 FIX: Import getDeviceId for customer API headers
import { getDeviceId } from '../utils/deviceId'
import type {
  TableSessionResponse,
  MenuResponse,
  SubmitRoundRequest,
  SubmitRoundResponse,
  RoundOutput,
  CreateServiceCallRequest,
  ServiceCallOutput,
  CheckDetailOutput,
  SessionTotalResponse,
  RequestCheckResponse,
  MercadoPagoPreferenceRequest,
  MercadoPagoPreferenceResponse,
  RegisterDinerRequest,
  DinerOutput,
  AllergenWithCrossReactionsAPI,
  // FASE 2: Implicit Preferences
  UpdatePreferencesRequest,
  UpdatePreferencesResponse,
  DevicePreferencesOutput,
  DeviceHistoryResponse,
  // FASE 4: Customer Loyalty
  CustomerRegisterRequest,
  CustomerOutput,
  CustomerRecognizeResponse,
  CustomerUpdateRequest,
  CustomerSuggestionsOutput,
  // Shared Cart (Real-time sync)
  AddToCartRequest,
  UpdateCartItemRequest,
  CartItemAPI,
  CartOutput,
} from '../types/backend'

// Re-export ApiError for backwards compatibility
export { ApiError } from '../utils/errors'

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`

// Table token for diner authentication
let tableToken: string | null = null

export function setTableToken(token: string | null): void {
  tableToken = token
  // MENU-STORE-HIGH-01 FIX: Wrap localStorage access in try-catch for environments
  // where localStorage is unavailable (private browsing, storage quota exceeded)
  try {
    if (token) {
      localStorage.setItem('table_token', token)
    } else {
      localStorage.removeItem('table_token')
    }
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export function getTableToken(): string | null {
  if (!tableToken) {
    // MENU-STORE-HIGH-01 FIX: Wrap localStorage access in try-catch
    try {
      tableToken = localStorage.getItem('table_token')
    } catch {
      // Silently fail if localStorage is unavailable
      tableToken = null
    }
  }
  return tableToken
}

// Session expiration callback - set by sessionStore to handle expired tokens
let onSessionExpired: (() => void) | null = null

/**
 * Set a callback to be invoked when the session (table token) expires
 * Called by sessionStore to inject expiration handler
 */
export function setSessionExpiredCallback(callback: (() => void) | null): void {
  onSessionExpired = callback
}

// Use centralized config for SSRF prevention (single source of truth)
// IMPORTANT: Only allow exactly these hosts, not subdomains
const ALLOWED_HOSTS = new Set<string>(API_CONFIG.ALLOWED_HOSTS)
const ALLOWED_PORTS = new Set<string>(API_CONFIG.ALLOWED_PORTS)

// Validate that the base URL is secure
function isValidApiBase(url: string): boolean {
  try {
    // Relative URLs are always valid (same-origin)
    if (url.startsWith('/') && !url.startsWith('//')) return true

    const parsed = new URL(url)

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false

    // SECURITY: Prevent SSRF via IP addresses (IPv4 and IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

    if (ipv4Regex.test(parsed.hostname) || ipv6Regex.test(parsed.hostname)) {
      apiLogger.warn('IP addresses not allowed in API URL:', parsed.hostname)
      throw new ApiError('IP addresses not allowed in API URL', 0, ERROR_CODES.VALIDATION)
    }

    // SECURITY: Prevent credentials in URL (userinfo)
    if (parsed.username || parsed.password) {
      apiLogger.warn('URL credentials not allowed')
      throw new ApiError('Credentials not allowed in URL', 0, ERROR_CODES.VALIDATION)
    }

    // Check EXACT allowed host (no subdomains to prevent evil.localhost)
    const isAllowedHost = ALLOWED_HOSTS.has(parsed.hostname)

    // SECURITY FIX: Normalize port (empty string defaults to protocol default)
    const normalizedPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    const isAllowedPort = ALLOWED_PORTS.has(normalizedPort)

    // For allowed hosts, also check port to prevent SSRF via port
    if (isAllowedHost && !isAllowedPort) {
      apiLogger.warn(`Port ${normalizedPort} not in allowed list for ${parsed.hostname}`)
      return false
    }

    if (isAllowedHost) {
      return true
    }

    // Check same-origin - but also validate port for security
    const isSameOrigin = typeof window !== 'undefined' &&
      parsed.origin === window.location.origin

    if (isSameOrigin) {
      // For same-origin, validate port matches current page or is in allowed list
      const currentPort = typeof window !== 'undefined' ? window.location.port : ''

      // Normalize ports to handle both '' and undefined as default port
      const normalizedParsedPort = parsed.port || ''
      const normalizedCurrentPort = currentPort || ''

      const isValidSameOriginPort = isAllowedPort ||
        normalizedParsedPort === normalizedCurrentPort

      if (!isValidSameOriginPort) {
        apiLogger.warn(`Same-origin request on unusual port: ${parsed.port}`)
        return false
      }
      return true
    }

    return false
  } catch {
    return false
  }
}

// Validate API_BASE at startup - strict in production
if (!isValidApiBase(API_BASE)) {
  if (import.meta.env.DEV) {
    apiLogger.warn('API_BASE is not a valid or secure URL:', API_BASE)
  } else {
    // In production, throw to prevent potential SSRF attacks
    throw new Error(`Invalid API_BASE configuration. Requests blocked for security.`)
  }
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>
  timeout?: number
  /** Skip deduplication for this request (e.g., for mutations that should always execute) */
  skipDedup?: boolean
  /** Include authorization token in request */
  auth?: boolean
  /** Include table token for diner authentication */
  tableAuth?: boolean
}

// Token getter function - can be set by auth store
let getAuthToken: (() => string | null) | null = null

/**
 * Set the function to get the current auth token
 * Called by authStore to inject token getter
 */
export function setAuthTokenGetter(getter: () => string | null): void {
  getAuthToken = getter
}

// Request deduplication to prevent race conditions from rapid clicks
// RACE CONDITION FIX: Store body for comparison instead of hash to prevent collisions
// MENU-CRIT-03 FIX: Added timestamp to track request age for cleanup
const pendingRequests = new Map<string, { body: string | undefined; promise: Promise<unknown>; startTime: number }>()

// MEMORY LEAK FIX: Prevent unbounded growth of pendingRequests
// MENU-SVC-LOW-01 FIX: Use constants from centralized config
const MAX_PENDING_REQUESTS = 100
const PENDING_REQUESTS_CLEANUP_INTERVAL = 60 * 1000 // Check every minute
// MENU-CRIT-03 FIX: Maximum time a request can be pending before forced cleanup
const REQUEST_TIMEOUT_MS = API.REQUEST_TIMEOUT_MS
let lastPendingCleanup = Date.now()

/**
 * Clean up pendingRequests Map to prevent memory leaks
 * In normal operation, requests complete quickly and clean themselves up.
 * This is a safety measure for stuck/long-running requests.
 * MENU-CRIT-03 FIX: Now also removes stale requests that exceeded timeout
 */
function cleanupPendingRequests(): void {
  const now = Date.now()

  // MEMORY LEAK FIX: If map exceeds max size, log warning and clear oldest entries
  if (pendingRequests.size > MAX_PENDING_REQUESTS) {
    apiLogger.warn(`pendingRequests exceeded ${MAX_PENDING_REQUESTS}, clearing to prevent memory leak`)
    pendingRequests.clear()
    lastPendingCleanup = now
    return
  }

  // Only cleanup periodically to avoid performance impact
  if (now - lastPendingCleanup < PENDING_REQUESTS_CLEANUP_INTERVAL) {
    return
  }

  lastPendingCleanup = now

  // MENU-CRIT-03 FIX: Remove stale requests that have exceeded the timeout
  let staleCount = 0
  for (const [key, entry] of pendingRequests.entries()) {
    if (now - entry.startTime > REQUEST_TIMEOUT_MS * 2) {
      // Request is twice the timeout age - definitely stuck, clean it up
      pendingRequests.delete(key)
      staleCount++
    }
  }

  if (staleCount > 0) {
    apiLogger.warn(`Cleaned up ${staleCount} stale pending requests`)
  }

  // Log if we have many pending requests (potential issue)
  if (pendingRequests.size > 20) {
    apiLogger.warn(`High number of pending requests: ${pendingRequests.size}`)
  }
}

// RACE CONDITION FIX: Use only method + endpoint as base key
// Body comparison is done separately to prevent hash collisions
function getRequestKey(method: string, endpoint: string): string {
  return `${method}:${endpoint}`
}

// Legacy error codes mapping for backwards compatibility
// Use ERROR_CODES from utils/errors for new code
export const API_ERROR_CODES = {
  TIMEOUT_ERROR: ERROR_CODES.TIMEOUT,
  NETWORK_ERROR: ERROR_CODES.NETWORK,
  EMPTY_RESPONSE: ERROR_CODES.EMPTY_RESPONSE,
  PARSE_ERROR: ERROR_CODES.PARSE_ERROR,
  UNKNOWN_ERROR: ERROR_CODES.UNKNOWN,
  HTTP_ERROR: ERROR_CODES.HTTP_ERROR,
} as const

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  // MENU-SVC-LOW-01 FIX: Use constant for default timeout
  const { timeout = API.REQUEST_TIMEOUT_MS, skipDedup = false, auth = false, tableAuth = false, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const bodyStr = typeof fetchOptions.body === 'string' ? fetchOptions.body : undefined

  // MEMORY LEAK FIX: Periodic cleanup of pending requests
  cleanupPendingRequests()

  // RACE CONDITION FIX: Request deduplication with direct body comparison
  // MENU-CRIT-03 FIX: Also check if cached request hasn't timed out
  const baseKey = getRequestKey(method, endpoint)
  const now = Date.now()
  if (!skipDedup) {
    // Search for existing request with same method, endpoint AND body
    for (const [key, cached] of pendingRequests.entries()) {
      if (key.startsWith(baseKey) && cached.body === bodyStr) {
        // MENU-CRIT-03 FIX: Only reuse if request hasn't been pending too long
        if (now - cached.startTime < REQUEST_TIMEOUT_MS) {
          apiLogger.debug('Request deduplicated', { method, endpoint })
          return cached.promise as Promise<T>
        } else {
          // Request has been pending too long, remove it and make a new one
          apiLogger.warn('Removing stale pending request', { method, endpoint, age: now - cached.startTime })
          pendingRequests.delete(key)
        }
      }
    }
  }

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Build headers with optional auth token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // Basic CSRF protection
    ...fetchOptions.headers
  }

  // Add Authorization header if auth is enabled and token is available
  if (auth && getAuthToken) {
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // Add table token for diner authentication
  if (tableAuth) {
    const token = getTableToken()
    if (token) {
      headers['X-Table-Token'] = token
    }
  }

  const config: RequestInit = {
    headers,
    credentials: 'same-origin', // Only send cookies to same origin
    signal: controller.signal,
    ...fetchOptions
  }

  // RACE CONDITION FIX: Generate unique key for this request
  const uniqueKey = `${baseKey}:${Date.now()}`

  // Create the request promise and store it for deduplication
  const requestPromise = (async (): Promise<T> => {
    try {
      const response = await fetch(url, config)
      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))

        // Handle 401 Unauthorized - session/token expired
        if (response.status === 401 && tableAuth && onSessionExpired) {
          apiLogger.warn('Table token expired, triggering session expiration callback')
          onSessionExpired()
        }

        throw new ApiError(
          error.detail || `HTTP ${response.status}`,
          response.status,
          response.status === 401 ? ERROR_CODES.AUTH_SESSION_EXPIRED : (error.code || API_ERROR_CODES.HTTP_ERROR)
        )
      }

      // Handle empty responses - throw explicit error
      const text = await response.text()
      if (!text || text.trim() === '') {
        // 204 No Content is valid for empty responses
        if (response.status === 204) {
          return {} as T
        }
        // Other empty responses are errors
        throw new ApiError(
          'Empty response',
          response.status,
          API_ERROR_CODES.EMPTY_RESPONSE
        )
      }

      try {
        return JSON.parse(text) as T
      } catch {
        throw new ApiError(
          'Parse error',
          response.status,
          API_ERROR_CODES.PARSE_ERROR
        )
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof ApiError) {
        throw error
      }
      // Timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('Request timeout', 0, API_ERROR_CODES.TIMEOUT_ERROR)
      }
      // Network or fetch error
      if (error instanceof TypeError) {
        throw new ApiError('Network error', 0, API_ERROR_CODES.NETWORK_ERROR)
      }
      apiLogger.error(`API Error [${endpoint}]:`, error)
      throw new ApiError('Unknown error', 500, API_ERROR_CODES.UNKNOWN_ERROR)
    } finally {
      // RACE CONDITION FIX: Remove from pending requests when done (success or error)
      // Use unique key with timestamp to avoid conflicts
      pendingRequests.delete(uniqueKey)
    }
  })()

  // RACE CONDITION FIX: Store promise with body for deduplication
  // MENU-CRIT-03 FIX: Include startTime for stale request detection
  if (!skipDedup) {
    pendingRequests.set(uniqueKey, { body: bodyStr, promise: requestPromise, startTime: now })
  }

  return requestPromise
}

// AUDIT FIX S0.1 (C10-C14): Removed dead/broken wrappers that pointed to non-existent
// backend endpoints (/public/menu/{slug}/categories, /public/menu/{slug}/items/{id},
// /public/orders, /public/orders/{id}). The product-detail endpoint exists as
// /public/menu/{branch_slug}/products/{product_id} — use it via menuStore if needed.
export const api = {
  // Menu endpoints
  getMenu(restaurantSlug: string): Promise<{ categories: Category[]; items: Product[] }> {
    return request(`/public/menu/${restaurantSlug}`)
  },

  getMenuItem(restaurantSlug: string, productId: string): Promise<Product> {
    return request(`/public/menu/${restaurantSlug}/products/${productId}`)
  },

  // Chat endpoint for AI assistant
  chat(question: string, branchId?: number): Promise<ChatResponse> {
    return request('/chat', {
      method: 'POST',
      body: JSON.stringify({ question, branch_id: branchId })
    })
  }
}

// Chat response type
export interface ChatSource {
  id: number
  title: string | null
  score: number
  source: string | null
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  confidence: number
}

// =============================================================================
// Session API - Table session management
// =============================================================================

export const sessionAPI = {
  /**
   * Create or get existing session for a table by numeric ID
   * Called when diner scans QR code with numeric table ID
   */
  createOrGetSession(tableId: number): Promise<TableSessionResponse> {
    return request(`/tables/${tableId}/session`, {
      method: 'POST',
      skipDedup: true,
    })
  },

  /**
   * Create or get existing session for a table by alphanumeric code
   * Called when diner scans QR code with table code (e.g., "INT-01", "TER-02")
   *
   * @param tableCode - The alphanumeric table code (e.g., "INT-01")
   * @param branchSlug - The branch slug to identify which branch's table (required for disambiguation)
   */
  createOrGetSessionByCode(tableCode: string, branchSlug?: string): Promise<TableSessionResponse> {
    const params = branchSlug ? `?branch_slug=${encodeURIComponent(branchSlug)}` : ''
    return request(`/tables/code/${encodeURIComponent(tableCode)}/session${params}`, {
      method: 'POST',
      skipDedup: true,
    })
  },
}

// =============================================================================
// Menu API - Public menu access
// =============================================================================

export const menuAPI = {
  /**
   * Get full menu for a branch by slug
   */
  getMenu(slug: string): Promise<MenuResponse> {
    return request(`/public/menu/${slug}`)
  },

  /**
   * Get allergens with cross-reactions for advanced filtering
   * Used by useAllergenFilter to support latex-fruit syndrome and similar
   */
  getAllergensWithCrossReactions(slug: string): Promise<AllergenWithCrossReactionsAPI[]> {
    return request(`/public/menu/${slug}/allergens`)
  },
}

// =============================================================================
// Kitchen API - Public endpoints
// =============================================================================

export const kitchenAPI = {
  /**
   * Get estimated wait time for a branch
   * No auth required - public endpoint
   */
  getEstimatedWait(branchId: number): Promise<{ estimated_minutes: number; queue_size: number }> {
    return request(`/kitchen/estimated-wait?branch_id=${branchId}`)
  },
}

// =============================================================================
// Diner API - Operations requiring table token
// =============================================================================

export const dinerAPI = {
  /**
   * Register a diner at the table session
   * Returns existing diner if local_id already exists (idempotent)
   */
  registerDiner(data: RegisterDinerRequest): Promise<DinerOutput> {
    return request('/diner/register', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },

  /**
   * Get all diners for a session
   */
  getSessionDiners(sessionId: number): Promise<DinerOutput[]> {
    return request(`/diner/session/${sessionId}/diners`, {
      tableAuth: true,
    })
  },

  /**
   * Submit a new round of orders
   */
  submitRound(data: SubmitRoundRequest): Promise<SubmitRoundResponse> {
    return request('/diner/rounds/submit', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },

  /**
   * Get all rounds for a session
   */
  getSessionRounds(sessionId: number): Promise<RoundOutput[]> {
    return request(`/diner/session/${sessionId}/rounds`, {
      tableAuth: true,
    })
  },

  /**
   * Get session total (for displaying current bill)
   */
  getSessionTotal(sessionId: number): Promise<SessionTotalResponse> {
    return request(`/diner/session/${sessionId}/total`, {
      tableAuth: true,
    })
  },

  /**
   * Get check detail (full bill breakdown)
   */
  getCheck(): Promise<CheckDetailOutput> {
    return request('/diner/check', {
      tableAuth: true,
    })
  },

  /**
   * Create a service call (call waiter, payment help)
   */
  createServiceCall(data: CreateServiceCallRequest): Promise<ServiceCallOutput> {
    return request('/diner/service-call', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },

  // === FASE 2: Implicit Preferences ===

  /**
   * Sync implicit preferences to backend for cross-session persistence
   * Called when user changes allergen/dietary/cooking filters
   */
  updatePreferences(data: UpdatePreferencesRequest): Promise<UpdatePreferencesResponse> {
    return request('/diner/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
      tableAuth: true,
    })
  },

  /**
   * Get saved preferences for a returning device
   * Called on app startup to pre-load filters
   */
  getDevicePreferences(deviceId: string): Promise<DevicePreferencesOutput> {
    return request(`/diner/device/${deviceId}/preferences`, {
      tableAuth: true,
    })
  },

  /**
   * Get visit history for a device (favorite products, stats)
   */
  getDeviceHistory(deviceId: string): Promise<DeviceHistoryResponse> {
    return request(`/diner/device/${deviceId}/history`, {
      tableAuth: true,
    })
  },

  // === Shared Cart (Real-time sync) ===

  /**
   * Add item to shared cart
   * Publishes CART_ITEM_ADDED event to all diners at the table
   */
  addToCart(data: AddToCartRequest): Promise<CartItemAPI> {
    return request('/diner/cart/add', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
    })
  },

  /**
   * Update cart item quantity/notes
   * Publishes CART_ITEM_UPDATED event to all diners at the table
   */
  updateCartItem(itemId: number, data: UpdateCartItemRequest): Promise<CartItemAPI> {
    return request(`/diner/cart/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      tableAuth: true,
    })
  },

  /**
   * Remove item from cart
   * Publishes CART_ITEM_REMOVED event to all diners at the table
   */
  removeCartItem(itemId: number): Promise<void> {
    return request(`/diner/cart/${itemId}`, {
      method: 'DELETE',
      tableAuth: true,
    })
  },

  /**
   * Get full cart (for reconnection/sync)
   */
  getCart(): Promise<CartOutput> {
    return request('/diner/cart', {
      tableAuth: true,
    })
  },

  /**
   * Clear cart (after round submission)
   * Publishes CART_CLEARED event to all diners at the table
   */
  clearCart(): Promise<void> {
    return request('/diner/cart', {
      method: 'DELETE',
      tableAuth: true,
    })
  },
}

// =============================================================================
// Customer API - FASE 4: Opt-in loyalty operations
// =============================================================================

export const customerAPI = {
  /**
   * Register a new customer (opt-in with consent)
   * Creates Customer and links to current diner
   */
  register(data: CustomerRegisterRequest): Promise<CustomerOutput> {
    return request('/customer/register', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },

  /**
   * Check if current device is linked to a customer
   * Used on app startup for personalized greeting
   * QA-HIGH-01 FIX: Include X-Device-Id header for device recognition
   */
  recognize(): Promise<CustomerRecognizeResponse> {
    return request('/customer/recognize', {
      tableAuth: true,
      headers: {
        'X-Device-Id': getDeviceId(),
      },
    })
  },

  /**
   * Get customer profile (requires linked customer)
   * QA-HIGH-01 FIX: Include X-Device-Id header
   */
  getMe(): Promise<CustomerOutput> {
    return request('/customer/me', {
      tableAuth: true,
      headers: {
        'X-Device-Id': getDeviceId(),
      },
    })
  },

  /**
   * Update customer preferences and AI settings
   * QA-HIGH-01 FIX: Include X-Device-Id header
   */
  updateMe(data: CustomerUpdateRequest): Promise<CustomerOutput> {
    return request('/customer/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
      tableAuth: true,
      headers: {
        'X-Device-Id': getDeviceId(),
      },
    })
  },

  /**
   * Get personalized suggestions (favorites, recommended)
   * QA-HIGH-01 FIX: Include X-Device-Id header
   */
  getSuggestions(): Promise<CustomerSuggestionsOutput> {
    return request('/customer/suggestions', {
      tableAuth: true,
      headers: {
        'X-Device-Id': getDeviceId(),
      },
    })
  },

  /**
   * Submit customer feedback (rating + optional comment)
   */
  submitFeedback(data: { rating: number; comment?: string }): Promise<{ id: number; rating: number; comment: string | null; created_at: string }> {
    return request('/diner/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },
}

// =============================================================================
// Billing API - Check and payment operations
// =============================================================================

export const billingAPI = {
  /**
   * Request the check (closes orders, creates check)
   * Note: session_id is extracted from X-Table-Token header by backend
   */
  requestCheck(): Promise<RequestCheckResponse> {
    return request('/billing/check/request', {
      method: 'POST',
      tableAuth: true,
      skipDedup: true,
    })
  },

  /**
   * Create Mercado Pago preference for online payment
   */
  createMercadoPagoPreference(data: MercadoPagoPreferenceRequest): Promise<MercadoPagoPreferenceResponse> {
    return request('/billing/mercadopago/preference', {
      method: 'POST',
      body: JSON.stringify(data),
      tableAuth: true,
      skipDedup: true,
    })
  },
}
