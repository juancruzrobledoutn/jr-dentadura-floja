/**
 * Menu Store
 * Manages menu data from backend with caching
 */

import { create } from 'zustand'
import { menuAPI } from '../services/api'
// LOW-01 FIX: Removed unused import AllergenWithCrossReactionsAPI
import type { MenuResponse, CategoryAPI, ProductAPI, CategoryFrontend, ProductFrontend } from '../types/backend'
import { menuStoreLogger } from '../utils/logger'

/** Allergen info for filtering UI */
export interface AllergenForFilter {
  id: number
  name: string
  icon: string | null
}

// =============================================================================
// Types
// =============================================================================

interface MenuState {
  // Backend data (cached)
  branchId: number | null
  branchName: string | null
  branchSlug: string | null
  categories: CategoryFrontend[]
  products: ProductFrontend[]
  allergens: AllergenForFilter[]

  // Loading/error states
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  // HIGH-07 FIX: Track concurrent fetch
  _isFetchingAllergens: boolean

  // Actions
  /** Fetches menu data from backend, uses cache if valid (5 min TTL) */
  fetchMenu: (slug: string, forceRefresh?: boolean) => Promise<void>
  /** Fetches allergens for filtering UI */
  fetchAllergens: (slug: string) => Promise<void>
  /** Gets a product by its ID */
  getProductById: (id: number) => ProductFrontend | undefined
  /** Gets a category by its ID */
  getCategoryById: (id: number) => CategoryFrontend | undefined
  /** Gets all available products for a category */
  getProductsByCategory: (categoryId: number) => ProductFrontend[]
  /** Updates a product's availability status (for real-time WS updates) */
  updateProductAvailability: (productId: number, isAvailable: boolean) => void
  /** Clears all menu data and cache */
  clearMenu: () => void
  /** Invalidates cache, forcing next fetchMenu to reload from backend */
  invalidateCache: () => void
}

// =============================================================================
// Conversion helpers
// =============================================================================

function convertProduct(p: ProductAPI): ProductFrontend {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price_cents / 100, // Convert cents to pesos
    priceCents: p.price_cents,
    image: p.image,
    categoryId: p.category_id,
    subcategoryId: p.subcategory_id,
    featured: p.featured,
    popular: p.popular,
    badge: p.badge,
    seal: p.seal,
    allergenIds: p.allergen_ids,
    isAvailable: p.is_available,
    // Canonical model fields (producto3.md)
    allergens: p.allergens ?? null,
    dietary: p.dietary ?? null,
    cooking: p.cooking ?? null,
  }
}

function convertCategory(c: CategoryAPI): CategoryFrontend {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    image: c.image,
    order: c.order,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      image: s.image,
      order: s.order,
    })),
  }
}

// =============================================================================
// Stable empty arrays for React 19 getSnapshot compatibility
// =============================================================================

const EMPTY_CATEGORIES: CategoryFrontend[] = []
const EMPTY_PRODUCTS: ProductFrontend[] = []
const EMPTY_ALLERGENS: AllergenForFilter[] = []

// QA-MENU-HIGH-02 FIX: Memoization caches for filtered selectors
// Prevents React 19 infinite re-render loops caused by .filter() creating new arrays
interface ProductFilterCache {
  products: ProductFrontend[] | null
  result: ProductFrontend[]
}
const featuredCache: ProductFilterCache = { products: null, result: EMPTY_PRODUCTS }
const popularCache: ProductFilterCache = { products: null, result: EMPTY_PRODUCTS }
const availableCache: ProductFilterCache = { products: null, result: EMPTY_PRODUCTS }

// =============================================================================
// Selectors
// =============================================================================

export const selectBranchId = (state: MenuState) => state.branchId
export const selectBranchName = (state: MenuState) => state.branchName
export const selectBranchSlug = (state: MenuState) => state.branchSlug
export const selectCategories = (state: MenuState) => state.categories.length > 0 ? state.categories : EMPTY_CATEGORIES
export const selectProducts = (state: MenuState) => state.products.length > 0 ? state.products : EMPTY_PRODUCTS
export const selectAllergens = (state: MenuState) => state.allergens.length > 0 ? state.allergens : EMPTY_ALLERGENS
export const selectIsLoading = (state: MenuState) => state.isLoading
export const selectError = (state: MenuState) => state.error
export const selectHasMenu = (state: MenuState) => state.categories.length > 0

// Derived selectors
// QA-MENU-HIGH-02 FIX: Memoized to prevent React 19 infinite re-renders
export const selectFeaturedProducts = (state: MenuState): ProductFrontend[] => {
  if (state.products === featuredCache.products) {
    return featuredCache.result
  }
  const featured = state.products.filter((p) => p.featured && p.isAvailable)
  featuredCache.products = state.products
  featuredCache.result = featured.length > 0 ? featured : EMPTY_PRODUCTS
  return featuredCache.result
}

