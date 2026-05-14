import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Ingredient, IngredientGroup, IngredientFormData, SubIngredientFormData, SubIngredient } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import {
  ingredientAPI,
  type Ingredient as APIIngredient,
  type IngredientGroup as APIIngredientGroup,
  type SubIngredient as APISubIngredient,
} from '../services/api'

interface IngredientState {
  ingredients: Ingredient[]
  groups: IngredientGroup[]
  isLoading: boolean
  error: string | null

  // Async API actions
  fetchIngredients: (groupId?: number) => Promise<void>
  fetchGroups: () => Promise<void>
  createIngredientAsync: (data: IngredientFormData) => Promise<Ingredient>
  updateIngredientAsync: (id: string, data: Partial<IngredientFormData>) => Promise<void>
  deleteIngredientAsync: (id: string) => Promise<void>
  createGroupAsync: (name: string, description?: string, icon?: string) => Promise<IngredientGroup>
  createSubIngredientAsync: (ingredientId: string, data: SubIngredientFormData) => Promise<void>
  deleteSubIngredientAsync: (ingredientId: string, subIngredientId: number) => Promise<void>
}

// Helper to convert API sub-ingredient to frontend sub-ingredient
function mapAPISubIngredientToFrontend(apiSub: APISubIngredient): SubIngredient {
  return {
    id: apiSub.id,
    ingredient_id: apiSub.ingredient_id,
    name: apiSub.name,
    description: apiSub.description ?? undefined,
    is_active: apiSub.is_active,
  }
}

// Helper to convert API ingredient to frontend ingredient
function mapAPIIngredientToFrontend(apiIngredient: APIIngredient): Ingredient {
  return {
    id: String(apiIngredient.id),
    tenant_id: apiIngredient.tenant_id,
    name: apiIngredient.name,
    description: apiIngredient.description ?? undefined,
    group_id: apiIngredient.group_id ?? undefined,
    group_name: apiIngredient.group_name ?? undefined,
    is_processed: apiIngredient.is_processed,
    is_active: apiIngredient.is_active,
    created_at: apiIngredient.created_at,
    sub_ingredients: (apiIngredient.sub_ingredients || []).map(mapAPISubIngredientToFrontend),
  }
}

// Helper to convert API group to frontend group
function mapAPIGroupToFrontend(apiGroup: APIIngredientGroup): IngredientGroup {
  return {
    id: String(apiGroup.id),
    name: apiGroup.name,
    description: apiGroup.description ?? undefined,
    icon: apiGroup.icon ?? undefined,
    is_active: apiGroup.is_active,
  }
}

export const useIngredientStore = create<IngredientState>()(
  persist(
    (set) => ({
      ingredients: [],
      groups: [],
      isLoading: false,
      error: null,

      fetchIngredients: async (groupId?: number) => {
        set({ isLoading: true, error: null })
        try {
          const apiIngredients = await ingredientAPI.list(groupId)
          const ingredients = apiIngredients.map(mapAPIIngredientToFrontend)
          set({ ingredients, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar ingredientes'
          set({ error: message, isLoading: false })
        }
      },

      fetchGroups: async () => {
        set({ isLoading: true, error: null })
        try {
          const apiGroups = await ingredientAPI.listGroups()
          const groups = apiGroups.map(mapAPIGroupToFrontend)
          set({ groups, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar grupos'
          set({ error: message, isLoading: false })
        }
      },

      createIngredientAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const apiIngredient = await ingredientAPI.create({
            name: data.name,
            description: data.description,
            group_id: data.group_id,
            is_processed: data.is_processed,
          })

          const newIngredient = mapAPIIngredientToFrontend(apiIngredient)
          set((state) => ({
            ingredients: [...state.ingredients, newIngredient],
            isLoading: false,
          }))
          return newIngredient
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear ingrediente'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateIngredientAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            set({ isLoading: false })
            return
          }

          const apiIngredient = await ingredientAPI.update(numericId, {
            name: data.name,
            description: data.description,
            group_id: data.group_id,
            is_processed: data.is_processed,
          })

          const updatedIngredient = mapAPIIngredientToFrontend(apiIngredient)
          set((state) => ({
            ingredients: state.ingredients.map((ing) =>
              ing.id === id ? updatedIngredient : ing
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar ingrediente'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteIngredientAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await ingredientAPI.delete(numericId)
          }

          set((state) => ({
            ingredients: state.ingredients.filter((ing) => ing.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar ingrediente'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      createGroupAsync: async (name, description, icon) => {
        set({ isLoading: true, error: null })
        try {
          const apiGroup = await ingredientAPI.createGroup({
            name,
            description,
            icon,
          })

          const newGroup = mapAPIGroupToFrontend(apiGroup)
          set((state) => ({
            groups: [...state.groups, newGroup],
            isLoading: false,
          }))
          return newGroup
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear grupo'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      createSubIngredientAsync: async (ingredientId, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(ingredientId, 10)
          if (isNaN(numericId)) {
            set({ isLoading: false })
            return
          }

          const apiSubIngredient = await ingredientAPI.createSubIngredient(numericId, {
            name: data.name,
            description: data.description,
          })

          const newSubIngredient = mapAPISubIngredientToFrontend(apiSubIngredient)

          // Update the ingredient with the new sub-ingredient
          set((state) => ({
            ingredients: state.ingredients.map((ing) =>
              ing.id === ingredientId
                ? { ...ing, sub_ingredients: [...ing.sub_ingredients, newSubIngredient] }
                : ing
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear sub-ingrediente'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteSubIngredientAsync: async (ingredientId, subIngredientId) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(ingredientId, 10)
          if (isNaN(numericId)) {
            set({ isLoading: false })
            return
          }

          await ingredientAPI.deleteSubIngredient(numericId, subIngredientId)

          // Update the ingredient without the deleted sub-ingredient
          set((state) => ({
            ingredients: state.ingredients.map((ing) =>
              ing.id === ingredientId
                ? {
                    ...ing,
                    sub_ingredients: ing.sub_ingredients.filter(
                      (sub) => sub.id !== subIngredientId
                    ),
                  }
                : ing
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar sub-ingrediente'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.INGREDIENTS,
      version: STORE_VERSIONS.INGREDIENTS,
      partialize: (state) => ({
        ingredients: state.ingredients,
        groups: state.groups,
      }),
    }
  )
)

// CRIT-02 FIX: Stable empty array references to prevent infinite re-renders in React 19
const EMPTY_INGREDIENTS: Ingredient[] = []
const EMPTY_GROUPS: IngredientGroup[] = []

// Selectors
// CRIT-02 FIX: Return stable empty arrays when empty
export const selectIngredients = (state: IngredientState) =>
  state.ingredients.length === 0 ? EMPTY_INGREDIENTS : state.ingredients
export const selectIngredientGroups = (state: IngredientState) =>
  state.groups.length === 0 ? EMPTY_GROUPS : state.groups
export const selectIngredientLoading = (state: IngredientState) => state.isLoading
export const selectIngredientError = (state: IngredientState) => state.error
