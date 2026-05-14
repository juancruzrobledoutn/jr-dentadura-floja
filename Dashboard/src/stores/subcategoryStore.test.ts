/**
 * Tests for subcategoryStore - Subcategory management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSubcategoryStore } from './subcategoryStore'

vi.mock('../services/api', () => ({
  subcategoryAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { subcategoryAPI } from '../services/api'

describe('subcategoryStore', () => {
  beforeEach(() => {
    useSubcategoryStore.setState({
      subcategories: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch subcategories and populate state', async () => {
    const apiSubcategories = [
      { id: 1, name: 'Ensaladas', image: null, order: 1, category_id: 10, is_active: true },
      { id: 2, name: 'Sopas', image: null, order: 2, category_id: 10, is_active: true },
    ]
    vi.mocked(subcategoryAPI.list).mockResolvedValueOnce(apiSubcategories)

    await useSubcategoryStore.getState().fetchSubcategories()
    const state = useSubcategoryStore.getState()

    expect(state.subcategories).toHaveLength(2)
    expect(state.subcategories[0].name).toBe('Ensaladas')
    expect(state.subcategories[0].id).toBe('1')
    expect(state.subcategories[0].category_id).toBe('10')
    expect(state.isLoading).toBe(false)
  })

  it('should add a subcategory locally with auto-generated id', () => {
    const newSub = useSubcategoryStore.getState().addSubcategory({
      name: 'Wraps',
      category_id: '5',
      order: 1,
      is_active: true,
    })

    const state = useSubcategoryStore.getState()
    expect(state.subcategories).toHaveLength(1)
    expect(newSub.name).toBe('Wraps')
    expect(newSub.id).toBeTruthy()
    expect(newSub.category_id).toBe('5')
  })

  it('should delete a subcategory from the list', () => {
    useSubcategoryStore.setState({
      subcategories: [
        { id: 'sub-1', name: 'Ensaladas', category_id: '1', order: 1, is_active: true },
        { id: 'sub-2', name: 'Sopas', category_id: '1', order: 2, is_active: true },
      ],
    })

    useSubcategoryStore.getState().deleteSubcategory('sub-1')
    const state = useSubcategoryStore.getState()

    expect(state.subcategories).toHaveLength(1)
    expect(state.subcategories[0].id).toBe('sub-2')
  })
})
