/**
 * Tests for recipeStore - Recipe (ficha técnica) management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecipeStore } from './recipeStore'

vi.mock('../services/api', () => ({
  recipeAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ingest: vi.fn(),
    getCategories: vi.fn(),
  },
}))

import { recipeAPI } from '../services/api'

describe('recipeStore', () => {
  beforeEach(() => {
    useRecipeStore.setState({
      recipes: [],
      categories: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch recipes and populate state', async () => {
    const apiRecipes = [
      {
        id: 1, branch_id: 1, branch_name: 'Central', product_id: null, product_name: null,
        subcategory_id: null, subcategory_name: null, category_id: null, category_name: null,
        name: 'Milanesa Napolitana', description: 'Clásica milanesa', short_description: null,
        image: null, cuisine_type: 'Argentina', difficulty: 'medium',
        prep_time_minutes: 20, cook_time_minutes: 30, total_time_minutes: 50,
        servings: 4, calories_per_serving: 500,
        ingredients: ['carne', 'pan rallado'], preparation_steps: ['paso 1', 'paso 2'],
        chef_notes: null, presentation_tips: null, storage_instructions: null,
        allergen_ids: [], allergens: [], dietary_tags: [],
        flavors: [], textures: [], cooking_methods: [],
        uses_oil: true, is_celiac_safe: false, allergen_notes: null,
        modifications: [], warnings: [],
        cost_cents: null, suggested_price_cents: null,
        yield_quantity: null, yield_unit: null, portion_size: null,
        risk_level: 'low', custom_rag_disclaimer: null,
        is_active: true, is_ingested: false, last_ingested_at: null,
        created_at: '2024-01-01', created_by_email: null,
      },
    ]
    vi.mocked(recipeAPI.list).mockResolvedValueOnce(apiRecipes)

    await useRecipeStore.getState().fetchRecipes()
    const state = useRecipeStore.getState()

    expect(state.recipes).toHaveLength(1)
    expect(state.recipes[0].name).toBe('Milanesa Napolitana')
    expect(state.recipes[0].id).toBe('1')
    expect(state.recipes[0].branch_id).toBe('1')
    expect(state.isLoading).toBe(false)
  })

  it('should add a recipe locally with auto-generated id', () => {
    const newRecipe = useRecipeStore.getState().addRecipe({
      name: 'Empanadas',
      branch_id: '1',
      is_active: true,
    })

    const state = useRecipeStore.getState()
    expect(state.recipes).toHaveLength(1)
    expect(newRecipe.name).toBe('Empanadas')
    expect(newRecipe.id).toBeTruthy()
    expect(newRecipe.is_ingested).toBe(false)
  })

  it('should delete a recipe from the list', () => {
    useRecipeStore.setState({
      recipes: [
        { id: 'r-1', name: 'Milanesa', branch_id: '1', is_active: true, is_ingested: false, ingredients: [], preparation_steps: [], allergen_ids: [], allergens: [], dietary_tags: [], created_at: '2024-01-01' },
        { id: 'r-2', name: 'Empanadas', branch_id: '1', is_active: true, is_ingested: false, ingredients: [], preparation_steps: [], allergen_ids: [], allergens: [], dietary_tags: [], created_at: '2024-01-01' },
      ],
    })

    useRecipeStore.getState().deleteRecipe('r-1')
    const state = useRecipeStore.getState()

    expect(state.recipes).toHaveLength(1)
    expect(state.recipes[0].id).toBe('r-2')
  })
})
