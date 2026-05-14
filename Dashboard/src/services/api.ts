/**
 * API service for connecting Dashboard to the backend.
 * Provides type-safe wrappers for all admin API endpoints.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// CRIT-02 FIX: Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000

// Store auth token in memory (will be persisted by authStore)
let authToken: string | null = null

// SEC-09: Refresh token lives exclusively in the HttpOnly cookie managed by
// the backend. The frontend never reads or stores it.

// CRIT-01 FIX: Use a proper mutex pattern for token refresh
let refreshPromise: Promise<string | null> | null = null

// Callback to notify authStore of logout (set by authStore)
let onTokenExpired: (() => void) | null = null

// DEF-DASH-01: Callback to notify when token is refreshed (for WebSocket reconnection)
let onTokenRefreshed: ((newToken: string) => void) | null = null

export function setOnTokenRefreshed(callback: ((newToken: string) => void) | null) {
  onTokenRefreshed = callback
}

export function setAuthToken(token: string | null) {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

export function setOnTokenExpired(callback: (() => void) | null) {
  onTokenExpired = callback
}

// CRIT-01 FIX: Atomic token refresh with proper mutex pattern
// The refreshPromise acts as a mutex - all concurrent requests wait for the same promise
// SEC-09: Refresh token is sent via HttpOnly cookie (credentials: 'include')
async function attemptTokenRefresh(): Promise<string | null> {
  // CRIT-01 FIX: If already refreshing, return the existing promise (no race condition)
  if (refreshPromise) {
    return refreshPromise
  }

  // CRIT-01 FIX: Create the promise BEFORE any async work to prevent race conditions
  refreshPromise = (async () => {
    try {
      // CRIT-02 FIX: Add timeout to refresh request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      // SEC-09: No body needed - refresh token is sent via HttpOnly cookie
      // credentials: 'include' ensures cookie is sent with request
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        // Refresh failed - token is invalid or cookie not present
        return null
      }

      const data = await response.json()

      // CRIT-03 FIX: Validate the new token before accepting it
      if (!data.access_token || typeof data.access_token !== 'string' || data.access_token.length < 10) {
        return null
      }

      authToken = data.access_token
      // SEC-09: refresh token is in the HttpOnly cookie only — we never read
      // it from the body. The cookie is rotated by the server on every
      // refresh call.
      // DEF-DASH-01: Notify WebSocket about new token
      if (onTokenRefreshed) {
        onTokenRefreshed(data.access_token)
      }
      return data.access_token
    } catch {
      return null
    } finally {
      // CRIT-01 FIX: Clear the mutex after completion
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// =============================================================================
// Base Fetch Wrapper
// =============================================================================

// CRIT-02 FIX: Add AbortController support and configurable timeout
interface FetchAPIOptions extends Omit<RequestInit, 'signal'> {
  timeout?: number
  signal?: AbortSignal
}

async function fetchAPI<T>(
  endpoint: string,
  options: FetchAPIOptions = {},
  retryOnUnauthorized = true
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...restOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Merge any existing headers
  if (restOptions.headers) {
    const existingHeaders = restOptions.headers as Record<string, string>
    Object.assign(headers, existingHeaders)
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  // CRIT-02 FIX: Create AbortController for timeout and cancellation support
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Allow external abort signal to also abort this request
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...restOptions,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && retryOnUnauthorized) {
      const newToken = await attemptTokenRefresh()
      if (newToken) {
        // Retry the request with the new token
        return fetchAPI<T>(endpoint, options, false)
      } else {
        // Refresh failed - notify authStore to logout
        if (onTokenExpired) {
          onTokenExpired()
        }
        throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Error desconocido' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  } catch (err) {
    clearTimeout(timeoutId)

    // CRIT-02 FIX: Handle abort errors with user-friendly message
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('La solicitud fue cancelada o excedió el tiempo límite')
    }
    throw err
  }
}

// =============================================================================
// Auth Types
// =============================================================================

interface LoginRequest {
  email: string
  password: string
}

export interface AuthUser {
  id: number
  email: string
  tenant_id: number
  branch_ids: number[]
  roles: string[]
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

// =============================================================================
// Auth API
// =============================================================================

// DEF-DASH-01: Response type for token refresh
// SEC-09: refresh_token is NOT consumed from the body — it lives in the
// HttpOnly cookie set by the server. We model it as never-present here.
interface RefreshResponse {
  access_token: string
}

export const authAPI = {
  async login(email: string, password: string, totpCode?: string): Promise<LoginResponse & { requires_2fa?: boolean }> {
    // Disable retry on 401 - login failures should show the real error,
    // not trigger token refresh (which can't work before authentication)
    const body: Record<string, string> = { email, password }
    if (totpCode) body.totp_code = totpCode
    const data = await fetchAPI<LoginResponse & { requires_2fa?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }, false)
    if (data.access_token) {
      setAuthToken(data.access_token)
    }
    return data
  },

  async getMe(): Promise<AuthUser> {
    return fetchAPI<AuthUser>('/api/auth/me')
  },

  async logout(): Promise<void> {
    try {
      // CRIT-FIX: Pass false to disable retry on 401 to prevent infinite loop
      // If token is already invalid, logout will get 401 which would trigger
      // onTokenExpired → logout → fetchAPI → 401 → onTokenExpired → infinite loop
      await fetchAPI('/api/auth/logout', { method: 'POST' }, false)
    } catch {
      // Ignore errors - token might already be invalid
    } finally {
      setAuthToken(null)
    }
  },

  // DEF-DASH-01: Proactive token refresh.
  // SEC-09: Returns only the new access_token; the refresh token is rotated
  // automatically inside the HttpOnly cookie by the backend.
  async refresh(): Promise<RefreshResponse | null> {
    const newToken = await attemptTokenRefresh()
    if (newToken) {
      return { access_token: newToken }
    }
    return null
  },

  // 2FA endpoints
  async setup2FA(): Promise<{ secret: string; otpauth_url: string; qr_url: string }> {
    return fetchAPI('/api/auth/2fa/setup', { method: 'POST' })
  },

  async verify2FA(code: string): Promise<{ enabled: boolean; message: string }> {
    return fetchAPI('/api/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },

  async disable2FA(code: string): Promise<{ enabled: boolean; message: string }> {
    return fetchAPI('/api/auth/2fa/disable', {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    })
  },
}

// =============================================================================
// Tenant Types
// =============================================================================

export interface Tenant {
  id: number
  name: string
  slug: string
  description: string | null
  logo: string | null
  theme_color: string
  created_at: string
}

export interface TenantUpdate {
  name?: string
  description?: string
  logo?: string
  theme_color?: string
}

// =============================================================================
// Branch Types
// =============================================================================

export interface Branch {
  id: number
  tenant_id: number
  name: string
  slug: string
  address: string | null
  phone: string | null
  timezone: string
  opening_time: string | null
  closing_time: string | null
  is_active: boolean
  created_at: string
}

export interface BranchCreate {
  name: string
  slug: string
  address?: string
  phone?: string
  timezone?: string
  opening_time?: string
  closing_time?: string
  is_active?: boolean
}

export interface BranchUpdate {
  name?: string
  slug?: string
  address?: string
  phone?: string
  timezone?: string
  opening_time?: string
  closing_time?: string
  is_active?: boolean
}

// =============================================================================
// Category Types
// =============================================================================

export interface Category {
  id: number
  tenant_id: number
  branch_id: number
  name: string
  icon: string | null
  image: string | null
  order: number
  is_active: boolean
}

export interface CategoryCreate {
  branch_id: number
  name: string
  icon?: string
  image?: string
  order?: number
  is_active?: boolean
}

export interface CategoryUpdate {
  name?: string
  icon?: string
  image?: string
  order?: number
  is_active?: boolean
}

// =============================================================================
// Subcategory Types
// =============================================================================

export interface Subcategory {
  id: number
  tenant_id: number
  category_id: number
  name: string
  image: string | null
  order: number
  is_active: boolean
}

export interface SubcategoryCreate {
  category_id: number
  name: string
  image?: string
  order?: number
  is_active?: boolean
}

export interface SubcategoryUpdate {
  name?: string
  image?: string
  order?: number
  is_active?: boolean
}

// =============================================================================
// Product Types
// =============================================================================

export interface BranchPrice {
  branch_id: number
  price_cents: number
  is_available: boolean
}

// Allergen presence types (Phase 0 - Canonical Model)
export type AllergenPresenceType = 'contains' | 'may_contain' | 'free_from'

export interface AllergenPresence {
  allergen_id: number
  allergen_name: string
  allergen_icon: string | null
  presence_type: AllergenPresenceType
}

export interface AllergenPresenceInput {
  allergen_id: number
  presence_type: AllergenPresenceType
}

export interface Product {
  id: number
  tenant_id: number
  name: string
  description: string | null
  image: string | null
  category_id: number
  subcategory_id: number | null
  featured: boolean
  popular: boolean
  badge: string | null
  seal: string | null
  allergen_ids: number[]             // Legacy format (backward compatible)
  allergens: AllergenPresence[]       // New format with presence types (Phase 0)
  // Recipe linkage (propuesta1.md)
  recipe_id: number | null
  inherits_from_recipe: boolean
  recipe_name: string | null
  is_active: boolean
  created_at: string
  branch_prices: BranchPrice[]
}

export interface ProductCreate {
  name: string
  description?: string
  image?: string
  category_id: number
  subcategory_id?: number
  featured?: boolean
  popular?: boolean
  badge?: string
  seal?: string
  allergen_ids?: number[]             // Legacy format (backward compatible)
  allergens?: AllergenPresenceInput[] // New format with presence types (Phase 0)
  // Recipe linkage (propuesta1.md)
  recipe_id?: number | null
  inherits_from_recipe?: boolean
  is_active?: boolean
  branch_prices?: BranchPrice[]
}

export interface ProductUpdate {
  name?: string
  description?: string
  image?: string
  category_id?: number
  subcategory_id?: number
  featured?: boolean
  popular?: boolean
  badge?: string
  seal?: string
  allergen_ids?: number[]             // Legacy format (backward compatible)
  allergens?: AllergenPresenceInput[] // New format with presence types (Phase 0)
  // Recipe linkage (propuesta1.md)
  recipe_id?: number | null
  inherits_from_recipe?: boolean
  is_active?: boolean
  branch_prices?: BranchPrice[]
}

// =============================================================================
// Allergen Types
// =============================================================================

export type AllergenSeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening'
export type CrossReactionProbability = 'low' | 'medium' | 'high'

export interface CrossReactionInfo {
  id: number
  cross_reacts_with_id: number
  cross_reacts_with_name: string
  probability: CrossReactionProbability
  notes: string | null
}

export interface Allergen {
  id: number
  tenant_id: number
  name: string
  icon: string | null
  description: string | null
  is_mandatory: boolean  // EU 1169/2011 - 14 mandatory allergens
  severity: AllergenSeverity  // mild, moderate, severe, life_threatening
  is_active: boolean
  cross_reactions: CrossReactionInfo[] | null
}

export interface AllergenCreate {
  name: string
  icon?: string
  description?: string
  is_mandatory?: boolean
  severity?: AllergenSeverity
  is_active?: boolean
}

export interface AllergenUpdate {
  name?: string
  icon?: string
  description?: string
  is_mandatory?: boolean
  severity?: AllergenSeverity
  is_active?: boolean
}

export interface CrossReaction {
  id: number
  tenant_id: number
  allergen_id: number
  allergen_name: string
  cross_reacts_with_id: number
  cross_reacts_with_name: string
  probability: CrossReactionProbability
  notes: string | null
  is_active: boolean
}

export interface CrossReactionCreate {
  allergen_id: number
  cross_reacts_with_id: number
  probability?: CrossReactionProbability
  notes?: string
}

export interface CrossReactionUpdate {
  probability?: CrossReactionProbability
  notes?: string
}

// =============================================================================
// Table Types
// =============================================================================

export interface TableData {
  id: number
  tenant_id: number
  branch_id: number
  code: string
  capacity: number
  sector: string | null
  status: string
  is_active: boolean
  // Active round statuses for order status calculation
  // Maps round_id -> status (PENDING, SUBMITTED, IN_KITCHEN, READY)
  active_round_statuses?: Record<number, string>
  // Waiter who confirmed the order (last name for display)
  confirmed_by_name?: string | null
}

export interface TableCreate {
  branch_id: number
  code: string
  capacity?: number
  sector?: string
  is_active?: boolean
}

export interface TableUpdate {
  code?: string
  capacity?: number
  sector?: string
  status?: string
  is_active?: boolean
}

// =============================================================================
// Sector Types
// =============================================================================

export interface SectorData {
  id: number
  tenant_id: number
  branch_id: number | null
  name: string
  prefix: string
  display_order: number
  is_active: boolean
  is_global: boolean
}

export interface SectorCreate {
  branch_id?: number | null
  name: string
  prefix: string
}

// =============================================================================
// Bulk Table Types
// =============================================================================

export interface TableBulkItem {
  sector_id: number
  capacity: number
  count: number
}

export interface TableBulkCreate {
  branch_id: number
  tables: TableBulkItem[]
}

export interface TableBulkResult {
  created_count: number
  tables: TableData[]
}

// =============================================================================
// Staff Types
// =============================================================================

export interface BranchRole {
  branch_id: number
  role: string
}

export interface Staff {
  id: number
  tenant_id: number
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  dni: string | null
  hire_date: string | null
  is_active: boolean
  created_at: string
  branch_roles: BranchRole[]
}

export interface StaffCreate {
  email: string
  password: string
  first_name?: string
  last_name?: string
  phone?: string
  dni?: string
  hire_date?: string
  is_active?: boolean
  branch_roles?: BranchRole[]
}

export interface StaffUpdate {
  email?: string
  password?: string
  first_name?: string
  last_name?: string
  phone?: string
  dni?: string
  hire_date?: string
  is_active?: boolean
  branch_roles?: BranchRole[]
}

// =============================================================================
// Round Types (for Kitchen)
// =============================================================================

interface RoundItem {
  id: number
  product_id: number
  product_name: string
  qty: number
  unit_price_cents: number
  notes: string | null
  is_voided?: boolean
  void_reason?: string | null
}

export interface Round {
  id: number
  round_number: number
  status: 'DRAFT' | 'PENDING' | 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED' | 'CANCELED'
  items: RoundItem[]
  created_at: string
  table_id: number | null
  table_code: string | null
  submitted_at: string | null
}

// =============================================================================
// Table Session Detail Types (for Tables page modal)
// =============================================================================

export interface DinerOutput {
  id: number
  session_id: number
  name: string
  color: string
  local_id: string | null
  joined_at: string
  device_id: string | null
}

export interface RoundItemDetail {
  id: number
  product_id: number
  product_name: string
  category_name: string | null
  qty: number
  unit_price_cents: number
  notes: string | null
  diner_id: number | null
  diner_name: string | null
  diner_color: string | null
}

export interface RoundDetail {
  id: number
  round_number: number
  status: 'DRAFT' | 'PENDING' | 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED' | 'CANCELED'
  created_at: string
  submitted_at: string | null
  items: RoundItemDetail[]
}

export interface TableSessionDetail {
  session_id: number
  table_id: number
  table_code: string
  status: 'OPEN' | 'PAYING' | 'CLOSED'
  opened_at: string
  diners: DinerOutput[]
  rounds: RoundDetail[]
  check_status: 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELED' | null
  total_cents: number
  paid_cents: number
}

// =============================================================================
// Admin API - Tenant
// =============================================================================

export const tenantAPI = {
  async get(): Promise<Tenant> {
    return fetchAPI<Tenant>('/api/admin/tenant')
  },

  async update(data: TenantUpdate): Promise<Tenant> {
    return fetchAPI<Tenant>('/api/admin/tenant', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },
}

// =============================================================================
// Admin API - Branches
// =============================================================================

export const branchAPI = {
  async list(includeDeleted: boolean = false): Promise<Branch[]> {
    const params = includeDeleted ? '?include_deleted=true' : ''
    return fetchAPI<Branch[]>(`/api/admin/branches${params}`)
  },

  async get(id: number): Promise<Branch> {
    return fetchAPI<Branch>(`/api/admin/branches/${id}`)
  },

  async create(data: BranchCreate): Promise<Branch> {
    return fetchAPI<Branch>('/api/admin/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: BranchUpdate): Promise<Branch> {
    return fetchAPI<Branch>(`/api/admin/branches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/branches/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('branches', id)
  },
}

// =============================================================================
// Admin API - Categories
// =============================================================================

export const categoryAPI = {
  async list(branchId?: number, includeDeleted: boolean = false): Promise<Category[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Category[]>(`/api/admin/categories${query}`)
  },

  async get(id: number): Promise<Category> {
    return fetchAPI<Category>(`/api/admin/categories/${id}`)
  },

  async create(data: CategoryCreate): Promise<Category> {
    return fetchAPI<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: CategoryUpdate): Promise<Category> {
    return fetchAPI<Category>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('categories', id)
  },
}

// =============================================================================
// Admin API - Subcategories
// =============================================================================

export const subcategoryAPI = {
  async list(categoryId?: number, includeDeleted: boolean = false): Promise<Subcategory[]> {
    const params = new URLSearchParams()
    if (categoryId) params.append('category_id', String(categoryId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Subcategory[]>(`/api/admin/subcategories${query}`)
  },

  async get(id: number): Promise<Subcategory> {
    return fetchAPI<Subcategory>(`/api/admin/subcategories/${id}`)
  },

  async create(data: SubcategoryCreate): Promise<Subcategory> {
    return fetchAPI<Subcategory>('/api/admin/subcategories', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: SubcategoryUpdate): Promise<Subcategory> {
    return fetchAPI<Subcategory>(`/api/admin/subcategories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/subcategories/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('subcategories', id)
  },
}

// =============================================================================
// Admin API - Products
// =============================================================================

export const productAPI = {
  async list(categoryId?: number, branchId?: number, includeDeleted: boolean = false): Promise<Product[]> {
    const params = new URLSearchParams()
    if (categoryId) params.append('category_id', String(categoryId))
    if (branchId) params.append('branch_id', String(branchId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Product[]>(`/api/admin/products${query}`)
  },

  async get(id: number): Promise<Product> {
    return fetchAPI<Product>(`/api/admin/products/${id}`)
  },

  async create(data: ProductCreate): Promise<Product> {
    return fetchAPI<Product>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: ProductUpdate): Promise<Product> {
    return fetchAPI<Product>(`/api/admin/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/products/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('products', id)
  },
}

// =============================================================================
// Admin API - Allergens
// =============================================================================

export const allergenAPI = {
  async list(includeDeleted: boolean = false, mandatoryOnly: boolean = false): Promise<Allergen[]> {
    const params = new URLSearchParams()
    if (includeDeleted) params.append('include_deleted', 'true')
    if (mandatoryOnly) params.append('mandatory_only', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Allergen[]>(`/api/admin/allergens${query}`)
  },

  async get(id: number): Promise<Allergen> {
    return fetchAPI<Allergen>(`/api/admin/allergens/${id}`)
  },

  async create(data: AllergenCreate): Promise<Allergen> {
    return fetchAPI<Allergen>('/api/admin/allergens', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: AllergenUpdate): Promise<Allergen> {
    return fetchAPI<Allergen>(`/api/admin/allergens/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/allergens/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('allergens', id)
  },
}

// =============================================================================
// Admin API - Cross-Reactions
// =============================================================================

export const crossReactionAPI = {
  async list(allergenId?: number, includeDeleted: boolean = false): Promise<CrossReaction[]> {
    const params = new URLSearchParams()
    if (allergenId) params.append('allergen_id', String(allergenId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<CrossReaction[]>(`/api/admin/allergens/cross-reactions${query}`)
  },

  async create(data: CrossReactionCreate): Promise<CrossReaction> {
    return fetchAPI<CrossReaction>('/api/admin/allergens/cross-reactions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: CrossReactionUpdate): Promise<CrossReaction> {
    return fetchAPI<CrossReaction>(`/api/admin/allergens/cross-reactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/allergens/cross-reactions/${id}`, {
      method: 'DELETE',
    })
  },
}

// =============================================================================
// Admin API - Tables
// =============================================================================

export const tableAPI = {
  async list(branchId?: number, includeDeleted: boolean = false): Promise<TableData[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<TableData[]>(`/api/admin/tables${query}`)
  },

  async get(id: number): Promise<TableData> {
    return fetchAPI<TableData>(`/api/admin/tables/${id}`)
  },

  async create(data: TableCreate): Promise<TableData> {
    return fetchAPI<TableData>('/api/admin/tables', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: TableUpdate): Promise<TableData> {
    return fetchAPI<TableData>(`/api/admin/tables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/tables/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('tables', id)
  },

  async createBatch(data: TableBulkCreate): Promise<TableBulkResult> {
    return fetchAPI<TableBulkResult>('/api/admin/tables/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getSessionDetail(tableId: number): Promise<TableSessionDetail> {
    return fetchAPI<TableSessionDetail>(`/api/waiter/tables/${tableId}/session`)
  },

  async getQRUrl(tableId: number): Promise<{ url: string; table_code: string; branch_slug: string }> {
    return fetchAPI<{ url: string; table_code: string; branch_slug: string }>(`/api/admin/tables/${tableId}/qr-url`)
  },
}

// =============================================================================
// Admin API - Sectors
// =============================================================================

export const sectorAPI = {
  async list(branchId?: number): Promise<SectorData[]> {
    const params = branchId ? `?branch_id=${branchId}` : ''
    return fetchAPI<SectorData[]>(`/api/admin/sectors${params}`)
  },

  async create(data: SectorCreate): Promise<SectorData> {
    return fetchAPI<SectorData>('/api/admin/sectors', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/sectors/${id}`, {
      method: 'DELETE',
    })
  },
}

// =============================================================================
// Admin API - Staff
// =============================================================================

export const staffAPI = {
  async list(branchId?: number, includeDeleted: boolean = false): Promise<Staff[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Staff[]>(`/api/admin/staff${query}`)
  },

  async get(id: number): Promise<Staff> {
    return fetchAPI<Staff>(`/api/admin/staff/${id}`)
  },

  async create(data: StaffCreate): Promise<Staff> {
    return fetchAPI<Staff>('/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: StaffUpdate): Promise<Staff> {
    return fetchAPI<Staff>(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/staff/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('staff', id)
  },
}

// =============================================================================
// Kitchen API
// =============================================================================

export const kitchenAPI = {
  async getPendingRounds(): Promise<Round[]> {
    return fetchAPI<Round[]>('/api/kitchen/rounds')
  },

  async updateRoundStatus(
    roundId: number,
    status: 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED'
  ): Promise<Round> {
    return fetchAPI<Round>(`/api/kitchen/rounds/${roundId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
  },

  async getRound(roundId: number): Promise<Round> {
    return fetchAPI<Round>(`/api/kitchen/rounds/${roundId}`)
  },

  async voidItem(
    itemId: number,
    reason: string
  ): Promise<{ success: boolean; item_id: number; round_id: number; round_canceled: boolean; message: string }> {
    return fetchAPI(`/api/waiter/rounds/items/${itemId}/void`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    })
  },
}

// =============================================================================
// Orders Types (for Orders page)
// =============================================================================

interface OrderItem {
  id: number
  product_id: number
  product_name: string
  qty: number
  unit_price_cents: number
  notes: string | null
  diner_name: string | null
}

export interface ActiveOrder {
  id: number
  round_number: number
  status: string
  table_id: number | null
  table_code: string | null
  branch_id: number
  branch_name: string
  session_id: number
  items: OrderItem[]
  submitted_at: string | null
  total_cents: number
}

export interface OrderStats {
  total_active: number
  pending: number
  in_kitchen: number
  ready: number
}

// =============================================================================
// Orders API
// =============================================================================

export const ordersAPI = {
  async getStats(branchId?: number): Promise<OrderStats> {
    const params = branchId ? `?branch_id=${branchId}` : ''
    return fetchAPI<OrderStats>(`/api/admin/orders/stats${params}`)
  },

  async getActiveOrders(branchId?: number, statusFilter?: string): Promise<ActiveOrder[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (statusFilter) params.append('status_filter', statusFilter)
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<ActiveOrder[]>(`/api/admin/orders${query}`)
  },
}

// =============================================================================
// Reports Types
// =============================================================================

export interface ReportsSummary {
  total_revenue_cents: number
  total_orders: number
  avg_order_value_cents: number
  total_sessions: number
  busiest_hour: number | null
}

export interface DailySales {
  date: string
  total_sales_cents: number
  order_count: number
  avg_order_cents: number
}

export interface TopProduct {
  product_id: number
  product_name: string
  quantity_sold: number
  total_revenue_cents: number
}

export interface HourlyOrders {
  hour: number
  order_count: number
}

export interface WaiterPerformance {
  user_id: number
  user_name: string
  total_tables_served: number
  total_rounds_processed: number
  total_revenue_cents: number
  total_tips_cents: number
  avg_service_time_minutes: number
  total_service_calls: number
  avg_response_time_seconds: number
}

export interface AuditLogEntry {
  id: number
  tenant_id: number
  user_id: number | null
  user_email: string | null
  action: string
  entity_type: string
  entity_id: number | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// =============================================================================
// Reports API
// =============================================================================

// =============================================================================
// Restore Types and API
// =============================================================================

export interface RestoreResponse {
  success: boolean
  message: string
  entity_type: string
  entity_id: number
}

export type EntityType =
  | 'branches'
  | 'categories'
  | 'subcategories'
  | 'products'
  | 'allergens'
  | 'tables'
  | 'staff'
  | 'promotions'

export const restoreAPI = {
  async restore(entityType: EntityType, entityId: number): Promise<RestoreResponse> {
    return fetchAPI<RestoreResponse>(`/api/admin/${entityType}/${entityId}/restore`, {
      method: 'POST',
    })
  },
}

export const reportsAPI = {
  async getSummary(branchId?: number, days: number = 30): Promise<ReportsSummary> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    params.append('days', String(days))
    return fetchAPI<ReportsSummary>(`/api/admin/reports/summary?${params.toString()}`)
  },

  async getDailySales(branchId?: number, days: number = 30): Promise<DailySales[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    params.append('days', String(days))
    return fetchAPI<DailySales[]>(`/api/admin/reports/daily-sales?${params.toString()}`)
  },

  async getTopProducts(branchId?: number, days: number = 30, limit: number = 10): Promise<TopProduct[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    params.append('days', String(days))
    params.append('limit', String(limit))
    return fetchAPI<TopProduct[]>(`/api/admin/reports/top-products?${params.toString()}`)
  },

  async getOrdersByHour(branchId?: number, days: number = 30): Promise<HourlyOrders[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    params.append('days', String(days))
    return fetchAPI<HourlyOrders[]>(`/api/admin/reports/orders-by-hour?${params.toString()}`)
  },

  async getWaiterPerformance(
    branchId?: number,
    days: number = 30,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<WaiterPerformance[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    params.append('days', String(days))
    if (dateFrom) params.append('date_from', dateFrom)
    if (dateTo) params.append('date_to', dateTo)
    return fetchAPI<WaiterPerformance[]>(
      `/api/admin/reports/waiter-performance?${params.toString()}`,
    )
  },
}

export const auditAPI = {
  async getAuditLog(params: {
    entity_type?: string
    action?: string
    user_id?: number
    limit?: number
    offset?: number
  }): Promise<AuditLogEntry[]> {
    const searchParams = new URLSearchParams()
    if (params.entity_type) searchParams.append('entity_type', params.entity_type)
    if (params.action) searchParams.append('action', params.action)
    if (params.user_id) searchParams.append('user_id', String(params.user_id))
    searchParams.append('limit', String(params.limit ?? 100))
    searchParams.append('offset', String(params.offset ?? 0))
    return fetchAPI<AuditLogEntry[]>(`/api/admin/audit-log?${searchParams.toString()}`)
  },
}

// =============================================================================
// Promotion Types
// =============================================================================

export interface PromotionItem {
  product_id: number
  quantity: number
}

export interface Promotion {
  id: number
  tenant_id: number
  name: string
  description: string | null
  price_cents: number
  image: string | null
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  promotion_type_id: string | null
  branch_ids: number[]
  items: PromotionItem[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PromotionCreate {
  name: string
  description?: string
  price_cents: number
  image?: string
  start_date: string
  end_date: string
  start_time?: string
  end_time?: string
  promotion_type_id?: string
  branch_ids?: number[]
  items?: PromotionItem[]
  is_active?: boolean
}

export interface PromotionUpdate {
  name?: string
  description?: string
  price_cents?: number
  image?: string
  start_date?: string
  end_date?: string
  start_time?: string
  end_time?: string
  promotion_type_id?: string
  branch_ids?: number[]
  items?: PromotionItem[]
  is_active?: boolean
}

// =============================================================================
// Admin API - Promotions
// =============================================================================

export const promotionAPI = {
  async list(branchId?: number, includeDeleted: boolean = false): Promise<Promotion[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Promotion[]>(`/api/admin/promotions${query}`)
  },

  async get(id: number): Promise<Promotion> {
    return fetchAPI<Promotion>(`/api/admin/promotions/${id}`)
  },

  async create(data: PromotionCreate): Promise<Promotion> {
    return fetchAPI<Promotion>('/api/admin/promotions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: PromotionUpdate): Promise<Promotion> {
    return fetchAPI<Promotion>(`/api/admin/promotions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/promotions/${id}`, {
      method: 'DELETE',
    })
  },

  async restore(id: number): Promise<RestoreResponse> {
    return restoreAPI.restore('promotions', id)
  },
}

// =============================================================================
// Exclusion Types
// =============================================================================

export interface CategoryExclusionSummary {
  category_id: number
  category_name: string
  excluded_branch_ids: number[]
}

export interface SubcategoryExclusionSummary {
  subcategory_id: number
  subcategory_name: string
  category_id: number
  category_name: string
  excluded_branch_ids: number[]
}

export interface ExclusionOverview {
  category_exclusions: CategoryExclusionSummary[]
  subcategory_exclusions: SubcategoryExclusionSummary[]
}

export interface ExclusionBulkUpdate {
  excluded_branch_ids: number[]
}

// =============================================================================
// Admin API - Exclusions
// =============================================================================

export const exclusionAPI = {
  /**
   * Get complete overview of all category and subcategory exclusions.
   */
  async getOverview(): Promise<ExclusionOverview> {
    return fetchAPI<ExclusionOverview>('/api/admin/exclusions')
  },

  /**
   * Get exclusion details for a specific category.
   */
  async getCategoryExclusions(categoryId: number): Promise<CategoryExclusionSummary> {
    return fetchAPI<CategoryExclusionSummary>(`/api/admin/exclusions/categories/${categoryId}`)
  },

  /**
   * Update exclusions for a category.
   * Replaces all existing exclusions with the provided list.
   */
  async updateCategoryExclusions(
    categoryId: number,
    excludedBranchIds: number[]
  ): Promise<CategoryExclusionSummary> {
    return fetchAPI<CategoryExclusionSummary>(`/api/admin/exclusions/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify({ excluded_branch_ids: excludedBranchIds } as ExclusionBulkUpdate),
    })
  },

  /**
   * Get exclusion details for a specific subcategory.
   */
  async getSubcategoryExclusions(subcategoryId: number): Promise<SubcategoryExclusionSummary> {
    return fetchAPI<SubcategoryExclusionSummary>(`/api/admin/exclusions/subcategories/${subcategoryId}`)
  },

  /**
   * Update exclusions for a subcategory.
   * Replaces all existing exclusions with the provided list.
   */
  async updateSubcategoryExclusions(
    subcategoryId: number,
    excludedBranchIds: number[]
  ): Promise<SubcategoryExclusionSummary> {
    return fetchAPI<SubcategoryExclusionSummary>(`/api/admin/exclusions/subcategories/${subcategoryId}`, {
      method: 'PUT',
      body: JSON.stringify({ excluded_branch_ids: excludedBranchIds } as ExclusionBulkUpdate),
    })
  },
}


// =============================================================================
// Waiter Sector Assignment Types
// =============================================================================

export interface WaiterInfo {
  id: number
  name: string
  email: string
}

export interface SectorWithWaiters {
  sector_id: number
  sector_name: string
  sector_prefix: string
  waiters: WaiterInfo[]
}

export interface BranchAssignmentOverview {
  branch_id: number
  branch_name: string
  assignment_date: string
  shift: string | null
  sectors: SectorWithWaiters[]
  unassigned_waiters: WaiterInfo[]
}

export interface WaiterSectorAssignment {
  id: number
  tenant_id: number
  branch_id: number
  sector_id: number
  sector_name: string
  sector_prefix: string
  waiter_id: number
  waiter_name: string
  waiter_email: string
  assignment_date: string
  shift: string | null
  is_active: boolean
}

export interface BulkAssignmentRequest {
  branch_id: number
  assignment_date: string
  shift: string | null
  assignments: Array<{
    sector_id: number
    waiter_ids: number[]
  }>
}

export interface BulkAssignmentResult {
  created_count: number
  skipped_count: number
  assignments: WaiterSectorAssignment[]
}

// =============================================================================
// Waiter Sector Assignment API
// =============================================================================

export const assignmentAPI = {
  /**
   * Get all waiter-sector assignments for a branch on a given date.
   */
  async getOverview(
    branchId: number,
    assignmentDate: string,
    shift?: string | null
  ): Promise<BranchAssignmentOverview> {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      assignment_date: assignmentDate,
    })
    if (shift) {
      params.append('shift', shift)
    }
    return fetchAPI<BranchAssignmentOverview>(`/api/admin/assignments?${params}`)
  },

  /**
   * Create multiple waiter-sector assignments at once.
   */
  async createBulk(data: BulkAssignmentRequest): Promise<BulkAssignmentResult> {
    return fetchAPI<BulkAssignmentResult>('/api/admin/assignments/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * Delete a single assignment.
   */
  async delete(assignmentId: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/assignments/${assignmentId}`, {
      method: 'DELETE',
    })
  },

  /**
   * Delete all assignments for a branch on a given date.
   */
  async deleteBulk(
    branchId: number,
    assignmentDate: string,
    shift?: string | null
  ): Promise<{ deleted_count: number }> {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      assignment_date: assignmentDate,
    })
    if (shift) {
      params.append('shift', shift)
    }
    return fetchAPI<{ deleted_count: number }>(`/api/admin/assignments-bulk?${params}`, {
      method: 'DELETE',
    })
  },

  /**
   * Copy assignments from one date to another.
   */
  async copy(
    branchId: number,
    fromDate: string,
    toDate: string,
    shift?: string | null
  ): Promise<BulkAssignmentResult> {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      from_date: fromDate,
      to_date: toDate,
    })
    if (shift) {
      params.append('shift', shift)
    }
    return fetchAPI<BulkAssignmentResult>(`/api/admin/assignments/copy?${params}`, {
      method: 'POST',
    })
  },
}