export const selectPopularProducts = (state: MenuState): ProductFrontend[] => {
  if (state.products === popularCache.products) {
    return popularCache.result
  }
  const popular = state.products.filter((p) => p.popular && p.isAvailable)
  popularCache.products = state.products
  popularCache.result = popular.length > 0 ? popular : EMPTY_PRODUCTS
  return popularCache.result
}

export const selectAvailableProducts = (state: MenuState): ProductFrontend[] => {
  if (state.products === availableCache.products) {
    return availableCache.result
  }
  const available = state.products.filter((p) => p.isAvailable)
  availableCache.products = state.products
  availableCache.result = available.length > 0 ? available : EMPTY_PRODUCTS
  return availableCache.result
}

// =============================================================================
// Store
// =============================================================================

export const useMenuStore = create<MenuState>()((set, get) => ({
  // Initial state
  branchId: null,
  branchName: null,
  branchSlug: null,
  categories: [],
  products: [],
  allergens: [],
  isLoading: false,
  error: null,
  lastFetch: null,
  // HIGH-07 FIX: Track concurrent fetch
  _isFetchingAllergens: false,

  fetchMenu: async (slug: string, forceRefresh = false) => {
    // Check if we already have this menu cached (within 5 minutes)
    const state = get()
    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

    // MED-01 FIX: Allow force refresh to bypass cache
    if (
      !forceRefresh &&
      state.branchSlug === slug &&
      state.lastFetch &&
      now - state.lastFetch < CACHE_DURATION
    ) {
      menuStoreLogger.debug('Using cached menu for', slug)
      return
    }

    set({ isLoading: true, error: null })

    try {
      const response: MenuResponse = await menuAPI.getMenu(slug)

      // Extract and convert all products from categories
      const products: ProductFrontend[] = []
      const categories: CategoryFrontend[] = []

      for (const cat of response.categories) {
        categories.push(convertCategory(cat))
        for (const prod of cat.products) {
          products.push(convertProduct(prod))
        }
      }

      set({
        branchId: response.branch_id,
        branchName: response.branch_name,
        branchSlug: response.branch_slug,
        categories,
        products,
        isLoading: false,
        lastFetch: now,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load menu'
      // HIGH-06 FIX: Set error state BEFORE throwing to allow error boundaries to display message
      set({ isLoading: false, error: message })
      menuStoreLogger.error('fetchMenu failed:', message)
      throw err
    }
  },

  fetchAllergens: async (slug: string) => {
    // Check if we already have allergens cached
    const state = get()
    if (state.allergens.length > 0 && state.branchSlug === slug) {
      return
    }

    // Prevent concurrent fetches
    if (state._isFetchingAllergens) {
      menuStoreLogger.debug('Allergens fetch already in progress, skipping')
      return
    }

    set({ _isFetchingAllergens: true })

    // HIGH-29-14 FIX: Capture the slug at fetch time to detect stale responses
    const fetchSlug = slug

    try {
      const response = await menuAPI.getAllergensWithCrossReactions(slug)

      // HIGH-29-14 FIX: Verify the current branchSlug hasn't changed during the async operation
      // This prevents race conditions when user navigates to a different branch while fetch is in progress
      const currentState = get()
      if (currentState.branchSlug !== fetchSlug && currentState.branchSlug !== null) {
        menuStoreLogger.debug('Allergens fetch completed for stale slug, discarding:', fetchSlug)
        set({ _isFetchingAllergens: false })
        return
      }

      const allergens: AllergenForFilter[] = response.map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
      }))
      set({ allergens, _isFetchingAllergens: false })
    } catch (err) {
      // HIGH-06 FIX: Log error with more context but don't set error state
      // (allergens are optional, menu still works without them)
      const message = err instanceof Error ? err.message : 'Unknown error'
      menuStoreLogger.error('Failed to fetch allergens:', message)
      set({ _isFetchingAllergens: false })
      // Don't throw - allergens are optional for filtering
    }
  },

  getProductById: (id: number) => {
    return get().products.find((p) => p.id === id)
  },

  getCategoryById: (id: number) => {
    return get().categories.find((c) => c.id === id)
  },

  getProductsByCategory: (categoryId: number) => {
    // Include unavailable products (shown as grayed out with "Agotado" badge)
    return get().products.filter((p) => p.categoryId === categoryId)
  },

  updateProductAvailability: (productId: number, isAvailable: boolean) => {
    const products = get().products
    const idx = products.findIndex((p) => p.id === productId)
    if (idx === -1) return

    // Create new array with updated product to trigger React re-render
    const updatedProducts = [...products]
    updatedProducts[idx] = { ...updatedProducts[idx], isAvailable }
    set({ products: updatedProducts })
    menuStoreLogger.info(`Product ${productId} availability: ${isAvailable}`)
  },

  clearMenu: () => {
    set({
      branchId: null,
      branchName: null,
      branchSlug: null,
      categories: [],
      products: [],
      allergens: [],
      error: null,
      lastFetch: null,
    })
  },

  // MED-01 FIX: Mechanism to invalidate cache without clearing data
  invalidateCache: () => {
    set({ lastFetch: null })
    menuStoreLogger.debug('Menu cache invalidated')
  },
}))
