import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Allergen, AllergenFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { allergenAPI, type Allergen as APIAllergen } from '../services/api'

// HIGH-29-10 FIX: Stable empty array reference to prevent infinite re-renders in React 19
const EMPTY_ALLERGENS: Allergen[] = []

interface AllergenState {
  allergens: Allergen[]
  isLoading: boolean
  error: string | null
  // Actions
  setAllergens: (allergens: Allergen[]) => void
  addAllergen: (data: AllergenFormData) => Allergen
  updateAllergen: (id: string, data: Partial<AllergenFormData>) => void
  deleteAllergen: (id: string) => void
  // Async API actions
  fetchAllergens: () => Promise<void>
  createAllergenAsync: (data: AllergenFormData) => Promise<Allergen>
  updateAllergenAsync: (id: string, data: Partial<AllergenFormData>) => Promise<void>
  deleteAllergenAsync: (id: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Initial common allergens
const initialAllergens: Allergen[] = [
  {
    id: 'alg-1',
    name: 'Gluten',
    icon: '🌾',
    description: 'Cereales que contienen gluten (trigo, centeno, cebada, avena)',
    is_active: true,
  },
  {
    id: 'alg-2',
    name: 'Lacteos',
    icon: '🥛',
    description: 'Leche y productos lacteos',
    is_active: true,
  },
  {
    id: 'alg-3',
    name: 'Huevos',
    icon: '🥚',
    description: 'Huevos y productos derivados',
    is_active: true,
  },
  {
    id: 'alg-4',
    name: 'Pescado',
    icon: '🐟',
    description: 'Pescado y productos derivados',
    is_active: true,
  },
  {
    id: 'alg-5',
    name: 'Mariscos',
    icon: '🦐',
    description: 'Crustaceos y moluscos',
    is_active: true,
  },
  {
    id: 'alg-6',
    name: 'Frutos Secos',
    icon: '🥜',
    description: 'Mani, nueces, almendras, avellanas, etc.',
    is_active: true,
  },
  {
    id: 'alg-7',
    name: 'Soja',
    icon: '🫘',
    description: 'Soja y productos derivados',
    is_active: true,
  },
  {
    id: 'alg-8',
    name: 'Apio',
    icon: '🥬',
    description: 'Apio y productos derivados',
    is_active: true,
  },
  {
    id: 'alg-9',
    name: 'Mostaza',
    icon: '🟡',
    description: 'Mostaza y productos derivados',
    is_active: true,
  },
  {
    id: 'alg-10',
    name: 'Sesamo',
    icon: '⚪',
    description: 'Semillas de sesamo',
    is_active: true,
  },
  {
    id: 'alg-11',
    name: 'Sulfitos',
    icon: '🍷',
    description: 'Dioxido de azufre y sulfitos',
    is_active: true,
  },
  {
    id: 'alg-12',
    name: 'Altramuces',
    icon: '🌱',
    description: 'Altramuces y productos derivados',
    is_active: true,
  },
]

// Helper to convert API allergen to frontend allergen
function mapAPIAllergenToFrontend(apiAllergen: APIAllergen): Allergen {
  return {
    id: String(apiAllergen.id),
    name: apiAllergen.name,
    icon: apiAllergen.icon ?? undefined,
    description: apiAllergen.description ?? undefined,
    is_mandatory: apiAllergen.is_mandatory,
    severity: apiAllergen.severity,
    is_active: apiAllergen.is_active,
    cross_reactions: apiAllergen.cross_reactions?.map((cr) => ({
      id: cr.id,
      cross_reacts_with_id: cr.cross_reacts_with_id,
      cross_reacts_with_name: cr.cross_reacts_with_name,
      probability: cr.probability,
      notes: cr.notes,
    })) ?? null,
  }
}

export const useAllergenStore = create<AllergenState>()(
  persist(
    (set, get) => ({
      allergens: initialAllergens,
      isLoading: false,
      error: null,

      setAllergens: (allergens) => set({ allergens }),

      addAllergen: (data) => {
        const newAllergen: Allergen = {
          id: generateId(),
          ...data,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ allergens: [...state.allergens, newAllergen] }))
        return newAllergen
      },

      updateAllergen: (id, data) =>
        set((state) => ({
          allergens: state.allergens.map((alg) =>
            alg.id === id
              ? { ...alg, ...data, updated_at: new Date().toISOString() }
              : alg
          ),
        })),

      deleteAllergen: (id) =>
        set((state) => ({
          allergens: state.allergens.filter((alg) => alg.id !== id),
        })),

      // Async API actions
      fetchAllergens: async () => {
        set({ isLoading: true, error: null })
        try {
          const apiAllergens = await allergenAPI.list()
          const allergens = apiAllergens.map(mapAPIAllergenToFrontend)
          set({ allergens, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar alergenos'
          set({ error: message, isLoading: false })
        }
      },

      createAllergenAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const apiAllergen = await allergenAPI.create({
            name: data.name,
            icon: data.icon,
            description: data.description,
            is_mandatory: data.is_mandatory,
            severity: data.severity,
            is_active: data.is_active,
          })

          const newAllergen = mapAPIAllergenToFrontend(apiAllergen)
          set((state) => ({
            allergens: [...state.allergens, newAllergen],
            isLoading: false,
          }))
          return newAllergen
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear alergeno'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateAllergenAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local allergen, update locally
            get().updateAllergen(id, data)
            set({ isLoading: false })
            return
          }

          await allergenAPI.update(numericId, {
            name: data.name,
            icon: data.icon,
            description: data.description,
            is_mandatory: data.is_mandatory,
            severity: data.severity,
            is_active: data.is_active,
          })

          set((state) => ({
            allergens: state.allergens.map((alg) =>
              alg.id === id
                ? { ...alg, ...data, updated_at: new Date().toISOString() }
                : alg
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar alergeno'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteAllergenAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await allergenAPI.delete(numericId)
          }

          set((state) => ({
            allergens: state.allergens.filter((alg) => alg.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar alergeno'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.ALLERGENS,
      version: STORE_VERSIONS.ALLERGENS,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { allergens: Allergen[] }

        // Ensure allergens array exists - return new object, don't mutate
        if (!Array.isArray(persisted.allergens)) {
          return { allergens: initialAllergens }
        }

        let allergens = persisted.allergens

        // Version 2: Non-destructive merge - only add missing initial allergens
        if (version < 2) {
          const existingIds = new Set(allergens.map(a => a.id))
          const missingAllergens = initialAllergens.filter(a => !existingIds.has(a.id))
          allergens = [...allergens, ...missingAllergens]
        }

        return { allergens }
      },
      partialize: (state) => ({
        allergens: state.allergens,
      }),
    }
  )
)

// Selectors
// HIGH-29-10 FIX: Return stable empty array when allergens is empty to prevent infinite re-renders
export const selectAllergens = (state: AllergenState) =>
  state.allergens.length === 0 ? EMPTY_ALLERGENS : state.allergens
export const selectAllergenLoading = (state: AllergenState) => state.isLoading
export const selectAllergenError = (state: AllergenState) => state.error
