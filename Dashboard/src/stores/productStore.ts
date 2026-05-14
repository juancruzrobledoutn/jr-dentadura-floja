import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// LOW-01 FIX: Removed unused import AllergenPresenceInput
import type { Product, ProductFormData, BranchPrice, AllergenPresence } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { productAPI, type Product as APIProduct, type AllergenPresenceInput as APIAllergenPresenceInput } from '../services/api'

// QA-DASH-CRIT-02 FIX: Stable reference for empty array to prevent React 19 infinite re-renders
const EMPTY_PRODUCTS: Product[] = []

interface ProductState {
  products: Product[]
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  // Actions
  setProducts: (products: Product[]) => void
  addProduct: (data: ProductFormData) => Product
  updateProduct: (id: string, data: Partial<ProductFormData>) => void
  deleteProduct: (id: string) => void
  getByCategory: (categoryId: string) => Product[]
  getBySubcategory: (subcategoryId: string) => Product[]
  deleteByCategory: (categoryId: string) => void
  deleteBySubcategory: (subcategoryId: string) => void
  deleteByCategories: (categoryIds: string[]) => void
  removeAllergenFromProducts: (allergenId: string) => void
  removeBadgeFromProducts: (badgeName: string) => void
  removeSealFromProducts: (sealName: string) => void
  removeBranchFromProductPrices: (branchId: string) => void
  // Async API actions
  fetchProducts: (categoryId?: number, branchId?: number) => Promise<void>
  createProductAsync: (data: ProductFormData) => Promise<Product>
  updateProductAsync: (id: string, data: Partial<ProductFormData>) => Promise<void>
  deleteProductAsync: (id: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Helper to convert API product to frontend product
function mapAPIProductToFrontend(apiProduct: APIProduct): Product {
  // Convert branch_prices from cents to dollars
  const branchPrices: BranchPrice[] = apiProduct.branch_prices.map((bp) => ({
    branch_id: String(bp.branch_id),
    price: bp.price_cents / 100,
    is_active: bp.is_available,
  }))

  // Calculate base price from first branch price or default to 0
  const basePrice = branchPrices.length > 0 ? branchPrices[0].price : 0

  // Map API allergen presence to frontend format (Phase 0)
  const allergenPresence: AllergenPresence[] = (apiProduct.allergens || []).map((ap) => ({
    allergen_id: ap.allergen_id,
    allergen_name: ap.allergen_name,
    allergen_icon: ap.allergen_icon ?? undefined,
    presence_type: ap.presence_type,
  }))

  return {
    id: String(apiProduct.id),
    name: apiProduct.name,
    description: apiProduct.description ?? '',
    price: basePrice,
    image: apiProduct.image ?? undefined,
    category_id: String(apiProduct.category_id),
    subcategory_id: apiProduct.subcategory_id ? String(apiProduct.subcategory_id) : '',
    featured: apiProduct.featured,
    popular: apiProduct.popular,
    badge: apiProduct.badge ?? undefined,
    seal: apiProduct.seal ?? undefined,
    allergen_ids: apiProduct.allergen_ids.map(String),  // Legacy format
    allergens: allergenPresence,  // New format with presence types (Phase 0)
    // Recipe linkage (propuesta1.md)
    recipe_id: apiProduct.recipe_id ?? null,
    inherits_from_recipe: apiProduct.inherits_from_recipe ?? false,
    recipe_name: apiProduct.recipe_name ?? null,
    is_active: apiProduct.is_active,
    branch_prices: branchPrices,
    use_branch_prices: branchPrices.length > 0,
  }
}

// Empty initial state - data comes from backend API
const initialProducts: Product[] = []

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: initialProducts,
      isLoading: false,
      error: null,
      lastFetch: null,

      setProducts: (products) => set({ products }),

      addProduct: (data) => {
        const newProduct: Product = {
          id: generateId(),
          ...data,
          allergen_ids: data.allergen_ids ?? [],
          branch_prices: data.branch_prices ?? [],
          use_branch_prices: data.use_branch_prices ?? false,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ products: [...state.products, newProduct] }))
        return newProduct
      },

      updateProduct: (id, data) =>
        set((state) => ({
          products: state.products.map((prod) =>
            prod.id === id
              ? { ...prod, ...data, updated_at: new Date().toISOString() }
              : prod
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((prod) => prod.id !== id),
        })),

      getByCategory: (categoryId) => {
        return get().products.filter((p) => p.category_id === categoryId)
      },

      getBySubcategory: (subcategoryId) => {
        return get().products.filter((p) => p.subcategory_id === subcategoryId)
      },

      deleteByCategory: (categoryId) =>
        set((state) => ({
          products: state.products.filter(
            (prod) => prod.category_id !== categoryId
          ),
        })),

      deleteBySubcategory: (subcategoryId) =>
        set((state) => ({
          products: state.products.filter(
            (prod) => prod.subcategory_id !== subcategoryId
          ),
        })),

      deleteByCategories: (categoryIds) => {
        const categoryIdSet = new Set(categoryIds)
        set((state) => ({
          products: state.products.filter(
            (prod) => !categoryIdSet.has(prod.category_id)
          ),
        }))
      },

      removeAllergenFromProducts: (allergenId) =>
        set((state) => ({
          products: state.products.map((prod) => ({
            ...prod,
            allergen_ids: (prod.allergen_ids ?? []).filter((id) => id !== allergenId),
          })),
        })),

      removeBadgeFromProducts: (badgeName) =>
        set((state) => ({
          products: state.products.map((prod) => ({
            ...prod,
            badge: prod.badge === badgeName ? '' : prod.badge,
          })),
        })),

      removeSealFromProducts: (sealName) =>
        set((state) => ({
          products: state.products.map((prod) => ({
            ...prod,
            seal: prod.seal === sealName ? '' : prod.seal,
          })),
        })),

      removeBranchFromProductPrices: (branchId) =>
        set((state) => ({
          products: state.products.map((prod) => ({
            ...prod,
            branch_prices: (prod.branch_prices ?? []).filter(
              (bp) => bp.branch_id !== branchId
            ),
          })),
        })),

      // Async API actions
      fetchProducts: async (categoryId, branchId) => {
        // VERCEL-APP-FIX: Prevent waterfall/redundant fetches (60s cache for full list)
        if (categoryId === undefined && branchId === undefined) {
          const { lastFetch, isLoading } = get()
          if (lastFetch && Date.now() - lastFetch < 60000 && !isLoading) {
            return
          }
        }

        set({ isLoading: true, error: null })
        try {
          const apiProducts = await productAPI.list(categoryId, branchId)
          const products = apiProducts.map(mapAPIProductToFrontend)
          const isFullFetch = categoryId === undefined && branchId === undefined
          set({
            products,
            isLoading: false,
            lastFetch: isFullFetch ? Date.now() : null
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar productos'
          set({ error: message, isLoading: false })
        }
      },

      createProductAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const categoryId = parseInt(data.category_id, 10)
          if (isNaN(categoryId)) {
            const newProduct = get().addProduct(data)
            set({ isLoading: false })
            return newProduct
          }

          // Convert branch_prices to API format (dollars to cents)
          const apiBranchPrices = (data.branch_prices ?? []).map((bp) => ({
            branch_id: parseInt(bp.branch_id, 10),
            price_cents: Math.round(bp.price * 100),
            is_available: bp.is_active,
          }))

          // Convert allergen_ids to numbers (legacy format)
          const allergenIds = (data.allergen_ids ?? [])
            .map((id) => parseInt(id, 10))
            .filter((id) => !isNaN(id))

          // Convert allergens to API format (new format - Phase 0)
          const apiAllergens: APIAllergenPresenceInput[] = (data.allergens ?? []).map((a) => ({
            allergen_id: a.allergen_id,
            presence_type: a.presence_type,
          }))

          const apiProduct = await productAPI.create({
            name: data.name,
            description: data.description,
            image: data.image,
            category_id: categoryId,
            subcategory_id: data.subcategory_id ? parseInt(data.subcategory_id, 10) : undefined,
            featured: data.featured,
            popular: data.popular,
            badge: data.badge,
            seal: data.seal,
            allergen_ids: allergenIds,
            allergens: apiAllergens.length > 0 ? apiAllergens : undefined,  // Use new format if available
            is_active: data.is_active,
            branch_prices: apiBranchPrices,
          })

          const newProduct = mapAPIProductToFrontend(apiProduct)
          set((state) => ({
            products: [...state.products, newProduct],
            isLoading: false,
          }))
          return newProduct
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear producto'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateProductAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            get().updateProduct(id, data)
            set({ isLoading: false })
            return
          }

          // Convert branch_prices if provided
          const apiBranchPrices = data.branch_prices?.map((bp) => ({
            branch_id: parseInt(bp.branch_id, 10),
            price_cents: Math.round(bp.price * 100),
            is_available: bp.is_active,
          }))

          // Convert allergen_ids if provided (legacy format)
          const allergenIds = data.allergen_ids
            ?.map((id) => parseInt(id, 10))
            .filter((id) => !isNaN(id))

          // Convert allergens if provided (new format - Phase 0)
          const apiAllergens: APIAllergenPresenceInput[] | undefined = data.allergens?.map((a) => ({
            allergen_id: a.allergen_id,
            presence_type: a.presence_type,
          }))

          await productAPI.update(numericId, {
            name: data.name,
            description: data.description,
            image: data.image,
            category_id: data.category_id ? parseInt(data.category_id, 10) : undefined,
            subcategory_id: data.subcategory_id ? parseInt(data.subcategory_id, 10) : undefined,
            featured: data.featured,
            popular: data.popular,
            badge: data.badge,
            seal: data.seal,
            allergen_ids: allergenIds,
            allergens: apiAllergens,  // Use new format (Phase 0)
            is_active: data.is_active,
            branch_prices: apiBranchPrices,
          })

          set((state) => ({
            products: state.products.map((prod) =>
              prod.id === id
                ? { ...prod, ...data, updated_at: new Date().toISOString() }
                : prod
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar producto'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteProductAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await productAPI.delete(numericId)
          }

          set((state) => ({
            products: state.products.filter((prod) => prod.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar producto'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.PRODUCTS,
      version: STORE_VERSIONS.PRODUCTS,
      partialize: (state) => ({
        products: state.products,
      }),
      migrate: (persistedState, version) => {
        const persisted = persistedState as { products: Product[] }

        if (!Array.isArray(persisted.products)) {
          return { products: [] }
        }

        let products = persisted.products

        if (version < 5) {
          products = products.map(p => ({
            ...p,
            branch_prices: p.branch_prices ?? [],
            use_branch_prices: p.use_branch_prices ?? false,
          }))
        }

        // Version 6: Clear mock data, data comes from backend
        if (version < 6) {
          products = products.filter(p =>
            !(/^\d+$/.test(p.id)) &&
            !p.id.startsWith('b2-prod-') &&
            !p.id.startsWith('b3-prod-') &&
            !p.id.startsWith('b4-prod-')
          )
        }

        return { products }
      },
    }
  )
)

// Selectors
// QA-DASH-CRIT-02 FIX: Use stable reference when products array is empty
export const selectProducts = (state: ProductState) =>
  state.products.length > 0 ? state.products : EMPTY_PRODUCTS
export const selectProductLoading = (state: ProductState) => state.isLoading
export const selectProductError = (state: ProductState) => state.error

// =============================================================================
// ZUSTAND-REACT19: Memoized filtered selectors with cache pattern
// Prevents new array references on every call when filtering
// =============================================================================

// Cache for selectProductsByCategory - keyed by categoryId
const productsByCategoryCache = new Map<string, { products: Product[] | null, result: Product[] }>()

/**
 * Memoized selector factory for products filtered by category ID.
 * Returns stable array reference when products haven't changed.
 *
 * Usage: const products = useStore(selectProductsByCategory(categoryId))
 */
export const selectProductsByCategory = (categoryId: string) => (state: ProductState): Product[] => {
  let cache = productsByCategoryCache.get(categoryId)
  if (!cache) {
    cache = { products: null, result: EMPTY_PRODUCTS }
    productsByCategoryCache.set(categoryId, cache)
  }

  if (state.products === cache.products) {
    return cache.result
  }

  const filtered = state.products.filter((p) => p.category_id === categoryId)
  cache.products = state.products
  cache.result = filtered.length > 0 ? filtered : EMPTY_PRODUCTS
  return cache.result
}

// Cache for selectProductsBySubcategory - keyed by subcategoryId
const productsBySubcategoryCache = new Map<string, { products: Product[] | null, result: Product[] }>()

/**
 * Memoized selector factory for products filtered by subcategory ID.
 * Returns stable array reference when products haven't changed.
 *
 * Usage: const products = useStore(selectProductsBySubcategory(subcategoryId))
 */
export const selectProductsBySubcategory = (subcategoryId: string) => (state: ProductState): Product[] => {
  let cache = productsBySubcategoryCache.get(subcategoryId)
  if (!cache) {
    cache = { products: null, result: EMPTY_PRODUCTS }
    productsBySubcategoryCache.set(subcategoryId, cache)
  }

  if (state.products === cache.products) {
    return cache.result
  }

  const filtered = state.products.filter((p) => p.subcategory_id === subcategoryId)
  cache.products = state.products
  cache.result = filtered.length > 0 ? filtered : EMPTY_PRODUCTS
  return cache.result
}

// Cache for selectProductById - keyed by productId
const productByIdCache = new Map<string, (state: ProductState) => Product | undefined>()

/**
 * Memoized selector factory for single product by ID.
 * Caches the selector function itself to avoid recreating on each call.
 *
 * Usage: const product = useStore(selectProductById(productId))
 */
export const selectProductById = (id: string | null) => {
  if (!id) return () => undefined

  if (!productByIdCache.has(id)) {
    productByIdCache.set(id, (state: ProductState) =>
      state.products.find((p) => p.id === id)
    )
  }
  return productByIdCache.get(id)!
}

// Cache for selectFeaturedProducts
const featuredProductsCache = { products: null as Product[] | null, result: EMPTY_PRODUCTS }

/**
 * Memoized selector for featured products.
 * Returns stable array reference when products haven't changed.
 */
export const selectFeaturedProducts = (state: ProductState): Product[] => {
  if (state.products === featuredProductsCache.products) {
    return featuredProductsCache.result
  }
  const filtered = state.products.filter((p) => p.featured)
  featuredProductsCache.products = state.products
  featuredProductsCache.result = filtered.length > 0 ? filtered : EMPTY_PRODUCTS
  return featuredProductsCache.result
}

// Cache for selectPopularProducts
const popularProductsCache = { products: null as Product[] | null, result: EMPTY_PRODUCTS }

/**
 * Memoized selector for popular products.
 * Returns stable array reference when products haven't changed.
 */
export const selectPopularProducts = (state: ProductState): Product[] => {
  if (state.products === popularProductsCache.products) {
    return popularProductsCache.result
  }
  const filtered = state.products.filter((p) => p.popular)
  popularProductsCache.products = state.products
  popularProductsCache.result = filtered.length > 0 ? filtered : EMPTY_PRODUCTS
  return popularProductsCache.result
}
