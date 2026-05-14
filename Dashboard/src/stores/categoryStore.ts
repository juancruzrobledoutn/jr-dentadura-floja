import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, CategoryFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { categoryAPI, type Category as APICategory } from '../services/api'

interface CategoryState {
  categories: Category[]
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  // Actions
  setCategories: (categories: Category[]) => void
  addCategory: (data: CategoryFormData) => Category
  updateCategory: (id: string, data: Partial<CategoryFormData>) => void
  deleteCategory: (id: string) => void
  reorderCategories: (categories: Category[]) => void
  getByBranch: (branchId: string) => Category[]
  deleteByBranch: (branchId: string) => void
  // Async API actions
  fetchCategories: (branchId?: number) => Promise<void>
  createCategoryAsync: (data: CategoryFormData) => Promise<Category>
  updateCategoryAsync: (id: string, data: Partial<CategoryFormData>) => Promise<void>
  deleteCategoryAsync: (id: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Helper to convert API category to frontend category
function mapAPICategoryToFrontend(apiCategory: APICategory): Category {
  return {
    id: String(apiCategory.id),
    name: apiCategory.name,
    icon: apiCategory.icon ?? undefined,
    image: apiCategory.image ?? undefined,
    order: apiCategory.order,
    branch_id: String(apiCategory.branch_id),
    is_active: apiCategory.is_active,
  }
}

// Empty initial state - data comes from backend API
const initialCategories: Category[] = []

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set, get) => ({
      categories: initialCategories,
      isLoading: false,
      error: null,
      lastFetch: null,

      setCategories: (categories) => set({ categories }),

      addCategory: (data) => {
        const categories = get().categories
        const branchCategories = categories.filter((c) => c.branch_id === data.branch_id)
        const orders = branchCategories.map((c) => c.order).filter((o) => typeof o === 'number' && !isNaN(o))
        const maxOrder = orders.length > 0 ? Math.max(...orders) : 0
        const newCategory: Category = {
          id: generateId(),
          ...data,
          order: data.order ?? maxOrder + 1,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set({ categories: [...categories, newCategory] })
        return newCategory
      },

      updateCategory: (id, data) =>
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === id
              ? { ...cat, ...data, updated_at: new Date().toISOString() }
              : cat
          ),
        })),

      deleteCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter((cat) => cat.id !== id),
        })),

      reorderCategories: (categories) => {
        if (!Array.isArray(categories)) {
          return
        }
        set({ categories })
      },

      getByBranch: (branchId) => {
        return get()
          .categories.filter((c) => c.branch_id === branchId)
          .sort((a, b) => a.order - b.order)
      },

      deleteByBranch: (branchId) =>
        set((state) => ({
          categories: state.categories.filter((cat) => cat.branch_id !== branchId),
        })),

      // Async API actions
      fetchCategories: async (branchId) => {
        // VERCEL-APP-FIX: Prevent waterfall/redundant fetches (60s cache)
        if (branchId === undefined) {
          const { lastFetch, isLoading } = get()
          if (lastFetch && Date.now() - lastFetch < 60000 && !isLoading) {
            return
          }
        }

        set({ isLoading: true, error: null })
        try {
          const apiCategories = await categoryAPI.list(branchId)
          const categories = apiCategories.map(mapAPICategoryToFrontend)

          // Merge with existing local categories (for other branches)
          set((state) => {
            if (branchId) {
              // Replace only categories for this branch
              const otherBranches = state.categories.filter(
                (c) => c.branch_id !== String(branchId)
              )
              // Partial update invalidates "full fetch" status
              return { categories: [...otherBranches, ...categories], isLoading: false, lastFetch: null }
            }
            // Full update sets lastFetch
            return { categories, isLoading: false, lastFetch: Date.now() }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar categorias'
          set({ error: message, isLoading: false })
        }
      },

      createCategoryAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const branchId = parseInt(data.branch_id, 10)
          if (isNaN(branchId)) {
            // Local branch, create locally
            const newCategory = get().addCategory(data)
            set({ isLoading: false })
            return newCategory
          }

          const apiCategory = await categoryAPI.create({
            branch_id: branchId,
            name: data.name,
            icon: data.icon,
            image: data.image,
            order: data.order,
            is_active: data.is_active,
          })

          const newCategory = mapAPICategoryToFrontend(apiCategory)
          set((state) => ({
            categories: [...state.categories, newCategory],
            isLoading: false,
          }))
          return newCategory
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear categoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateCategoryAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            get().updateCategory(id, data)
            set({ isLoading: false })
            return
          }

          await categoryAPI.update(numericId, {
            name: data.name,
            icon: data.icon,
            image: data.image,
            order: data.order,
            is_active: data.is_active,
          })

          set((state) => ({
            categories: state.categories.map((cat) =>
              cat.id === id
                ? { ...cat, ...data, updated_at: new Date().toISOString() }
                : cat
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar categoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteCategoryAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await categoryAPI.delete(numericId)
          }

          set((state) => ({
            categories: state.categories.filter((cat) => cat.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar categoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.CATEGORIES,
      version: STORE_VERSIONS.CATEGORIES,
      partialize: (state) => ({
        categories: state.categories,
      }),
      migrate: (persistedState, version) => {
        const persisted = persistedState as { categories: Category[] }

        if (!Array.isArray(persisted.categories)) {
          return { categories: [] }
        }

        let categories = persisted.categories

        // Version 4: Clear mock data, data comes from backend
        if (version < 4) {
          categories = categories.filter(c =>
            !c.id.startsWith('b1-') &&
            !c.id.startsWith('b2-') &&
            !c.id.startsWith('b3-') &&
            !c.id.startsWith('b4-')
          )
        }

        return { categories }
      },
    }
  )
)

// HIGH-05 FIX: Stable empty array for React 19 getSnapshot compatibility
const EMPTY_CATEGORIES: Category[] = []

// Selectors
export const selectCategories = (state: CategoryState) => state.categories.length > 0 ? state.categories : EMPTY_CATEGORIES
export const selectCategoryLoading = (state: CategoryState) => state.isLoading
export const selectCategoryError = (state: CategoryState) => state.error

// =============================================================================
// ZUSTAND-REACT19: Memoized filtered selectors with cache pattern
// Prevents new array references on every call when filtering by branch
// =============================================================================

// Cache for selectCategoriesByBranch - keyed by branchId
const categoriesByBranchCache = new Map<string, { categories: Category[] | null, result: Category[] }>()

/**
 * Memoized selector factory for categories filtered by branch ID.
 * Returns stable array reference when categories haven't changed.
 *
 * Usage: const categories = useStore(selectCategoriesByBranch(branchId))
 */
export const selectCategoriesByBranch = (branchId: string) => (state: CategoryState): Category[] => {
  let cache = categoriesByBranchCache.get(branchId)
  if (!cache) {
    cache = { categories: null, result: EMPTY_CATEGORIES }
    categoriesByBranchCache.set(branchId, cache)
  }

  if (state.categories === cache.categories) {
    return cache.result
  }

  const filtered = state.categories
    .filter((c) => c.branch_id === branchId)
    .sort((a, b) => a.order - b.order)
  cache.categories = state.categories
  cache.result = filtered.length > 0 ? filtered : EMPTY_CATEGORIES
  return cache.result
}

// Cache for selectCategoryById - keyed by categoryId
const categoryByIdCache = new Map<string, (state: CategoryState) => Category | undefined>()

/**
 * Memoized selector factory for single category by ID.
 * Caches the selector function itself to avoid recreating on each call.
 *
 * Usage: const category = useStore(selectCategoryById(categoryId))
 */
export const selectCategoryById = (id: string | null) => {
  if (!id) return () => undefined

  if (!categoryByIdCache.has(id)) {
    categoryByIdCache.set(id, (state: CategoryState) =>
      state.categories.find((c) => c.id === id)
    )
  }
  return categoryByIdCache.get(id)!
}