// =============================================================================
// Recipe Types (matches backend RecipeOutput schema)
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

// Allergen info returned from Recipe API (M:N relationship)
export interface RecipeAllergenInfo {
  id: number
  name: string
  icon: string | null
}

// RecipeModification is imported from types/index.ts
// Using inline type to match backend response format
export interface Recipe {
  id: number
  tenant_id: number
  branch_id: number
  branch_name: string | null
  product_id: number | null
  product_name: string | null
  subcategory_id: number | null
  subcategory_name: string | null
  category_id: number | null
  category_name: string | null
  name: string
  description: string | null
  short_description: string | null
  image: string | null
  cuisine_type: string | null
  difficulty: string | null
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  servings: number | null
  calories_per_serving: number | null
  ingredients: RecipeIngredient[] | null
  preparation_steps: RecipePreparationStep[] | null
  chef_notes: string | null
  presentation_tips: string | null
  storage_instructions: string | null
  allergen_ids: number[] | null  // IDs for form binding (M:N relationship)
  allergens: RecipeAllergenInfo[] | null  // Full allergen info for display
  dietary_tags: string[] | null
  // Sensory profile (Phase 3)
  flavors: string[] | null
  textures: string[] | null
  // Cooking info
  cooking_methods: string[] | null
  uses_oil: boolean | null
  // Celiac safety
  is_celiac_safe: boolean | null
  allergen_notes: string | null
  // Modifications and warnings (Phase 4)
  modifications: Array<{
    action: 'remove' | 'substitute'
    item: string
    allowed: boolean
  }> | null
  warnings: string[] | null
  // Cost and yield
  cost_cents: number | null
  suggested_price_cents: number | null
  yield_quantity: string | null
  yield_unit: string | null
  portion_size: string | null
  // RAG config (Phase 5)
  risk_level: 'low' | 'medium' | 'high' | null
  custom_rag_disclaimer: string | null
  // Status
  is_active: boolean
  is_ingested: boolean
  last_ingested_at: string | null
  created_at: string
  created_by_email: string | null
}

