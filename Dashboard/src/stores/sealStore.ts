import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProductSeal, SealFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'

interface SealState {
  seals: ProductSeal[]
  // Actions
  setSeals: (seals: ProductSeal[]) => void
  addSeal: (data: SealFormData) => ProductSeal
  updateSeal: (id: string, data: Partial<SealFormData>) => void
  deleteSeal: (id: string) => void
}

const generateId = () => crypto.randomUUID()

// Initial common seals for dietary and special characteristics
const initialSeals: ProductSeal[] = [
  {
    id: 'seal-1',
    name: 'Vegano',
    color: '#22c55e',
    icon: '🌱',
    is_active: true,
  },
  {
    id: 'seal-2',
    name: 'Vegetariano',
    color: '#22c55e',
    icon: '🥗',
    is_active: true,
  },
  {
    id: 'seal-3',
    name: 'Sin Gluten',
    color: '#f59e0b',
    icon: '🌾',
    is_active: true,
  },
  {
    id: 'seal-4',
    name: 'Organico',
    color: '#84cc16',
    icon: '🍃',
    is_active: true,
  },
  {
    id: 'seal-5',
    name: 'Sin Lactosa',
    color: '#06b6d4',
    icon: '🥛',
    is_active: true,
  },
  {
    id: 'seal-6',
    name: 'Bajo en Sodio',
    color: '#8b5cf6',
    icon: '🧂',
    is_active: true,
  },
]

export const useSealStore = create<SealState>()(
  persist(
    (set) => ({
      seals: initialSeals,

      setSeals: (seals) => set({ seals }),

      addSeal: (data) => {
        const newSeal: ProductSeal = {
          id: generateId(),
          ...data,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ seals: [...state.seals, newSeal] }))
        return newSeal
      },

      updateSeal: (id, data) =>
        set((state) => ({
          seals: state.seals.map((seal) =>
            seal.id === id
              ? { ...seal, ...data, updated_at: new Date().toISOString() }
              : seal
          ),
        })),

      deleteSeal: (id) =>
        set((state) => ({
          seals: state.seals.filter((seal) => seal.id !== id),
        })),
    }),
    {
      name: STORAGE_KEYS.SEALS,
      version: STORE_VERSIONS.SEALS,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { seals: ProductSeal[] }

        // Ensure seals array exists
        if (!Array.isArray(persisted.seals)) {
          return { seals: initialSeals }
        }

        let seals = persisted.seals

        // Version 1: Non-destructive merge - only add missing initial seals
        if (version < 1) {
          const existingIds = new Set(seals.map(s => s.id))
          const missingSeals = initialSeals.filter(s => !existingIds.has(s.id))
          seals = [...seals, ...missingSeals]
        }

        return { seals }
      },
    }
  )
)

// Selectors
export const selectSeals = (state: SealState) => state.seals
