/**
 * Tests for ingredientStore - Ingredient management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIngredientStore } from './ingredientStore'

vi.mock('../services/api', () => ({
  ingredientAPI: {
    list: vi.fn(),
    listGroups: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createGroup: vi.fn(),
    createSubIngredient: vi.fn(),
    deleteSubIngredient: vi.fn(),
  },
}))

import { ingredientAPI } from '../services/api'

describe('ingredientStore', () => {
  beforeEach(() => {
    useIngredientStore.setState({
      ingredients: [],
      groups: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch ingredients and populate state', async () => {
    const apiIngredients = [
      { id: 1, tenant_id: 1, name: 'Tomate', description: 'Tomate fresco', group_id: 1, group_name: 'Verduras', is_processed: false, is_active: true, created_at: '2024-01-01', sub_ingredients: [] },
      { id: 2, tenant_id: 1, name: 'Harina', description: null, group_id: 2, group_name: 'Secos', is_processed: true, is_active: true, created_at: '2024-01-01', sub_ingredients: [] },
    ]
    vi.mocked(ingredientAPI.list).mockResolvedValueOnce(apiIngredients)

    await useIngredientStore.getState().fetchIngredients()
    const state = useIngredientStore.getState()

    expect(state.ingredients).toHaveLength(2)
    expect(state.ingredients[0].name).toBe('Tomate')
    expect(state.ingredients[0].id).toBe('1')
    expect(state.ingredients[1].is_processed).toBe(true)
    expect(state.isLoading).toBe(false)
  })

  it('should create an ingredient and add to state', async () => {
    const apiIngredient = { id: 3, tenant_id: 1, name: 'Cebolla', description: 'Cebolla blanca', group_id: 1, group_name: 'Verduras', is_processed: false, is_active: true, created_at: '2024-01-01', sub_ingredients: [] }
    vi.mocked(ingredientAPI.create).mockResolvedValueOnce(apiIngredient)

    const result = await useIngredientStore.getState().createIngredientAsync({
      name: 'Cebolla',
      description: 'Cebolla blanca',
      group_id: 1,
      is_processed: false,
      is_active: true,
    })

    const state = useIngredientStore.getState()
    expect(state.ingredients).toHaveLength(1)
    expect(result.name).toBe('Cebolla')
    expect(result.id).toBe('3')
    expect(state.isLoading).toBe(false)
  })

  it('should delete an ingredient from state', async () => {
    useIngredientStore.setState({
      ingredients: [
        { id: '1', tenant_id: 1, name: 'Tomate', is_processed: false, is_active: true, created_at: '2024-01-01', sub_ingredients: [] },
        { id: '2', tenant_id: 1, name: 'Harina', is_processed: true, is_active: true, created_at: '2024-01-01', sub_ingredients: [] },
      ],
    })
    vi.mocked(ingredientAPI.delete).mockResolvedValueOnce(undefined)

    await useIngredientStore.getState().deleteIngredientAsync('1')
    const state = useIngredientStore.getState()

    expect(state.ingredients).toHaveLength(1)
    expect(state.ingredients[0].id).toBe('2')
  })
})
