/**
 * Tests for promotionStore - Promotion management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromotionStore } from './promotionStore'

vi.mock('../services/api', () => ({
  promotionAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { promotionAPI } from '../services/api'

describe('promotionStore', () => {
  beforeEach(() => {
    usePromotionStore.setState({
      promotions: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch promotions and populate state', async () => {
    const apiPromotions = [
      {
        id: 1, name: 'Happy Hour', description: '2x1 en cervezas',
        price_cents: 50000, image: null,
        start_date: '2024-04-01', end_date: '2024-04-30',
        start_time: '17:00', end_time: '20:00',
        promotion_type_id: null, branch_ids: [1, 2],
        items: [{ product_id: 10, quantity: 2 }],
        is_active: true, created_at: '2024-03-01', updated_at: '2024-03-01',
      },
    ]
    vi.mocked(promotionAPI.list).mockResolvedValueOnce(apiPromotions)

    await usePromotionStore.getState().fetchPromotions()
    const state = usePromotionStore.getState()

    expect(state.promotions).toHaveLength(1)
    expect(state.promotions[0].name).toBe('Happy Hour')
    expect(state.promotions[0].price).toBe(500) // 50000 cents -> 500 dollars
    expect(state.promotions[0].branch_ids).toEqual(['1', '2']) // Converted to strings
    expect(state.promotions[0].items[0].product_id).toBe('10')
    expect(state.isLoading).toBe(false)
  })

  it('should add a promotion locally', () => {
    const newPromo = usePromotionStore.getState().addPromotion({
      name: 'Promo Almuerzo',
      price: 150,
      start_date: '2024-05-01',
      end_date: '2024-05-31',
      start_time: '12:00',
      end_time: '15:00',
      promotion_type_id: '',
      branch_ids: ['1'],
      items: [{ product_id: 'p1', quantity: 1 }],
      is_active: true,
    })

    const state = usePromotionStore.getState()
    expect(state.promotions).toHaveLength(1)
    expect(newPromo.name).toBe('Promo Almuerzo')
    expect(newPromo.id).toBeTruthy()
  })

  it('should remove a branch from all promotions', () => {
    usePromotionStore.setState({
      promotions: [
        { id: 'p1', name: 'Promo 1', price: 100, start_date: '', end_date: '', start_time: '', end_time: '', promotion_type_id: '', branch_ids: ['1', '2'], items: [], is_active: true },
        { id: 'p2', name: 'Promo 2', price: 200, start_date: '', end_date: '', start_time: '', end_time: '', promotion_type_id: '', branch_ids: ['2', '3'], items: [], is_active: true },
      ],
    })

    usePromotionStore.getState().removeBranchFromPromotions('2')
    const state = usePromotionStore.getState()

    expect(state.promotions[0].branch_ids).toEqual(['1'])
    expect(state.promotions[1].branch_ids).toEqual(['3'])
  })

  it('should remove a product from all promotions', () => {
    usePromotionStore.setState({
      promotions: [
        { id: 'p1', name: 'Combo', price: 300, start_date: '', end_date: '', start_time: '', end_time: '', promotion_type_id: '', branch_ids: ['1'], items: [{ product_id: 'prod1', quantity: 2 }, { product_id: 'prod2', quantity: 1 }], is_active: true },
      ],
    })

    usePromotionStore.getState().removeProductFromPromotions('prod1')
    const state = usePromotionStore.getState()

    expect(state.promotions[0].items).toHaveLength(1)
    expect(state.promotions[0].items[0].product_id).toBe('prod2')
  })
})