export interface RecipeCreate {
  branch_id: number
  name: string
  description?: string
  image?: string
  product_id?: number | null
  subcategory_id?: number | null
  cuisine_type?: string
  difficulty?: string
  prep_time_minutes?: number
  cook_time_minutes?: number
  servings?: number
  calories_per_serving?: number
  ingredients?: RecipeIngredient[]
  preparation_steps?: RecipePreparationStep[]
  chef_notes?: string
  presentation_tips?: string
  storage_instructions?: string
  allergen_ids?: number[]  // M:N relationship via RecipeAllergen
  dietary_tags?: string[]
  cost_cents?: number
}

export interface RecipeUpdate {
  name?: string
  description?: string
  image?: string
  product_id?: number | null
  subcategory_id?: number | null
  cuisine_type?: string
  difficulty?: string
  prep_time_minutes?: number
  cook_time_minutes?: number
  servings?: number
  calories_per_serving?: number
  ingredients?: RecipeIngredient[]
  preparation_steps?: RecipePreparationStep[]
  chef_notes?: string
  presentation_tips?: string
  storage_instructions?: string
  allergen_ids?: number[]  // M:N relationship via RecipeAllergen
  dietary_tags?: string[]
  cost_cents?: number
}

// =============================================================================
// Recipe API
// =============================================================================

