import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Restaurant, RestaurantFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { tenantAPI, type Tenant } from '../services/api'

interface RestaurantState {
  restaurant: Restaurant | null
  isLoading: boolean
  error: string | null
  // Sync local actions
  setRestaurant: (restaurant: Restaurant) => void
  updateRestaurant: (data: RestaurantFormData) => void
  createRestaurant: (data: RestaurantFormData) => Restaurant
  clearRestaurant: () => void
  // Async API actions
  fetchRestaurant: () => Promise<void>
  updateRestaurantAsync: (data: RestaurantFormData) => Promise<void>
}

const generateId = () => crypto.randomUUID()

// Empty initial state - data comes from backend API
const initialRestaurant: Restaurant | null = null

/**
 * Map API tenant to frontend restaurant format.
 * Note: Backend Tenant doesn't have address, phone, email - these are frontend-only fields
 * kept in localStorage until backend schema is extended.
 */
function mapAPITenantToFrontend(tenant: Tenant, existingRestaurant?: Restaurant | null): Restaurant {
  return {
    id: String(tenant.id),
    name: tenant.name,
    slug: tenant.slug,
    description: tenant.description ?? undefined,
    logo: tenant.logo ?? undefined,
    theme_color: tenant.theme_color,
    // Preserve frontend-only fields from existing restaurant
    address: existingRestaurant?.address ?? '',
    phone: existingRestaurant?.phone ?? '',
    email: existingRestaurant?.email ?? '',
    created_at: tenant.created_at,
    updated_at: tenant.created_at, // API doesn't have updated_at for tenant
  }
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set, get) => ({
      restaurant: initialRestaurant,
      isLoading: false,
      error: null,

      setRestaurant: (restaurant) => set({ restaurant }),

      createRestaurant: (data) => {
        const newRestaurant: Restaurant = {
          id: generateId(),
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set({ restaurant: newRestaurant })
        return newRestaurant
      },

      updateRestaurant: (data) =>
        set((state) => {
          if (!state.restaurant) return state
          return {
            restaurant: {
              ...state.restaurant,
              ...data,
              updated_at: new Date().toISOString(),
            },
          }
        }),

      clearRestaurant: () => set({ restaurant: null }),

      // Async API actions
      fetchRestaurant: async () => {
        set({ isLoading: true, error: null })
        try {
          const tenant = await tenantAPI.get()
          const existingRestaurant = get().restaurant
          const restaurant = mapAPITenantToFrontend(tenant, existingRestaurant)

          set({ restaurant, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar restaurante'
          set({ error: message, isLoading: false })
        }
      },

      updateRestaurantAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const currentRestaurant = get().restaurant
          if (!currentRestaurant) {
            set({ isLoading: false })
            return
          }

          const numericId = parseInt(currentRestaurant.id, 10)
          if (isNaN(numericId)) {
            // Local restaurant, update locally
            get().updateRestaurant(data)
            set({ isLoading: false })
            return
          }

          // Only update fields that the API supports
          const updateData: {
            name?: string
            description?: string
            logo?: string
            theme_color?: string
          } = {}

          if (data.name !== undefined) updateData.name = data.name
          if (data.description !== undefined) updateData.description = data.description
          if (data.logo !== undefined) updateData.logo = data.logo
          if (data.theme_color !== undefined) updateData.theme_color = data.theme_color

          await tenantAPI.update(updateData)

          // Update local state with all fields (including frontend-only)
          set((state) => ({
            restaurant: state.restaurant
              ? {
                  ...state.restaurant,
                  ...data,
                  updated_at: new Date().toISOString(),
                }
              : null,
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar restaurante'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.RESTAURANT,
      version: STORE_VERSIONS.RESTAURANT,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { restaurant: Restaurant | null }

        // Version 2: Clear mock data, data comes from backend
        if (version < 2) {
          // Check if it's mock data
          if (persisted.restaurant?.id === 'restaurant-1') {
            return { restaurant: null }
          }
        }

        return { restaurant: persisted.restaurant ?? null }
      },
      partialize: (state) => ({
        restaurant: state.restaurant,
      }),
    }
  )
)

// Selectors
export const selectRestaurant = (state: RestaurantState) => state.restaurant
export const selectRestaurantLoading = (state: RestaurantState) => state.isLoading
export const selectRestaurantError = (state: RestaurantState) => state.error
