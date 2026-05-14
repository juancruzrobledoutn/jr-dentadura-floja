import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Subcategory, SubcategoryFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { subcategoryAPI, type Subcategory as APISubcategory } from '../services/api'

interface SubcategoryState {
  subcategories: Subcategory[]
  isLoading: boolean
  error: string | null
  // Actions
  setSubcategories: (subcategories: Subcategory[]) => void
  addSubcategory: (data: SubcategoryFormData) => Subcategory
  updateSubcategory: (id: string, data: Partial<SubcategoryFormData>) => void
  deleteSubcategory: (id: string) => void
  getByCategory: (categoryId: string) => Subcategory[]
  deleteByCategory: (categoryId: string) => void
  deleteByCategories: (categoryIds: string[]) => void
  // Async API actions
  fetchSubcategories: (categoryId?: number) => Promise<void>
  createSubcategoryAsync: (data: SubcategoryFormData) => Promise<Subcategory>
  updateSubcategoryAsync: (id: string, data: Partial<SubcategoryFormData>) => Promise<void>
  deleteSubcategoryAsync: (id: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Helper to convert API subcategory to frontend subcategory
function mapAPISubcategoryToFrontend(apiSubcategory: APISubcategory): Subcategory {
  return {
    id: String(apiSubcategory.id),
    name: apiSubcategory.name,
    image: apiSubcategory.image ?? undefined,
    order: apiSubcategory.order,
    category_id: String(apiSubcategory.category_id),
    is_active: apiSubcategory.is_active,
  }
}

// Empty initial state - data comes from backend API
const initialSubcategories: Subcategory[] = []

export const useSubcategoryStore = create<SubcategoryState>()(
  persist(
    (set, get) => ({
      subcategories: initialSubcategories,
      isLoading: false,
      error: null,

      setSubcategories: (subcategories) => set({ subcategories }),

      addSubcategory: (data) => {
        const subcategories = get().subcategories
        const categorySubcats = subcategories.filter(
          (s) => s.category_id === data.category_id
        )
        const orders = categorySubcats.map((s) => s.order).filter((o) => typeof o === 'number' && !isNaN(o))
        const maxOrder = orders.length > 0 ? Math.max(...orders) : 0
        const newSubcategory: Subcategory = {
          id: generateId(),
          ...data,
          order: data.order ?? maxOrder + 1,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set({ subcategories: [...subcategories, newSubcategory] })
        return newSubcategory
      },

      updateSubcategory: (id, data) =>
        set((state) => ({
          subcategories: state.subcategories.map((sub) =>
            sub.id === id
              ? { ...sub, ...data, updated_at: new Date().toISOString() }
              : sub
          ),
        })),

      deleteSubcategory: (id) =>
        set((state) => ({
          subcategories: state.subcategories.filter((sub) => sub.id !== id),
        })),

      getByCategory: (categoryId) => {
        return get()
          .subcategories.filter((s) => s.category_id === categoryId)
          .sort((a, b) => a.order - b.order)
      },

      deleteByCategory: (categoryId) =>
        set((state) => ({
          subcategories: state.subcategories.filter(
            (sub) => sub.category_id !== categoryId
          ),
        })),

      deleteByCategories: (categoryIds) => {
        const categoryIdSet = new Set(categoryIds)
        set((state) => ({
          subcategories: state.subcategories.filter(
            (sub) => !categoryIdSet.has(sub.category_id)
          ),
        }))
      },

      // Async API actions
      fetchSubcategories: async (categoryId) => {
        set({ isLoading: true, error: null })
        try {
          const apiSubcategories = await subcategoryAPI.list(categoryId)
          const subcategories = apiSubcategories.map(mapAPISubcategoryToFrontend)

          set((state) => {
            if (categoryId) {
              const otherCategories = state.subcategories.filter(
                (s) => s.category_id !== String(categoryId)
              )
              return { subcategories: [...otherCategories, ...subcategories], isLoading: false }
            }
            return { subcategories, isLoading: false }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar subcategorias'
          set({ error: message, isLoading: false })
        }
      },

      createSubcategoryAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const categoryId = parseInt(data.category_id, 10)
          if (isNaN(categoryId)) {
            const newSubcategory = get().addSubcategory(data)
            set({ isLoading: false })
            return newSubcategory
          }

          const apiSubcategory = await subcategoryAPI.create({
            category_id: categoryId,
            name: data.name,
            image: data.image,
            order: data.order,
            is_active: data.is_active,
          })

          const newSubcategory = mapAPISubcategoryToFrontend(apiSubcategory)
          set((state) => ({
            subcategories: [...state.subcategories, newSubcategory],
            isLoading: false,
          }))
          return newSubcategory
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear subcategoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateSubcategoryAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            get().updateSubcategory(id, data)
            set({ isLoading: false })
            return
          }

          await subcategoryAPI.update(numericId, {
            name: data.name,
            image: data.image,
            order: data.order,
            is_active: data.is_active,
          })

          set((state) => ({
            subcategories: state.subcategories.map((sub) =>
              sub.id === id
                ? { ...sub, ...data, updated_at: new Date().toISOString() }
                : sub
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar subcategoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteSubcategoryAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await subcategoryAPI.delete(numericId)
          }

          set((state) => ({
            subcategories: state.subcategories.filter((sub) => sub.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar subcategoria'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.SUBCATEGORIES,
      version: STORE_VERSIONS.SUBCATEGORIES,
      partialize: (state) => ({
        subcategories: state.subcategories,
      }),
      migrate: (persistedState, version) => {
        const persisted = persistedState as { subcategories: Subcategory[] }

        if (!Array.isArray(persisted.subcategories)) {
          return { subcategories: [] }
        }

        let subcategories = persisted.subcategories

        // Version 4: Clear mock data, data comes from backend
        if (version < 4) {
          subcategories = subcategories.filter(s =>
            !s.id.startsWith('sub-') &&
            !s.id.startsWith('b2-sub-') &&
            !s.id.startsWith('b3-sub-') &&
            !s.id.startsWith('b4-sub-')
          )
        }

        return { subcategories }
      },
    }
  )
)

// CRIT-01 FIX: Stable empty array reference to prevent infinite re-renders in React 19
const EMPTY_SUBCATEGORIES: Subcategory[] = []

// Selectors
// CRIT-01 FIX: Return stable empty array when subcategories is empty
export const selectSubcategories = (state: SubcategoryState) =>
  state.subcategories.length === 0 ? EMPTY_SUBCATEGORIES : state.subcategories
export const selectSubcategoryLoading = (state: SubcategoryState) => state.isLoading
export const selectSubcategoryError = (state: SubcategoryState) => state.error
