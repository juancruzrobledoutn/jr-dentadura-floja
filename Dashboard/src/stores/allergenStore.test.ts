/**
 * Tests for allergenStore - Allergen management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAllergenStore } from './allergenStore'

vi.mock('../services/api', () => ({
  allergenAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { allergenAPI } from '../services/api'

describe('allergenStore', () => {
  beforeEach(() => {
    // Reset to empty state (not initial allergens) for clean tests
    useAllergenStore.setState({
      allergens: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch allergens from API and populate state', async () => {
    const apiAllergens = [
      { id: 1, name: 'Gluten', icon: '🌾', description: 'Cereales con gluten', is_mandatory: true, severity: 'severe', is_active: true, cross_reactions: null },
      { id: 2, name: 'Lacteos', icon: '🥛', description: 'Leche y derivados', is_mandatory: true, severity: 'moderate', is_active: true, cross_reactions: null },
    ]
    vi.mocked(allergenAPI.list).mockResolvedValueOnce(apiAllergens)

    await useAllergenStore.getState().fetchAllergens()
    const state = useAllergenStore.getState()

    expect(state.allergens).toHaveLength(2)
    expect(state.allergens[0].name).toBe('Gluten')
    expect(state.allergens[0].id).toBe('1') // Converted to string
    expect(state.allergens[0].is_mandatory).toBe(true)
    expect(state.isLoading).toBe(false)
  })

  it('should add an allergen locally', () => {
    const newAllergen = useAllergenStore.getState().addAllergen({
      name: 'Sulfitos',
      icon: '🍷',
      description: 'Dioxido de azufre',
      is_mandatory: true,
      severity: 'mild',
      is_active: true,
    })

    const state = useAllergenStore.getState()
    expect(state.allergens).toHaveLength(1)
    expect(newAllergen.name).toBe('Sulfitos')
    expect(newAllergen.id).toBeTruthy()
  })

  it('should update an allergen', () => {
    useAllergenStore.setState({
      allergens: [
        { id: 'a1', name: 'Gluten', icon: '🌾', description: 'Cereales', is_active: true },
      ],
    })

    useAllergenStore.getState().updateAllergen('a1', { description: 'Cereales con gluten (trigo, centeno)' })
    const state = useAllergenStore.getState()

    expect(state.allergens[0].description).toBe('Cereales con gluten (trigo, centeno)')
    expect(state.allergens[0].name).toBe('Gluten') // Unchanged
  })

  it('should delete an allergen from the list', () => {
    useAllergenStore.setState({
      allergens: [
        { id: 'a1', name: 'Gluten', icon: '🌾', is_active: true },
        { id: 'a2', name: 'Lacteos', icon: '🥛', is_active: true },
      ],
    })

    useAllergenStore.getState().deleteAllergen('a1')
    const state = useAllergenStore.getState()

    expect(state.allergens).toHaveLength(1)
    expect(state.allergens[0].name).toBe('Lacteos')
  })
})
