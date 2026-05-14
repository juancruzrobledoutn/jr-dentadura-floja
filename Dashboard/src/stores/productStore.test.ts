/**
 * Tests for productStore - Product management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProductStore, selectProducts, selectProductsByCategory, selectFeaturedProducts } from './productStore'

vi.mock('../services/api', () => ({
  productAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { productAPI } from '../services/api'

describe('productStore', () => {
  beforeEach(() => {
    useProductStore.setState({
      products: [],
      isLoading: false,
      error: null,
      lastFetch: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch products and populate state', async () => {
    const apiProducts = [
      {
        id: 1, name: 'Milanesa', description: 'Con papas', image: null,
        category_id: 1, subcategory_id: null, featured: true, popular: false,
        badge: null, seal: null, allergen_ids: [], allergens: [],
        is_active: true, branch_prices: [{ branch_id: 1, price_cents: 15000, is_available: true }],
        recipe_id: null, inherits_from_recipe: false, recipe_name: null,
      },
    ]
    vi.mocked(productAPI.list).mockResolvedValueOnce(apiProducts)

    await useProductStore.getState().fetchProducts()
    const state = useProductStore.getState()

    expect(state.products).toHaveLength(1)
    expect(state.products[0].name).toBe('Milanesa')
    expect(state.products[0].price).toBe(150) // Cents to dollars: 15000/100
    expect(state.products[0].id).toBe('1')
    expect(state.isLoading).toBe(false)
  })

  it('should add a product locally', () => {
    const newProduct = useProductStore.getState().addProduct({
      name: 'Pizza',
      description: 'Muzzarella',
      price: 200,
      category_id: 'cat-1',
      subcategory_id: '',
      featured: false,
      popular: true,
      is_active: true,
    })

    const state = useProductStore.getState()
    expect(state.products).toHaveLength(1)
    expect(newProduct.name).toBe('Pizza')
    expect(newProduct.id).toBeTruthy()
  })

  it('should update a product', () => {
    useProductStore.setState({
      products: [
        { id: 'p1', name: 'Pizza', description: '', price: 200, category_id: 'c1', subcategory_id: '', featured: false, popular: false, is_active: true, allergen_ids: [], branch_prices: [], use_branch_prices: false },
      ],
    })

    useProductStore.getState().updateProduct('p1', { name: 'Pizza Especial', price: 350 })
    const state = useProductStore.getState()

    expect(state.products[0].name).toBe('Pizza Especial')
    expect(state.products[0].price).toBe(350)
  })

  it('should remove allergen from all products', () => {
    useProductStore.setState({
      products: [
        { id: 'p1', name: 'Pizza', description: '', price: 200, category_id: 'c1', subcategory_id: '', featured: false, popular: false, is_active: true, allergen_ids: ['a1', 'a2'], branch_prices: [], use_branch_prices: false },
        { id: 'p2', name: 'Ensalada', description: '', price: 100, category_id: 'c1', subcategory_id: '', featured: false, popular: false, is_active: true, allergen_ids: ['a1'], branch_prices: [], use_branch_prices: false },
      ],
    })

    useProductStore.getState().removeAllergenFromProducts('a1')
    const state = useProductStore.getState()

    expect(state.products[0].allergen_ids).toEqual(['a2'])
    expect(state.products[1].allergen_ids).toEqual([])
  })
})
