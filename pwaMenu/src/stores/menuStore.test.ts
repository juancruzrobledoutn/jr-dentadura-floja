import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMenuStore, selectCategories, selectProducts, selectBranchSlug, selectHasMenu } from './menuStore'
import type { MenuResponse } from '../types/backend'

// Mock the API
vi.mock('../services/api', () => ({
  menuAPI: {
    getMenu: vi.fn(),
  },
}))

import { menuAPI } from '../services/api'

const mockMenuResponse: MenuResponse = {
  branch_id: 1,
  branch_name: 'Test Branch',
  branch_slug: 'test-branch',
  categories: [
    {
      id: 1,
      name: 'Burgers',
      icon: 'burger-icon',
      image: 'burger.jpg',
      order: 1,
      subcategories: [
        { id: 11, name: 'Classic Burgers', image: 'classic.jpg', order: 1 },
        { id: 12, name: 'Gourmet Burgers', image: 'gourmet.jpg', order: 2 },
      ],
      products: [
        {
          id: 101,
          name: 'Cheeseburger',
          description: 'Classic cheeseburger',
          price_cents: 1250,
          image: 'cheese.jpg',
          category_id: 1,
          subcategory_id: 11,
          featured: true,
          popular: true,
          badge: 'Popular',
          seal: null,
          allergen_ids: [1, 2],
          is_available: true,
        },
        {
          id: 102,
          name: 'Veggie Burger',
          description: 'Plant-based burger',
          price_cents: 1400,
          image: 'veggie.jpg',
          category_id: 1,
          subcategory_id: 11,
          featured: false,
          popular: false,
          badge: null,
          seal: 'Vegan',
          allergen_ids: [],
          is_available: true,
        },
      ],
    },
    {
      id: 2,
      name: 'Drinks',
      icon: 'drink-icon',
      image: 'drinks.jpg',
      order: 2,
      subcategories: [],
      products: [
        {
          id: 201,
          name: 'Cola',
          description: 'Refreshing cola',
          price_cents: 350,
          image: 'cola.jpg',
          category_id: 2,
          subcategory_id: null,
          featured: false,
          popular: true,
          badge: null,
          seal: null,
          allergen_ids: [],
          is_available: true,
        },
      ],
    },
  ],
}

describe('menuStore', () => {
  beforeEach(() => {
    // Reset store state
    useMenuStore.setState({
      branchId: null,
      branchName: null,
      branchSlug: null,
      categories: [],
      products: [],
      isLoading: false,
      error: null,
      lastFetch: null,
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty menu', () => {
      const state = useMenuStore.getState()
      expect(state.categories).toEqual([])
      expect(state.products).toEqual([])
      expect(state.branchSlug).toBeNull()
      expect(state.isLoading).toBe(false)
    })
  })

  describe('fetchMenu', () => {
    it('fetches and converts menu from API', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)

      await useMenuStore.getState().fetchMenu('test-branch')

      const state = useMenuStore.getState()
      expect(state.branchSlug).toBe('test-branch')
      expect(state.branchName).toBe('Test Branch')
      expect(state.branchId).toBe(1)
      expect(state.categories).toHaveLength(2)
      expect(state.products).toHaveLength(3)
    })

    it('converts price_cents to price (pesos)', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)

      await useMenuStore.getState().fetchMenu('test-branch')

      const state = useMenuStore.getState()
      const cheeseburger = state.products.find(p => p.id === 101)
      expect(cheeseburger?.price).toBe(12.5) // 1250 cents -> 12.50 pesos
      expect(cheeseburger?.priceCents).toBe(1250)
    })

    it('sets loading state during fetch', async () => {
      let resolvePromise: (value: MenuResponse) => void
      const pendingPromise = new Promise<MenuResponse>(resolve => {
        resolvePromise = resolve
      })
      vi.mocked(menuAPI.getMenu).mockReturnValue(pendingPromise)

      const fetchPromise = useMenuStore.getState().fetchMenu('test-branch')

      expect(useMenuStore.getState().isLoading).toBe(true)

      resolvePromise!(mockMenuResponse)
      await fetchPromise

      expect(useMenuStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(menuAPI.getMenu).mockRejectedValue(new Error('Network error'))

      await expect(
        useMenuStore.getState().fetchMenu('test-branch')
      ).rejects.toThrow('Network error')

      const state = useMenuStore.getState()
      expect(state.error).toBe('Network error')
      expect(state.isLoading).toBe(false)
    })

    it('uses cache if already fetched recently', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)

      // First fetch
      await useMenuStore.getState().fetchMenu('test-branch')
      expect(menuAPI.getMenu).toHaveBeenCalledTimes(1)

      // Second fetch - should use cache
      await useMenuStore.getState().fetchMenu('test-branch')
      expect(menuAPI.getMenu).toHaveBeenCalledTimes(1) // Still 1
    })

    it('refetches if slug changes', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)

      await useMenuStore.getState().fetchMenu('branch-1')
      expect(menuAPI.getMenu).toHaveBeenCalledTimes(1)

      // Different slug - should refetch
      await useMenuStore.getState().fetchMenu('branch-2')
      expect(menuAPI.getMenu).toHaveBeenCalledTimes(2)
    })
  })

  describe('getProductById', () => {
    it('returns product by id', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      const product = useMenuStore.getState().getProductById(101)
      expect(product?.name).toBe('Cheeseburger')
    })

    it('returns undefined for unknown id', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      const product = useMenuStore.getState().getProductById(999)
      expect(product).toBeUndefined()
    })
  })

  describe('getCategoryById', () => {
    it('returns category by id', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      const category = useMenuStore.getState().getCategoryById(1)
      expect(category?.name).toBe('Burgers')
    })
  })

  describe('getProductsByCategory', () => {
    it('returns products filtered by category', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      const products = useMenuStore.getState().getProductsByCategory(1)
      expect(products).toHaveLength(2)
      expect(products.every(p => p.categoryId === 1)).toBe(true)
    })
  })

  describe('selectors', () => {
    it('selectCategories returns empty array constant when no categories', () => {
      const categories1 = selectCategories(useMenuStore.getState())
      const categories2 = selectCategories(useMenuStore.getState())
      expect(categories1).toBe(categories2) // Same reference
    })

    it('selectProducts returns empty array constant when no products', () => {
      const products1 = selectProducts(useMenuStore.getState())
      const products2 = selectProducts(useMenuStore.getState())
      expect(products1).toBe(products2) // Same reference
    })

    it('selectBranchSlug returns null initially', () => {
      expect(selectBranchSlug(useMenuStore.getState())).toBeNull()
    })

    it('selectHasMenu returns false when empty', () => {
      expect(selectHasMenu(useMenuStore.getState())).toBe(false)
    })

    it('selectHasMenu returns true after fetch', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      expect(selectHasMenu(useMenuStore.getState())).toBe(true)
    })
  })

  describe('clearMenu', () => {
    it('clears all menu data', async () => {
      vi.mocked(menuAPI.getMenu).mockResolvedValue(mockMenuResponse)
      await useMenuStore.getState().fetchMenu('test-branch')

      expect(useMenuStore.getState().products).toHaveLength(3)

      useMenuStore.getState().clearMenu()

      const state = useMenuStore.getState()
      expect(state.categories).toEqual([])
      expect(state.products).toEqual([])
      expect(state.branchSlug).toBeNull()
    })
  })
})
