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
    const baseOrder = { tenant_id: 1, customer_phone: '555', customer_email: null, delivery_address: null, delivery_instructions: null, delivery_lat: null, delivery_lng: null, estimated_ready_at: null, estimated_delivery_at: null, payment_method: null, is_paid: false, notes: null, is_active: true, created_at: null, updated_at: null }
    const apiOrders = [
      { ...baseOrder, id: 1, branch_id: 1, order_type: 'DELIVERY', status: 'pending', customer_name: 'Juan', items: [], total_cents: 5000 },
      { ...baseOrder, id: 2, branch_id: 1, order_type: 'TAKEOUT', status: 'ready', customer_name: 'Ana', items: [], total_cents: 3000 },
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
    const created = { id: 3, tenant_id: 1, branch_id: 1, order_type: 'DELIVERY', status: 'pending', customer_name: 'Carlos', customer_phone: '555', customer_email: null, delivery_address: null, delivery_instructions: null, delivery_lat: null, delivery_lng: null, estimated_ready_at: null, estimated_delivery_at: null, payment_method: null, is_paid: false, notes: null, is_active: true, items: [], total_cents: 8000, created_at: null, updated_at: null }
    vi.mocked(deliveryAPI.create).mockResolvedValueOnce(created)

    const result = await useDeliveryStore.getState().createOrder(1, {
      order_type: 'DELIVERY',
      customer_name: 'Carlos',
      customer_phone: '555',
      items: [],
    })

    const state = useDeliveryStore.getState()
    expect(state.orders).toHaveLength(1)
    expect(result.customer_name).toBe('Carlos')
    expect(state.isLoading).toBe(false)
  })

  it('should update order status in state', async () => {
    const baseOrder = { tenant_id: 1, customer_phone: '555', customer_email: null, delivery_address: null, delivery_instructions: null, delivery_lat: null, delivery_lng: null, estimated_ready_at: null, estimated_delivery_at: null, payment_method: null, is_paid: false, notes: null, is_active: true, created_at: null, updated_at: null }
    useDeliveryStore.setState({
      orders: [
        { ...baseOrder, id: 1, branch_id: 1, order_type: 'DELIVERY', status: 'pending', customer_name: 'Juan', items: [], total_cents: 5000 },
      ],
    })

    const updated = { ...baseOrder, id: 1, branch_id: 1, order_type: 'DELIVERY', status: 'in_progress', customer_name: 'Juan', items: [], total_cents: 5000 }
    vi.mocked(deliveryAPI.updateStatus).mockResolvedValueOnce(updated)

    await useDeliveryStore.getState().updateStatus(1, 'in_progress')
    const state = useDeliveryStore.getState()

    expect(state.orders[0].status).toBe('in_progress')
    expect(state.isLoading).toBe(false)
  })
})
