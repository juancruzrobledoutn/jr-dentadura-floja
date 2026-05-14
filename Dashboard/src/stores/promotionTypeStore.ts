import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import type { PromotionType, PromotionTypeFormData } from '../types'

interface PromotionTypeState {
  promotionTypes: PromotionType[]
  addPromotionType: (data: PromotionTypeFormData) => PromotionType
  updatePromotionType: (id: string, data: Partial<PromotionTypeFormData>) => void
  deletePromotionType: (id: string) => void
}

// Use fixed date for initial data to avoid hydration mismatches
const INITIAL_DATE = '2024-01-01T00:00:00.000Z'

const initialPromotionTypes: PromotionType[] = [
  {
    id: 'promo-type-1',
    name: 'Happy Hour',
    description: 'Promociones de horario especial con descuentos',
    icon: '🍺',
    is_active: true,
    created_at: INITIAL_DATE,
    updated_at: INITIAL_DATE,
  },
  {
    id: 'promo-type-2',
    name: 'Combo Familiar',
    description: 'Combos pensados para familias',
    icon: '👨‍👩‍👧‍👦',
    is_active: true,
    created_at: INITIAL_DATE,
    updated_at: INITIAL_DATE,
  },
  {
    id: 'promo-type-3',
    name: '2x1',
    description: 'Promociones de dos por uno',
    icon: '🎉',
    is_active: true,
    created_at: INITIAL_DATE,
    updated_at: INITIAL_DATE,
  },
  {
    id: 'promo-type-4',
    name: 'Descuento',
    description: 'Descuentos porcentuales o fijos',
    icon: '💰',
    is_active: true,
    created_at: INITIAL_DATE,
    updated_at: INITIAL_DATE,
  },
]

export const usePromotionTypeStore = create<PromotionTypeState>()(
  persist(
    (set) => ({
      promotionTypes: initialPromotionTypes,

      addPromotionType: (data) => {
        const newPromotionType: PromotionType = {
          id: crypto.randomUUID(),
          ...data,
          created_at: new Date().toISOString(),
        }
        set((state) => ({
          promotionTypes: [...state.promotionTypes, newPromotionType],
        }))
        return newPromotionType
      },

      updatePromotionType: (id, data) =>
        set((state) => ({
          promotionTypes: state.promotionTypes.map((pt) =>
            pt.id === id
              ? { ...pt, ...data, updated_at: new Date().toISOString() }
              : pt
          ),
        })),

      deletePromotionType: (id) =>
        set((state) => ({
          promotionTypes: state.promotionTypes.filter((pt) => pt.id !== id),
        })),
    }),
    {
      name: STORAGE_KEYS.PROMOTION_TYPES,
      version: STORE_VERSIONS.PROMOTION_TYPES,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { promotionTypes: PromotionType[] }

        // Ensure promotionTypes array exists - return new object, don't mutate
        if (!Array.isArray(persisted.promotionTypes)) {
          return { promotionTypes: initialPromotionTypes }
        }

        let promotionTypes = persisted.promotionTypes

        // Version 2: Non-destructive merge - only add missing initial promotion types
        if (version < 2) {
          const existingIds = new Set(promotionTypes.map(pt => pt.id))
          const missingTypes = initialPromotionTypes.filter(pt => !existingIds.has(pt.id))
          promotionTypes = [...promotionTypes, ...missingTypes]
        }

        return { promotionTypes }
      },
    }
  )
)

// Selectors
export const selectPromotionTypes = (state: PromotionTypeState) => state.promotionTypes
