/**
 * Tests for restaurantStore - Restaurant/tenant management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRestaurantStore } from './restaurantStore'

vi.mock('../services/api', () => ({
  tenantAPI: {
    get: vi.fn(),
    update: vi.fn(),
  },
}))

import { tenantAPI } from '../services/api'

describe('restaurantStore', () => {
  beforeEach(() => {
    useRestaurantStore.setState({
      restaurant: null,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch restaurant and populate state', async () => {
    const apiTenant = {
      id: 1,
      name: 'Buen Sabor',
      slug: 'buen-sabor',
      description: 'Restaurante familiar',
      logo: null,
      theme_color: '#f97316',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(tenantAPI.get).mockResolvedValueOnce(apiTenant)

    await useRestaurantStore.getState().fetchRestaurant()
    const state = useRestaurantStore.getState()

    expect(state.restaurant).not.toBeNull()
    expect(state.restaurant!.name).toBe('Buen Sabor')
    expect(state.restaurant!.id).toBe('1')
    expect(state.restaurant!.slug).toBe('buen-sabor')
    expect(state.isLoading).toBe(false)
  })

  it('should update restaurant locally', () => {
    useRestaurantStore.setState({
      restaurant: {
        id: 'rest-1',
        name: 'Buen Sabor',
        slug: 'buen-sabor',
        address: 'Calle 1',
        phone: '123456',
        email: 'info@buen.com',
        theme_color: '#f97316',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    })

    useRestaurantStore.getState().updateRestaurant({
      name: 'Buen Sabor Premium',
      slug: 'buen-sabor',
      address: 'Calle 2',
      phone: '123456',
      email: 'info@buen.com',
      theme_color: '#f97316',
    })
    const state = useRestaurantStore.getState()

    expect(state.restaurant!.name).toBe('Buen Sabor Premium')
    expect(state.restaurant!.address).toBe('Calle 2')
  })

  it('should not update when restaurant is null', () => {
    useRestaurantStore.getState().updateRestaurant({
      name: 'Test',
      slug: 'test',
      address: '',
      phone: '',
      email: '',
      theme_color: '#000',
    })
    const state = useRestaurantStore.getState()

    expect(state.restaurant).toBeNull()
  })
})
