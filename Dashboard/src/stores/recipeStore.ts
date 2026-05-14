/**
 * Recipe Store for Kitchen Technical Sheets
 * Manages recipes (fichas técnicas) that can be used for RAG chatbot ingestion.
 * Only accessible by KITCHEN, MANAGER, and ADMIN roles.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Recipe, RecipeFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'
import { recipeAPI, type Recipe as APIRecipe } from '../services/api'

// HIGH-29-11 FIX: Stable empty array reference to prevent infinite re-renders in React 19
const EMPTY_RECIPES: Recipe[] = []

interface RecipeState {
  recipes: Recipe[]
  categories: string[]
  isLoading: boolean
  error: string | null
  // Actions
  setRecipes: (recipes: Recipe[]) => void
  addRecipe: (data: RecipeFormData) => Recipe
  updateRecipe: (id: string, data: Partial<RecipeFormData>) => void
  deleteRecipe: (id: string) => void
  // Async API actions
  fetchRecipes: (branchId?: number, category?: string) => Promise<void>
  fetchCategories: () => Promise<void>
  createRecipeAsync: (data: RecipeFormData) => Promise<Recipe>
  updateRecipeAsync: (id: string, data: Partial<RecipeFormData>) => Promise<void>
  deleteRecipeAsync: (id: string) => Promise<void>
  ingestRecipeAsync: (id: string) => Promise<Recipe>
}

const generateId = () => crypto.randomUUID()

// Helper to convert API recipe to frontend recipe
function mapAPIRecipeToFrontend(apiRecipe: APIRecipe): Recipe {
  return {
    id: String(apiRecipe.id),
    branch_id: String(apiRecipe.branch_id),
    branch_name: apiRecipe.branch_name ?? undefined,
    product_id: apiRecipe.product_id ? String(apiRecipe.product_id) : undefined,
    product_name: apiRecipe.product_name ?? undefined,
    subcategory_id: apiRecipe.subcategory_id ? String(apiRecipe.subcategory_id) : undefined,
    subcategory_name: apiRecipe.subcategory_name ?? undefined,
    category_id: apiRecipe.category_id ? String(apiRecipe.category_id) : undefined,
    category_name: apiRecipe.category_name ?? undefined,
    name: apiRecipe.name,
    description: apiRecipe.description ?? undefined,
    short_description: apiRecipe.short_description ?? undefined,
    image: apiRecipe.image ?? undefined,
    cuisine_type: apiRecipe.cuisine_type ?? undefined,
    difficulty: apiRecipe.difficulty ?? undefined,
    prep_time_minutes: apiRecipe.prep_time_minutes ?? undefined,
    cook_time_minutes: apiRecipe.cook_time_minutes ?? undefined,
    total_time_minutes: apiRecipe.total_time_minutes ?? undefined,
    servings: apiRecipe.servings ?? undefined,
    calories_per_serving: apiRecipe.calories_per_serving ?? undefined,
    ingredients: apiRecipe.ingredients ?? [],
    preparation_steps: apiRecipe.preparation_steps ?? [],
    chef_notes: apiRecipe.chef_notes ?? undefined,
    presentation_tips: apiRecipe.presentation_tips ?? undefined,
    storage_instructions: apiRecipe.storage_instructions ?? undefined,
    allergen_ids: apiRecipe.allergen_ids ?? [],
    allergens: apiRecipe.allergens ?? [],
    dietary_tags: apiRecipe.dietary_tags ?? [],
    // Sensory profile (Phase 3)
    flavors: apiRecipe.flavors ?? [],
    textures: apiRecipe.textures ?? [],
    // Cooking info
    cooking_methods: apiRecipe.cooking_methods ?? [],
    uses_oil: apiRecipe.uses_oil ?? false,
    // Celiac safety
    is_celiac_safe: apiRecipe.is_celiac_safe ?? false,
    allergen_notes: apiRecipe.allergen_notes ?? undefined,
    // Modifications and warnings (Phase 4)
    modifications: apiRecipe.modifications ?? [],
    warnings: apiRecipe.warnings ?? [],
    // Cost and yield
    cost_cents: apiRecipe.cost_cents ?? undefined,
    suggested_price_cents: apiRecipe.suggested_price_cents ?? undefined,
    yield_quantity: apiRecipe.yield_quantity ?? undefined,
    yield_unit: apiRecipe.yield_unit ?? undefined,
    portion_size: apiRecipe.portion_size ?? undefined,
    // RAG config (Phase 5)
    risk_level: apiRecipe.risk_level ?? 'low',
    custom_rag_disclaimer: apiRecipe.custom_rag_disclaimer ?? undefined,
    // Status
    is_active: apiRecipe.is_active,
    is_ingested: apiRecipe.is_ingested,
    last_ingested_at: apiRecipe.last_ingested_at ?? undefined,
    created_at: apiRecipe.created_at,
    created_by_email: apiRecipe.created_by_email ?? undefined,
  }
}

// Helper to convert frontend recipe form data to API format
function mapFormDataToAPI(data: RecipeFormData | Partial<RecipeFormData>) {
  return {
    branch_id: data.branch_id ? parseInt(data.branch_id, 10) : undefined,
    product_id: data.product_id ? parseInt(data.product_id, 10) : null,
    subcategory_id: data.subcategory_id ? parseInt(data.subcategory_id, 10) : null,
    name: data.name,
    description: data.description,
    image: data.image,
    cuisine_type: data.cuisine_type,
    difficulty: data.difficulty,
    prep_time_minutes: data.prep_time_minutes,
    cook_time_minutes: data.cook_time_minutes,
    servings: data.servings,
    calories_per_serving: data.calories_per_serving,
    ingredients: data.ingredients,
    preparation_steps: data.preparation_steps,
    chef_notes: data.chef_notes,
    presentation_tips: data.presentation_tips,
    storage_instructions: data.storage_instructions,
    allergen_ids: data.allergen_ids,
    dietary_tags: data.dietary_tags,
    cost_cents: data.cost_cents,
  }
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      recipes: [],
      categories: [],
      isLoading: false,
      error: null,

      setRecipes: (recipes) => set({ recipes }),

      addRecipe: (data) => {
        const newRecipe: Recipe = {
          id: generateId(),
          ...data,
          ingredients: data.ingredients || [],
          preparation_steps: data.preparation_steps || [],
          allergen_ids: data.allergen_ids || [],
          allergens: [],  // Will be populated from server response
          dietary_tags: data.dietary_tags || [],
          is_active: data.is_active ?? true,
          is_ingested: false,
          created_at: new Date().toISOString(),
        }
        set((state) => ({ recipes: [...state.recipes, newRecipe] }))
        return newRecipe
      },

      updateRecipe: (id, data) =>
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id
              ? { ...recipe, ...data }
              : recipe
          ),
        })),

      deleteRecipe: (id) =>
        set((state) => ({
          recipes: state.recipes.filter((recipe) => recipe.id !== id),
        })),

      // Async API actions
      fetchRecipes: async (branchId?: number, category?: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiRecipes = await recipeAPI.list(branchId, category)
          const recipes = apiRecipes.map(mapAPIRecipeToFrontend)
          set({ recipes, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar recetas'
          set({ error: message, isLoading: false })
        }
      },

      fetchCategories: async () => {
        try {
          const categories = await recipeAPI.getCategories()
          set({ categories })
        } catch (err) {
          // HIGH-11 FIX: Log error properly using logger pattern
          const message = err instanceof Error ? err.message : 'Error al cargar categorías de recetas'
          // Categories are optional, so we set a non-blocking error message
          set((state) => ({
            ...state,
            // Only set error if there isn't already a more important one
            error: state.error || message,
          }))
        }
      },

      createRecipeAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const apiData = mapFormDataToAPI(data)
          const apiRecipe = await recipeAPI.create({
            branch_id: apiData.branch_id!,
            product_id: apiData.product_id ?? undefined,
            subcategory_id: apiData.subcategory_id ?? undefined,
            name: apiData.name!,
            description: apiData.description,
            cuisine_type: apiData.cuisine_type,
            difficulty: apiData.difficulty,
            prep_time_minutes: apiData.prep_time_minutes,
            cook_time_minutes: apiData.cook_time_minutes,
            servings: apiData.servings,
            calories_per_serving: apiData.calories_per_serving,
            ingredients: apiData.ingredients,
            preparation_steps: apiData.preparation_steps,
            chef_notes: apiData.chef_notes,
            allergen_ids: apiData.allergen_ids,
            dietary_tags: apiData.dietary_tags,
            storage_instructions: apiData.storage_instructions,
            presentation_tips: apiData.presentation_tips,
            cost_cents: apiData.cost_cents,
            image: apiData.image,
          })

          const newRecipe = mapAPIRecipeToFrontend(apiRecipe)
          set((state) => ({
            recipes: [...state.recipes, newRecipe],
            isLoading: false,
          }))
          return newRecipe
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear receta'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateRecipeAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local recipe, update locally
            get().updateRecipe(id, data)
            set({ isLoading: false })
            return
          }

          const apiData = mapFormDataToAPI(data)
          await recipeAPI.update(numericId, apiData)

          set((state) => ({
            recipes: state.recipes.map((recipe) =>
              recipe.id === id
                ? { ...recipe, ...data, updated_at: new Date().toISOString() }
                : recipe
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar receta'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteRecipeAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await recipeAPI.delete(numericId)
          }

          set((state) => ({
            recipes: state.recipes.filter((recipe) => recipe.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar receta'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      ingestRecipeAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            throw new Error('ID de receta inválido')
          }

          const apiRecipe = await recipeAPI.ingest(numericId)

          // Update the recipe in state with the returned data
          const updatedRecipe = mapAPIRecipeToFrontend(apiRecipe)
          set((state) => ({
            recipes: state.recipes.map((recipe) =>
              recipe.id === id ? updatedRecipe : recipe
            ),
            isLoading: false,
          }))

          return updatedRecipe
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al ingestar receta'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: STORAGE_KEYS.RECIPES,
      version: STORE_VERSIONS.RECIPES,
      partialize: (state) => ({
        recipes: state.recipes,
        categories: state.categories,
      }),
    }
  )
)

// Selectors
// HIGH-29-11 FIX: Return stable empty array when recipes is empty to prevent infinite re-renders
export const selectRecipes = (state: RecipeState) =>
  state.recipes.length === 0 ? EMPTY_RECIPES : state.recipes
export const selectRecipeCategories = (state: RecipeState) => state.categories
export const selectRecipeLoading = (state: RecipeState) => state.isLoading
export const selectRecipeError = (state: RecipeState) => state.error

// Recipe by branch selector helper
export const selectRecipesByBranch = (branchId: string) => (state: RecipeState) =>
  state.recipes.filter((recipe) => recipe.branch_id === branchId)

// Recipe by ID selector helper
export const selectRecipeById = (id: string) => (state: RecipeState) =>
  state.recipes.find((recipe) => recipe.id === id)
