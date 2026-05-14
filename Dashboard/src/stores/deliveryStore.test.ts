/**
 * Tests for deliveryStore - Delivery/takeout order management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDeliveryStore } from './deliveryStore'

vi.mock('../services/api', () => ({
  deliveryAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}))

import { deliveryAPI } from '../services/api'

describe('deliveryStore', () => {
  beforeEach(() => {
    useDeliveryStore.setState({
      orders: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch delivery orders and populate state', async () => {
    const apiOrders = [
      { id: 1, branch_id: 1, type: 'delivery', status: 'pending', customer_name: 'Juan', items: [], total_cents: 5000 },
      { id: 2, branch_id: 1, type: 'takeout', status: 'ready', customer_name: 'Ana', items: [], total_cents: 3000 },
    ]
    vi.mocked(deliveryAPI.list).mockResolvedValueOnce(apiOrders)

    await useDeliveryStore.getState().fetchOrders(1)
    const state = useDeliveryStore.getState()

    expect(state.orders).toHaveLength(2)
    expect(state.orders[0].customer_name).toBe('Juan')
    expect(state.orders[1].status).toBe('ready')
    expect(state.isLoading).toBe(false)
  })

  it('should create an order and prepend to state', async () => {
    const created = { id: 3, branch_id: 1, type: 'delivery', status: 'pending', customer_name: 'Carlos', items: [], total_cents: 8000 }
    vi.mocked(deliveryAPI.create).mockResolvedValueOnce(created)

    const result = await useDeliveryStore.getState().createOrder(1, {
      type: 'delivery',
      customer_name: 'Carlos',
      items: [],
    })

    const state = useDeliveryStore.getState()
    expect(state.orders).toHaveLength(1)
    expect(result.customer_name).toBe('Carlos')
    expect(state.isLoading).toBe(false)
  })

  it('should update order status in state', async () => {
    useDeliveryStore.setState({
      orders: [
        { id: 1, branch_id: 1, type: 'delivery', status: 'pending', customer_name: 'Juan', items: [], total_cents: 5000 },
      ],
    })

    const updated = { id: 1, branch_id: 1, type: 'delivery', status: 'in_progress', customer_name: 'Juan', items: [], total_cents: 5000 }
    vi.mocked(deliveryAPI.updateStatus).mockResolvedValueOnce(updated)

    await useDeliveryStore.getState().updateStatus(1, 'in_progress')
    const state = useDeliveryStore.getState()

    expect(state.orders[0].status).toBe('in_progress')
    expect(state.isLoading).toBe(false)
  })
})