export const recipeAPI = {
  async list(branchId?: number, category?: string): Promise<Recipe[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', String(branchId))
    if (category) params.append('category', category)
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Recipe[]>(`/api/recipes${query}`)
  },

  async get(id: number): Promise<Recipe> {
    return fetchAPI<Recipe>(`/api/recipes/${id}`)
  },

  async create(data: RecipeCreate): Promise<Recipe> {
    return fetchAPI<Recipe>('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: RecipeUpdate): Promise<Recipe> {
    return fetchAPI<Recipe>(`/api/recipes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/recipes/${id}`, {
      method: 'DELETE',
    })
  },

  async ingest(id: number): Promise<Recipe> {
    return fetchAPI<Recipe>(
      `/api/recipes/${id}/ingest`,
      { method: 'POST' }
    )
  },

  async getCategories(): Promise<string[]> {
    return fetchAPI<string[]>('/api/recipes/categories/list')
  },

  // Recipe-to-Product Derivation (propuesta1.md)
  async deriveProduct(
    recipeId: number,
    data: {
      name: string
      category_id: number
      subcategory_id?: number
      branch_prices?: Array<{ branch_id: number; price_cents: number; is_available?: boolean }>
    }
  ): Promise<{
    id: number
    name: string
    recipe_id: number
    recipe_name: string
    inherits_from_recipe: boolean
    category_id: number
    subcategory_id: number | null
    message: string
  }> {
    return fetchAPI(`/api/recipes/${recipeId}/derive-product`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async listDerivedProducts(recipeId: number): Promise<
    Array<{
      id: number
      name: string
      description: string | null
      category_id: number
      subcategory_id: number | null
      inherits_from_recipe: boolean
      is_active: boolean
    }>
  > {
    return fetchAPI(`/api/recipes/${recipeId}/products`)
  },
}

// =============================================================================
// Ingredient Types (Phase 1 - Canonical Product Model)
// =============================================================================

export interface IngredientGroup {
  id: number
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
}

export interface IngredientGroupCreate {
  name: string
  description?: string
  icon?: string
}

export interface SubIngredient {
  id: number
  ingredient_id: number
  name: string
  description: string | null
  is_active: boolean
}

export interface SubIngredientCreate {
  name: string
  description?: string
}

export interface Ingredient {
  id: number
  tenant_id: number
  name: string
  description: string | null
  group_id: number | null
  group_name: string | null
  is_processed: boolean
  is_active: boolean
  created_at: string
  sub_ingredients: SubIngredient[]
}

export interface IngredientCreate {
  name: string
  description?: string
  group_id?: number
  is_processed?: boolean
}

export interface IngredientUpdate {
  name?: string
  description?: string
  group_id?: number | null
  is_processed?: boolean
  is_active?: boolean
}

// =============================================================================
// Ingredient API
// =============================================================================

export const ingredientAPI = {
  // Ingredient Groups
  async listGroups(): Promise<IngredientGroup[]> {
    return fetchAPI<IngredientGroup[]>('/api/admin/ingredients/groups')
  },

  async createGroup(data: IngredientGroupCreate): Promise<IngredientGroup> {
    return fetchAPI<IngredientGroup>('/api/admin/ingredients/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Ingredients
  async list(groupId?: number, includeDeleted: boolean = false): Promise<Ingredient[]> {
    const params = new URLSearchParams()
    if (groupId) params.append('group_id', String(groupId))
    if (includeDeleted) params.append('include_deleted', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchAPI<Ingredient[]>(`/api/admin/ingredients${query}`)
  },

  async get(id: number): Promise<Ingredient> {
    return fetchAPI<Ingredient>(`/api/admin/ingredients/${id}`)
  },

  async create(data: IngredientCreate): Promise<Ingredient> {
    return fetchAPI<Ingredient>('/api/admin/ingredients', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: IngredientUpdate): Promise<Ingredient> {
    return fetchAPI<Ingredient>(`/api/admin/ingredients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/ingredients/${id}`, {
      method: 'DELETE',
    })
  },

  // Sub-ingredients
  async createSubIngredient(ingredientId: number, data: SubIngredientCreate): Promise<SubIngredient> {
    return fetchAPI<SubIngredient>(`/api/admin/ingredients/${ingredientId}/sub`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async deleteSubIngredient(ingredientId: number, subIngredientId: number): Promise<void> {
    return fetchAPI<void>(`/api/admin/ingredients/${ingredientId}/sub/${subIngredientId}`, {
      method: 'DELETE',
    })
  },
}

// =============================================================================
// Catalogs API (Cooking Methods, Flavors, Textures) - Phase 3
// =============================================================================

export interface CatalogCookingMethod {
  id: number
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
}

export interface CatalogFlavorProfile {
  id: number
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
}

export interface CatalogTextureProfile {
  id: number
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
}

export interface CatalogCuisineType {
  id: number
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
}

export const catalogsAPI = {
  // Cooking Methods
  async listCookingMethods(): Promise<CatalogCookingMethod[]> {
    return fetchAPI<CatalogCookingMethod[]>('/api/admin/catalogs/cooking-methods')
  },

  // Flavor Profiles
  async listFlavorProfiles(): Promise<CatalogFlavorProfile[]> {
    return fetchAPI<CatalogFlavorProfile[]>('/api/admin/catalogs/flavor-profiles')
  },

  // Texture Profiles
  async listTextureProfiles(): Promise<CatalogTextureProfile[]> {
    return fetchAPI<CatalogTextureProfile[]>('/api/admin/catalogs/texture-profiles')
  },

  // Cuisine Types
  async listCuisineTypes(): Promise<CatalogCuisineType[]> {
    return fetchAPI<CatalogCuisineType[]>('/api/admin/catalogs/cuisine-types')
  },
}

// =============================================================================
// Tips Types & API
// =============================================================================

export interface Tip {
  id: number
  branch_id: number
  session_id: number
  waiter_id: number
  waiter_name: string
  table_code: string
  amount_cents: number
  payment_method: string
  created_at: string
  distributed: boolean
}

export interface TipCreate {
  session_id: number
  amount_cents: number
  payment_method: string
  waiter_id: number
}

export interface TipPool {
  id: number
  tenant_id: number
  name: string
  waiter_pct: number
  kitchen_pct: number
  other_pct: number
  is_active: boolean
}

export interface TipPoolCreate {
  name: string
  waiter_pct: number
  kitchen_pct: number
  other_pct: number
}

export interface TipPoolUpdate {
  name?: string
  waiter_pct?: number
  kitchen_pct?: number
  other_pct?: number
}

export const tipsAPI = {
  async list(branchId: string, params?: Record<string, string>): Promise<Tip[]> {
    const query = params ? '&' + new URLSearchParams(params).toString() : ''
    return fetchAPI<Tip[]>(`/api/admin/tips?branch_id=${branchId}${query}`)
  },

  async create(data: TipCreate): Promise<Tip> {
    return fetchAPI<Tip>('/api/admin/tips', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async distribute(tipId: string, poolId: string): Promise<void> {
    return fetchAPI('/api/admin/tips/distribute', {
      method: 'POST',
      body: JSON.stringify({ tip_id: tipId, pool_id: poolId }),
    })
  },

  async report(branchId: string, dateFrom: string, dateTo: string): Promise<unknown> {
    return fetchAPI(`/api/admin/tips/report?branch_id=${branchId}&date_from=${dateFrom}&date_to=${dateTo}`)
  },

  pools: {
    async list(): Promise<TipPool[]> {
      return fetchAPI<TipPool[]>('/api/admin/tip-pools')
    },

    async create(data: TipPoolCreate): Promise<TipPool> {
      return fetchAPI<TipPool>('/api/admin/tip-pools', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: TipPoolUpdate): Promise<TipPool> {
      return fetchAPI<TipPool>(`/api/admin/tip-pools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/tip-pools/${id}`, { method: 'DELETE' })
    },
  },
}

// =============================================================================
// Fiscal Types & API
// =============================================================================

export interface FiscalInvoice {
  id: number
  branch_id: number
  number: string
  type: 'A' | 'B' | 'C'
  date: string
  net_amount_cents: number
  iva_amount_cents: number
  total_amount_cents: number
  cae: string | null
  cae_expiry: string | null
  status: 'AUTHORIZED' | 'DRAFT' | 'REJECTED' | 'VOIDED'
  customer_doc: string | null
  check_id: number | null
}

export interface FiscalInvoiceCreate {
  check_id: number
  type: 'A' | 'B' | 'C'
  customer_doc?: string
}

export interface FiscalPoint {
  id: number
  tenant_id: number
  number: number
  type: string
  cuit: string
  business_name: string
  iva_condition: string
  is_active: boolean
}

export interface FiscalPointCreate {
  number: number
  type: string
  cuit: string
  business_name: string
  iva_condition: string
}

export interface FiscalPointUpdate {
  number?: number
  type?: string
  cuit?: string
  business_name?: string
  iva_condition?: string
}

export const fiscalAPI = {
  invoices: {
    async list(branchId: string, params?: Record<string, string>): Promise<FiscalInvoice[]> {
      const query = params ? '&' + new URLSearchParams(params).toString() : ''
      return fetchAPI<FiscalInvoice[]>(`/api/admin/fiscal/invoices?branch_id=${branchId}${query}`)
    },

    async create(data: FiscalInvoiceCreate): Promise<FiscalInvoice> {
      return fetchAPI<FiscalInvoice>('/api/admin/fiscal/invoice', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async get(id: string): Promise<FiscalInvoice> {
      return fetchAPI<FiscalInvoice>(`/api/admin/fiscal/invoices/${id}`)
    },
  },

  creditNotes: {
    async create(data: { invoice_id: number; amount_cents: number; reason: string }): Promise<unknown> {
      return fetchAPI('/api/admin/fiscal/credit-note', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
  },

  points: {
    async list(): Promise<FiscalPoint[]> {
      return fetchAPI<FiscalPoint[]>('/api/admin/fiscal/points')
    },

    async create(data: FiscalPointCreate): Promise<FiscalPoint> {
      return fetchAPI<FiscalPoint>('/api/admin/fiscal/points', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: FiscalPointUpdate): Promise<FiscalPoint> {
      return fetchAPI<FiscalPoint>(`/api/admin/fiscal/points/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/fiscal/points/${id}`, { method: 'DELETE' })
    },
  },

  async monthlyReport(branchId: string, year: number, month: number): Promise<unknown> {
    return fetchAPI(`/api/admin/fiscal/report/monthly?branch_id=${branchId}&year=${year}&month=${month}`)
  },
}

// =============================================================================
// Scheduling Types & API
// =============================================================================

export interface ShiftData {
  id: number
  branch_id: number
  user_id: number
  user_name: string
  day: string
  start_time: string
  end_time: string
  role: string
}

export interface ShiftCreate {
  branch_id: number
  user_id: number
  day: string
  start_time: string
  end_time: string
  role: string
}

export interface ShiftUpdate {
  day?: string
  start_time?: string
  end_time?: string
  role?: string
}

export interface ShiftTemplateData {
  id: number
  tenant_id: number
  name: string
  items: { day_of_week: number; start_time: string; end_time: string; role: string; min_staff: number }[]
  is_active: boolean
}

export interface ShiftTemplateCreate {
  name: string
  items?: { day_of_week: number; start_time: string; end_time: string; role: string; min_staff: number }[]
}

export interface ShiftTemplateUpdate {
  name?: string
  items?: { day_of_week: number; start_time: string; end_time: string; role: string; min_staff: number }[]
  is_active?: boolean
}

export const schedulingAPI = {
  shifts: {
    async list(branchId: string, params?: Record<string, string>): Promise<ShiftData[]> {
      const query = params ? '&' + new URLSearchParams(params).toString() : ''
      return fetchAPI<ShiftData[]>(`/api/admin/shifts?branch_id=${branchId}${query}`)
    },

    async create(data: ShiftCreate): Promise<ShiftData> {
      return fetchAPI<ShiftData>('/api/admin/shifts', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: ShiftUpdate): Promise<ShiftData> {
      return fetchAPI<ShiftData>(`/api/admin/shifts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    },
  },

  async applyTemplate(templateId: string, weekStart: string): Promise<void> {
    return fetchAPI('/api/admin/shifts/apply-template', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, week_start: weekStart }),
    })
  },

  templates: {
    async list(): Promise<ShiftTemplateData[]> {
      return fetchAPI<ShiftTemplateData[]>('/api/admin/shift-templates')
    },

    async create(data: ShiftTemplateCreate): Promise<ShiftTemplateData> {
      return fetchAPI<ShiftTemplateData>('/api/admin/shift-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: ShiftTemplateUpdate): Promise<ShiftTemplateData> {
      return fetchAPI<ShiftTemplateData>(`/api/admin/shift-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/shift-templates/${id}`, { method: 'DELETE' })
    },
  },

  attendance: {
    async list(branchId: string, params?: Record<string, string>): Promise<unknown[]> {
      const query = params ? '&' + new URLSearchParams(params).toString() : ''
      return fetchAPI<unknown[]>(`/api/admin/attendance?branch_id=${branchId}${query}`)
    },

    async clockIn(userId: number, branchId: number): Promise<unknown> {
      return fetchAPI('/api/admin/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, branch_id: branchId }),
      })
    },

    async clockOut(userId: number): Promise<unknown> {
      return fetchAPI('/api/admin/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      })
    },
  },

  async weekly(branchId: string, weekStart: string): Promise<unknown> {
    return fetchAPI(`/api/admin/scheduling/weekly?branch_id=${branchId}&week_start=${weekStart}`)
  },

  async laborCost(branchId: string, dateFrom: string, dateTo: string): Promise<unknown> {
    return fetchAPI(`/api/admin/scheduling/labor-cost?branch_id=${branchId}&date_from=${dateFrom}&date_to=${dateTo}`)
  },
}

// =============================================================================
// CRM Types & API
// =============================================================================

export interface CustomerData {
  id: number
  tenant_id: number
  name: string
  email: string | null
  phone: string | null
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'
  points: number
  total_visits: number
  total_spent_cents: number
  last_visit: string | null
  created_at: string
  is_active: boolean
}

export interface CustomerCreate {
  name: string
  email?: string
  phone?: string
}

export interface CustomerUpdate {
  name?: string
  email?: string
  phone?: string
}

export interface LoyaltyRuleData {
  id: number
  tenant_id: number
  name: string
  description: string
  points_per_unit: number
  min_amount_cents: number
  tier_requirement: string | null
  is_active: boolean
}

export interface LoyaltyRuleCreate {
  name: string
  description?: string
  points_per_unit: number
  min_amount_cents?: number
}

export interface LoyaltyRuleUpdate {
  name?: string
  description?: string
  points_per_unit?: number
  min_amount_cents?: number
  is_active?: boolean
}

export const crmAPI = {
  customers: {
    async list(params?: Record<string, string>): Promise<CustomerData[]> {
      const query = params ? '?' + new URLSearchParams(params).toString() : ''
      return fetchAPI<CustomerData[]>(`/api/admin/customers${query}`)
    },

    async get(id: string): Promise<CustomerData> {
      return fetchAPI<CustomerData>(`/api/admin/customers/${id}`)
    },

    async create(data: CustomerCreate): Promise<CustomerData> {
      return fetchAPI<CustomerData>('/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: CustomerUpdate): Promise<CustomerData> {
      return fetchAPI<CustomerData>(`/api/admin/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/customers/${id}`, { method: 'DELETE' })
    },
  },

  async customerHistory(id: string): Promise<unknown> {
    return fetchAPI(`/api/admin/customers/${id}/history`)
  },

  async customerLoyalty(id: string): Promise<unknown> {
    return fetchAPI(`/api/admin/customers/${id}/loyalty`)
  },

  async adjustPoints(id: string, data: { points: number; reason: string }): Promise<unknown> {
    return fetchAPI(`/api/admin/customers/${id}/points`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async topCustomers(limit: number = 10): Promise<CustomerData[]> {
    return fetchAPI<CustomerData[]>(`/api/admin/customers/top?limit=${limit}`)
  },

  loyaltyRules: {
    async list(): Promise<LoyaltyRuleData[]> {
      return fetchAPI<LoyaltyRuleData[]>('/api/admin/loyalty-rules')
    },

    async create(data: LoyaltyRuleCreate): Promise<LoyaltyRuleData> {
      return fetchAPI<LoyaltyRuleData>('/api/admin/loyalty-rules', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: LoyaltyRuleUpdate): Promise<LoyaltyRuleData> {
      return fetchAPI<LoyaltyRuleData>(`/api/admin/loyalty-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      return fetchAPI(`/api/admin/loyalty-rules/${id}`, { method: 'DELETE' })
    },
  },

  async loyaltyReport(): Promise<unknown> {
    return fetchAPI('/api/admin/loyalty/report')
  },
}


// =============================================================================
// Product Customization Types
// =============================================================================

export interface CustomizationOption {
  id: number
  tenant_id: number
  name: string
  category: string | null
  extra_cost_cents: number
  order: number
  is_active: boolean
  product_ids: number[]
}

export interface CustomizationOptionCreate {
  name: string
  category?: string | null
  extra_cost_cents?: number
  order?: number
}

export interface CustomizationOptionUpdate {
  name?: string
  category?: string | null
  extra_cost_cents?: number
  order?: number
}

// =============================================================================
// Admin API - Product Customizations
// =============================================================================

export const customizationAPI = {
  async list(): Promise<CustomizationOption[]> {
    return fetchAPI<CustomizationOption[]>('/api/admin/customizations')
  },

  async get(id: number): Promise<CustomizationOption> {
    return fetchAPI<CustomizationOption>(`/api/admin/customizations/${id}`)
  },

  async create(data: CustomizationOptionCreate): Promise<CustomizationOption> {
    return fetchAPI<CustomizationOption>('/api/admin/customizations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: CustomizationOptionUpdate): Promise<CustomizationOption> {
    return fetchAPI<CustomizationOption>(`/api/admin/customizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI(`/api/admin/customizations/${id}`, { method: 'DELETE' })
  },

  async linkProduct(optionId: number, productId: number): Promise<void> {
    return fetchAPI(`/api/admin/customizations/${optionId}/products/${productId}`, {
      method: 'POST',
    })
  },

  async unlinkProduct(optionId: number, productId: number): Promise<void> {
    return fetchAPI(`/api/admin/customizations/${optionId}/products/${productId}`, {
      method: 'DELETE',
    })
  },

  async setProductLinks(optionId: number, productIds: number[]): Promise<CustomizationOption> {
    return fetchAPI<CustomizationOption>(`/api/admin/customizations/${optionId}/products`, {
      method: 'PUT',
      body: JSON.stringify({ product_ids: productIds }),
    })
  },
}


// =============================================================================
// Reservation Types
// =============================================================================

export interface Reservation {
  id: number
  tenant_id: number
  branch_id: number
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  party_size: number
  reservation_date: string
  reservation_time: string
  duration_minutes: number
  table_id: number | null
  status: string
  notes: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface ReservationCreate {
  branch_id: number
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  party_size: number
  reservation_date: string
  reservation_time: string
  duration_minutes?: number
  table_id?: number | null
  notes?: string | null
}

export interface ReservationUpdate {
  customer_name?: string
  customer_phone?: string | null
  customer_email?: string | null
  party_size?: number
  reservation_date?: string
  reservation_time?: string
  duration_minutes?: number
  table_id?: number | null
  notes?: string | null
}

// =============================================================================
// Admin API - Reservations
// =============================================================================

export const reservationAPI = {
  async list(branchId?: number, date?: string, status?: string): Promise<Reservation[]> {
    const params = new URLSearchParams()
    if (branchId) params.set('branch_id', String(branchId))
    if (date) params.set('date', date)
    if (status) params.set('status', status)
    const qs = params.toString()
    return fetchAPI<Reservation[]>(`/api/admin/reservations${qs ? `?${qs}` : ''}`)
  },

  async get(id: number): Promise<Reservation> {
    return fetchAPI<Reservation>(`/api/admin/reservations/${id}`)
  },

  async create(data: ReservationCreate): Promise<Reservation> {
    return fetchAPI<Reservation>('/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: ReservationUpdate): Promise<Reservation> {
    return fetchAPI<Reservation>(`/api/admin/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async updateStatus(id: number, status: string): Promise<Reservation> {
    return fetchAPI<Reservation>(`/api/admin/reservations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI(`/api/admin/reservations/${id}`, { method: 'DELETE' })
  },
}


// =============================================================================
// Delivery / Takeout Types
// =============================================================================

export interface DeliveryOrderItem {
  id: number
  product_id: number
  product_name: string | null
  qty: number
  unit_price_cents: number
  subtotal_cents: number
  notes: string | null
}

export interface DeliveryOrder {
  id: number
  tenant_id: number
  branch_id: number
  order_type: string // TAKEOUT | DELIVERY
  customer_name: string
  customer_phone: string
  customer_email: string | null
  delivery_address: string | null
  delivery_instructions: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  estimated_ready_at: string | null
  estimated_delivery_at: string | null
  status: string
  total_cents: number
  payment_method: string | null
  is_paid: boolean
  notes: string | null
  items: DeliveryOrderItem[]
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface DeliveryOrderCreateItem {
  product_id: number
  qty: number
  notes?: string | null
}

export interface DeliveryOrderCreate {
  order_type: string
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  delivery_address?: string | null
  delivery_instructions?: string | null
  payment_method?: string | null
  notes?: string | null
  items: DeliveryOrderCreateItem[]
}

export interface DeliveryOrderUpdate {
  customer_name?: string
  customer_phone?: string
  customer_email?: string | null
  delivery_address?: string | null
  delivery_instructions?: string | null
  payment_method?: string | null
  is_paid?: boolean
  notes?: string | null
}

// =============================================================================
// Admin API - Delivery / Takeout
// =============================================================================

export const deliveryAPI = {
  async list(
    branchId: number,
    status?: string,
    orderType?: string,
  ): Promise<DeliveryOrder[]> {
    const params = new URLSearchParams()
    params.set('branch_id', String(branchId))
    if (status) params.set('status', status)
    if (orderType) params.set('type', orderType)
    return fetchAPI<DeliveryOrder[]>(`/api/admin/delivery/orders?${params.toString()}`)
  },

  async get(id: number): Promise<DeliveryOrder> {
    return fetchAPI<DeliveryOrder>(`/api/admin/delivery/orders/${id}`)
  },

  async create(branchId: number, data: DeliveryOrderCreate): Promise<DeliveryOrder> {
    return fetchAPI<DeliveryOrder>(`/api/admin/delivery/orders?branch_id=${branchId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: number, data: DeliveryOrderUpdate): Promise<DeliveryOrder> {
    return fetchAPI<DeliveryOrder>(`/api/admin/delivery/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async updateStatus(id: number, status: string): Promise<DeliveryOrder> {
    return fetchAPI<DeliveryOrder>(`/api/admin/delivery/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async delete(id: number): Promise<void> {
    return fetchAPI(`/api/admin/delivery/orders/${id}`, { method: 'DELETE' })
  },
}
