/**
 * Tests for categoryStore - Category management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCategoryStore, selectCategories, selectCategoriesByBranch } from './categoryStore'

vi.mock('../services/api', () => ({
  categoryAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { categoryAPI } from '../services/api'

describe('categoryStore', () => {
  beforeEach(() => {
    useCategoryStore.setState({
      categories: [],
      isLoading: false,
      error: null,
      lastFetch: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch categories and populate state', async () => {
    const apiCategories = [
      { id: 1, name: 'Entradas', icon: '🥗', image: null, order: 1, branch_id: 1, is_active: true },
      { id: 2, name: 'Platos Principales', icon: '🍽️', image: null, order: 2, branch_id: 1, is_active: true },
    ]
    vi.mocked(categoryAPI.list).mockResolvedValueOnce(apiCategories)

    await useCategoryStore.getState().fetchCategories()
    const state = useCategoryStore.getState()

    expect(state.categories).toHaveLength(2)
    expect(state.categories[0].name).toBe('Entradas')
    expect(state.categories[0].id).toBe('1')
    expect(state.categories[0].branch_id).toBe('1')
    expect(state.isLoading).toBe(false)
  })

  it('should add a category locally with auto-generated id', () => {
    const newCat = useCategoryStore.getState().addCategory({
      name: 'Postres',
      branch_id: '1',
      order: 1,
      is_active: true,
    })

    const state = useCategoryStore.getState()
    expect(state.categories).toHaveLength(1)
    expect(newCat.name).toBe('Postres')
    expect(newCat.id).toBeTruthy()
    expect(newCat.branch_id).toBe('1')
  })

  it('should delete a category from the list', () => {
    useCategoryStore.setState({
      categories: [
        { id: 'cat-1', name: 'Entradas', branch_id: '1', order: 1 },
        { id: 'cat-2', name: 'Postres', branch_id: '1', order: 2 },
      ],
    })

    useCategoryStore.getState().deleteCategory('cat-1')
    const state = useCategoryStore.getState()

    expect(state.categories).toHaveLength(1)
    expect(state.categories[0].id).toBe('cat-2')
  })

  it('should filter categories by branch using memoized selector', () => {
    useCategoryStore.setState({
      categories: [
        { id: 'c1', name: 'Entradas', branch_id: '1', order: 1 },
        { id: 'c2', name: 'Postres', branch_id: '2', order: 1 },
        { id: 'c3', name: 'Bebidas', branch_id: '1', order: 2 },
      ],
    })

    const branch1Selector = selectCategoriesByBranch('1')
    const result = branch1Selector(useCategoryStore.getState())

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Entradas')
    expect(result[1].name).toBe('Bebidas')
  })
})
