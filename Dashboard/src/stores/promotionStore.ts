import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Promotion, PromotionFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { promotionAPI, type Promotion as APIPromotion } from '../services/api'

// HIGH-29-09 FIX: Stable empty array reference to prevent infinite re-renders in React 19
const EMPTY_PROMOTIONS: Promotion[] = []

interface PromotionState {
  promotions: Promotion[]
  isLoading: boolean
  error: string | null
  // Sync local actions
  setPromotions: (promotions: Promotion[]) => void
  addPromotion: (data: PromotionFormData) => Promotion
  updatePromotion: (id: string, data: Partial<PromotionFormData>) => void
  deletePromotion: (id: string) => void
  // Cascade cleanup actions
  removeBranchFromPromotions: (branchId: string) => void
  clearPromotionType: (promotionTypeId: string) => void
  removeProductFromPromotions: (productId: string) => void
  // Queries
  getByBranch: (branchId: string) => Promotion[]
  // Async API actions
  fetchPromotions: (branchId?: number) => Promise<void>
  createPromotionAsync: (data: PromotionFormData) => Promise<Promotion>
  updatePromotionAsync: (id: string, data: Partial<PromotionFormData>) => Promise<void>
  deletePromotionAsync: (id: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Empty initial state - data comes from backend API
const initialPromotions: Promotion[] = []

/**
 * Map API promotion to frontend promotion format.
 * API uses price_cents and integer IDs, frontend uses price (dollars) and string IDs.
 */
function mapAPIPromotionToFrontend(apiPromo: APIPromotion): Promotion {
  return {
    id: String(apiPromo.id),
    name: apiPromo.name,
    description: apiPromo.description ?? undefined,
    price: apiPromo.price_cents / 100,  // Convert cents to dollars
    image: apiPromo.image ?? undefined,
    start_date: apiPromo.start_date,
    end_date: apiPromo.end_date,
    start_time: apiPromo.start_time,
    end_time: apiPromo.end_time,
    promotion_type_id: apiPromo.promotion_type_id ?? '',
    branch_ids: apiPromo.branch_ids.map(String),  // Convert to strings
    items: apiPromo.items.map(item => ({
      product_id: String(item.product_id),
      quantity: item.quantity,
    })),
    is_active: apiPromo.is_active,
    created_at: apiPromo.created_at,
    updated_at: apiPromo.updated_at,
  }
}

export const usePromotionStore = create<PromotionState>()(
  persist(
    (set, get) => ({
      promotions: initialPromotions,
      isLoading: false,
      error: null,

      setPromotions: (promotions) => set({ promotions }),

      addPromotion: (data) => {
        const newPromotion: Promotion = {
          id: generateId(),
          ...data,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ promotions: [...state.promotions, newPromotion] }))
        return newPromotion
      },

      updatePromotion: (id, data) =>
        set((state) => ({
          promotions: state.promotions.map((promo) =>
            promo.id === id
              ? { ...promo, ...data, updated_at: new Date().toISOString() }
              : promo
          ),
        })),

      deletePromotion: (id) =>
        set((state) => ({
          promotions: state.promotions.filter((promo) => promo.id !== id),
        })),

      removeBranchFromPromotions: (branchId) =>
        set((state) => ({
          // Remove branch from promotions, delete promotion if no branches remain
          promotions: state.promotions
            .map((promo) => ({
              ...promo,
              branch_ids: promo.branch_ids.filter((id) => id !== branchId),
            }))
            .filter((promo) => promo.branch_ids.length > 0),
        })),

      clearPromotionType: (promotionTypeId) =>
        set((state) => ({
          // Delete promotions that use this promotion type (they become invalid)
          promotions: state.promotions.filter(
            (promo) => promo.promotion_type_id !== promotionTypeId
          ),
        })),

      removeProductFromPromotions: (productId) =>
        set((state) => ({
          // Remove product from promotion items, delete promotion if no items remain
          promotions: state.promotions
            .map((promo) => ({
              ...promo,
              items: promo.items.filter((item) => item.product_id !== productId),
            }))
            .filter((promo) => promo.items.length > 0),
        })),

      getByBranch: (branchId) => {
        return get().promotions.filter((promo) =>
          Array.isArray(promo.branch_ids) && promo.branch_ids.includes(branchId)
        )
      },

      // Async API actions
      fetchPromotions: async (branchId) => {
        set({ isLoading: true, error: null })
        try {
          const apiPromotions = await promotionAPI.list(branchId)
          const promotions = apiPromotions.map(mapAPIPromotionToFrontend)

          set((state) => {
            if (branchId) {
              // Replace only promotions for this branch
              const otherBranches = state.promotions.filter(
                (p) => !p.branch_ids.includes(String(branchId))
              )
              return { promotions: [...otherBranches, ...promotions], isLoading: false }
            }
            return { promotions, isLoading: false }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar promociones'
          set({ error: message, isLoading: false })
        }
      },

      createPromotionAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          // Check if all branch_ids are numeric (API branches)
          const hasLocalBranches = data.branch_ids.some(id => isNaN(parseInt(id, 10)))
          if (hasLocalBranches) {
            // Local branches, create locally
            const newPromotion = get().addPromotion(data)
            set({ isLoading: false })
            return newPromotion
          }

          const apiPromotion = await promotionAPI.create({
            name: data.name,
            description: data.description,
            price_cents: Math.round(data.price * 100),  // Convert dollars to cents
            image: data.image,
            start_date: data.start_date,
            end_date: data.end_date,
            start_time: data.start_time,
            end_time: data.end_time,
            promotion_type_id: data.promotion_type_id,
            branch_ids: data.branch_ids.map(id => parseInt(id, 10)),
            items: data.items.map(item => ({
              product_id: parseInt(item.product_id, 10),
              quantity: item.quantity,
            })),
            is_active: data.is_active,
          })

          const newPromotion = mapAPIPromotionToFrontend(apiPromotion)

          set((state) => ({
            promotions: [...state.promotions, newPromotion],
            isLoading: false,
          }))
          return newPromotion
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear promoción'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updatePromotionAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local promotion, update locally
            get().updatePromotion(id, data)
            set({ isLoading: false })
            return
          }

          const updateData: {
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
            items?: { product_id: number; quantity: number }[]
            is_active?: boolean
          } = {}

          if (data.name !== undefined) updateData.name = data.name
          if (data.description !== undefined) updateData.description = data.description
          if (data.price !== undefined) updateData.price_cents = Math.round(data.price * 100)
          if (data.image !== undefined) updateData.image = data.image
          if (data.start_date !== undefined) updateData.start_date = data.start_date
          if (data.end_date !== undefined) updateData.end_date = data.end_date
          if (data.start_time !== undefined) updateData.start_time = data.start_time
          if (data.end_time !== undefined) updateData.end_time = data.end_time
          if (data.promotion_type_id !== undefined) updateData.promotion_type_id = data.promotion_type_id
          if (data.branch_ids !== undefined) {
            updateData.branch_ids = data.branch_ids.map(bid => parseInt(bid, 10))
          }
          if (data.items !== undefined) {
            updateData.items = data.items.map(item => ({
              product_id: parseInt(item.product_id, 10),
              quantity: item.quantity,
            }))
          }
          if (data.is_active !== undefined) updateData.is_active = data.is_active

          await promotionAPI.update(numericId, updateData)

          set((state) => ({
            promotions: state.promotions.map((promo) =>
              promo.id === id
                ? { ...promo, ...data, updated_at: new Date().toISOString() }
                : promo
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar promoción'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deletePromotionAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await promotionAPI.delete(numericId)
          }

          set((state) => ({
            promotions: state.promotions.filter((promo) => promo.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar promoción'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.PROMOTIONS,
      version: STORE_VERSIONS.PROMOTIONS,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { promotions: Promotion[] }

        // Ensure promotions array exists - return new object, don't mutate
        if (!Array.isArray(persisted.promotions)) {
          return { promotions: [] }
        }

        let promotions = persisted.promotions

        if (version < 2) {
          // Migration: Add start_time, end_time, promotion_type_id to existing promotions
          promotions = promotions.map((p) => ({
            ...p,
            start_time: p.start_time ?? '00:00',
            end_time: p.end_time ?? '23:59',
            promotion_type_id: p.promotion_type_id ?? '',
          }))
        }

        // Version 4: Clear mock data, data comes from backend
        if (version < 4) {
          promotions = promotions.filter(p => !p.id.startsWith('promo-'))
        }

        return { promotions }
      },
      partialize: (state) => ({
        promotions: state.promotions,
      }),
    }
  )
)

// Selectors
// HIGH-29-09 FIX: Return stable empty array when promotions is empty to prevent infinite re-renders
export const selectPromotions = (state: PromotionState) =>
  state.promotions.length === 0 ? EMPTY_PROMOTIONS : state.promotions
export const selectPromotionLoading = (state: PromotionState) => state.isLoading
export const selectPromotionError = (state: PromotionState) => state.error
