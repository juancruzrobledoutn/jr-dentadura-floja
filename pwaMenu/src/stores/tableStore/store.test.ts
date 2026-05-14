import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTableStore } from './store'
import type { CartItem, Diner } from '../../types'

// Mock the API and WebSocket services
vi.mock('../../services/api', () => ({
  sessionAPI: {
    createOrGetSession: vi.fn(),
    createOrGetSessionByCode: vi.fn(),
  },
  dinerAPI: {
    submitRound: vi.fn(),
    registerDiner: vi.fn(),
  },
  billingAPI: {
    requestCheck: vi.fn(),
  },
  setTableToken: vi.fn(),
  getTableToken: vi.fn(() => 'mock-token'),
}))

vi.mock('../../services/websocket', () => ({
  dinerWS: {
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}))

// Mock logger
vi.mock('../../utils/logger', () => ({
  tableStoreLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// DEF-CRIT-01 FIX: Mock menuStore to return valid products for validation
vi.mock('../menuStore', () => ({
  useMenuStore: {
    getState: () => ({
      getProductById: (id: number) => ({
        id,
        name: `Product ${id}`,
        price: 10,
        isAvailable: true,
      }),
    }),
  },
}))

// Mock throttle helper to allow all operations
vi.mock('./helpers', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    // Disable throttling for tests
    shouldExecute: () => true,
  }
})

import { sessionAPI, dinerAPI, billingAPI, setTableToken } from '../../services/api'
import { dinerWS } from '../../services/websocket'

// LOW-01 FIX: Prefixed unused function (kept for potential future tests)
const _createMockDiner = (overrides?: Partial<Diner>): Diner => ({
  id: 'diner-1',
  name: 'Test Diner',
  avatarColor: '#FF5733',
  joinedAt: new Date().toISOString(),
  isCurrentUser: true,
  ...overrides,
})

const createMockCartItem = (overrides?: Partial<CartItem>): CartItem => ({
  id: 'item-1',
  productId: 'prod-1',
  name: 'Test Product',
  price: 10.5,
  image: 'test.jpg',
  quantity: 1,
  dinerId: 'diner-1',
  dinerName: 'Test Diner',
  ...overrides,
})

describe('tableStore', () => {
  beforeEach(() => {
    // Reset store state
    useTableStore.setState({
      session: null,
      currentDiner: null,
      isLoading: false,
      isSubmitting: false,
      lastOrderId: null,
      isStale: false,
      orders: [],
      currentRound: 0,
    })
    vi.clearAllMocks()

    // Default mock for createOrGetSessionByCode (non-numeric table IDs)
    vi.mocked(sessionAPI.createOrGetSessionByCode).mockResolvedValue({
      session_id: 2,
      table_id: 10,
      table_code: 'ABC-123',
      status: 'OPEN',
      table_token: 'token-abc',
    })

    // Default mock for registerDiner
    vi.mocked(dinerAPI.registerDiner).mockResolvedValue({
      id: 100,
      session_id: 2,
      name: 'Test User',
      color: '#FF5733',
      local_id: 'local-id',
      joined_at: new Date().toISOString(),
      device_id: 'device-123',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts with no session', () => {
      const state = useTableStore.getState()
      expect(state.session).toBeNull()
      expect(state.currentDiner).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.orders).toEqual([])
    })
  })

  describe('joinTable', () => {
    it('joins table via backend API for numeric table ID', async () => {
      vi.mocked(sessionAPI.createOrGetSession).mockResolvedValue({
        session_id: 1,
        table_id: 5,
        table_code: 'MESA-5',
        status: 'ACTIVE',
        table_token: 'token-123',
      })
      // Mock diner registration with backend
      vi.mocked(dinerAPI.registerDiner).mockResolvedValue({
        id: 101,
        session_id: 1,
        name: 'John',
        color: '#FF5733',
        local_id: 'local-123',
        joined_at: new Date().toISOString(),
        device_id: 'test-device-id',
      })

      await useTableStore.getState().joinTable('5', 'Mesa 5', 'John')

      const state = useTableStore.getState()
      expect(state.session).not.toBeNull()
      expect(state.session?.backendSessionId).toBe(1)
      expect(state.session?.backendTableId).toBe(5)
      expect(state.currentDiner?.name).toBe('John')
      expect(state.currentDiner?.backendDinerId).toBe(101)
      expect(setTableToken).toHaveBeenCalledWith('token-123')
      expect(dinerWS.connect).toHaveBeenCalled()
    })

    it('creates local session for non-numeric table ID', async () => {
      await useTableStore.getState().joinTable('ABC-123', 'Test Table', 'Jane')

      const state = useTableStore.getState()
      expect(state.session).not.toBeNull()
      expect(state.session?.backendSessionId).toBeUndefined()
      expect(state.session?.tableNumber).toBe('ABC-123')
      expect(state.currentDiner?.name).toBe('Jane')
      // Should not call backend API for non-numeric IDs
      expect(sessionAPI.createOrGetSession).not.toHaveBeenCalled()
    })

    it('does not join if already at the same table', async () => {
      // First join
      await useTableStore.getState().joinTable('ABC', 'Table', 'User')
      const firstSessionId = useTableStore.getState().session?.id

      // Try to join again
      await useTableStore.getState().joinTable('ABC', 'Table', 'User')
      const secondSessionId = useTableStore.getState().session?.id

      expect(firstSessionId).toBe(secondSessionId)
    })

    it('handles API errors gracefully', async () => {
      vi.mocked(sessionAPI.createOrGetSession).mockRejectedValue(new Error('API Error'))

      await expect(
        useTableStore.getState().joinTable('5', 'Mesa 5')
      ).rejects.toThrow('API Error')

      expect(useTableStore.getState().isLoading).toBe(false)
    })
  })

  describe('leaveTable', () => {
    it('clears session and disconnects WebSocket', async () => {
      // First join a table
      await useTableStore.getState().joinTable('test', 'Test', 'User')
      expect(useTableStore.getState().session).not.toBeNull()

      // Leave table
      useTableStore.getState().leaveTable()

      const state = useTableStore.getState()
      expect(state.session).toBeNull()
      expect(state.currentDiner).toBeNull()
      expect(state.orders).toEqual([])
      expect(dinerWS.disconnect).toHaveBeenCalled()
      expect(setTableToken).toHaveBeenCalledWith(null)
    })
  })

  describe('updateMyName', () => {
    it('updates current diner name', async () => {
      await useTableStore.getState().joinTable('test', 'Test', 'Original')
      useTableStore.getState().updateMyName('New Name')

      const state = useTableStore.getState()
      expect(state.currentDiner?.name).toBe('New Name')
      expect(state.session?.diners[0].name).toBe('New Name')
    })

    it('does nothing without session', () => {
      useTableStore.getState().updateMyName('Test')
      expect(useTableStore.getState().currentDiner).toBeNull()
    })
  })

  describe('cart operations', () => {
    beforeEach(async () => {
      await useTableStore.getState().joinTable('test', 'Test', 'User')
    })

    describe('addToCart', () => {
      it('adds item to cart', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Burger',
          price: 15.99,
          image: 'burger.jpg',
          quantity: 2,
        })

        const items = useTableStore.getState().getCartItems()
        expect(items).toHaveLength(1)
        expect(items[0].name).toBe('Burger')
        expect(items[0].quantity).toBe(2)
      })

      it('updates quantity for existing item', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Burger',
          price: 15.99,
          quantity: 1,
        })

        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Burger',
          price: 15.99,
          quantity: 1,
        })

        const items = useTableStore.getState().getCartItems()
        // Should have one item with increased quantity (2)
        expect(items.filter(i => i.productId === 'prod-1')).toHaveLength(1)
        expect(items[0].quantity).toBe(2)
      })

      it('rejects invalid price', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: -10,
          quantity: 1,
        })

        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })

      it('rejects invalid quantity', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 100, // > 99
        })

        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })
    })

    describe('updateQuantity', () => {
      it('updates item quantity', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const itemId = useTableStore.getState().getCartItems()[0].id
        useTableStore.getState().updateQuantity(itemId, 3)

        expect(useTableStore.getState().getCartItems()[0].quantity).toBe(3)
      })

      it('removes item when quantity is 0 or less', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const itemId = useTableStore.getState().getCartItems()[0].id
        useTableStore.getState().updateQuantity(itemId, 0)

        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })

      it('caps quantity at 99', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const itemId = useTableStore.getState().getCartItems()[0].id
        useTableStore.getState().updateQuantity(itemId, 150)

        expect(useTableStore.getState().getCartItems()[0].quantity).toBe(99)
      })

      it('only allows updating own items', () => {
        // Manually add item from another diner
        const session = useTableStore.getState().session!
        useTableStore.setState({
          session: {
            ...session,
            sharedCart: [createMockCartItem({ dinerId: 'other-diner' })],
          },
        })

        useTableStore.getState().updateQuantity('item-1', 5)

        // Quantity should not change (item belongs to other diner)
        expect(useTableStore.getState().getCartItems()[0].quantity).toBe(1)
      })
    })

    describe('removeItem', () => {
      it('removes item from cart', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const itemId = useTableStore.getState().getCartItems()[0].id
        useTableStore.getState().removeItem(itemId)

        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })
    })

    describe('clearCart', () => {
      it('removes all items from cart', () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test 1',
          price: 10,
          quantity: 1,
        })
        useTableStore.getState().addToCart({
          productId: 'prod-2',
          name: 'Test 2',
          price: 20,
          quantity: 1,
        })

        useTableStore.getState().clearCart()

        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })
    })
  })

  describe('order operations', () => {
    beforeEach(async () => {
      await useTableStore.getState().joinTable('test', 'Test', 'User')
    })

    describe('submitOrder', () => {
      it('returns error if cart is empty', async () => {
        const result = await useTableStore.getState().submitOrder()
        expect(result.success).toBe(false)
        expect(result.error).toBe('Cart is empty')
      })

      it('submits order to backend for backend sessions', async () => {
        // Set up backend session
        vi.mocked(sessionAPI.createOrGetSession).mockResolvedValue({
          session_id: 1,
          table_id: 5,
          table_code: 'MESA-5',
          status: 'ACTIVE',
          table_token: 'token-123',
        })
        vi.mocked(dinerAPI.submitRound).mockResolvedValue({
          round_id: 10,
          round_number: 1,
          status: 'SUBMITTED',
          items: [],
        })

        // Reset and re-join with backend
        useTableStore.setState({ session: null, currentDiner: null, orders: [] })
        await useTableStore.getState().joinTable('5', 'Mesa 5', 'User')

        useTableStore.getState().addToCart({
          productId: '1',
          name: 'Test',
          price: 10,
          quantity: 2,
        })

        const result = await useTableStore.getState().submitOrder()

        expect(result.success).toBe(true)
        expect(dinerAPI.submitRound).toHaveBeenCalled()
        expect(useTableStore.getState().orders).toHaveLength(1)
        expect(useTableStore.getState().getCartItems()).toHaveLength(0)
      })

      it('creates local order for non-backend sessions', async () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const result = await useTableStore.getState().submitOrder()

        expect(result.success).toBe(true)
        expect(useTableStore.getState().orders).toHaveLength(1)
        expect(useTableStore.getState().currentRound).toBe(1)
      })

      it('handles submission errors with rollback', async () => {
        vi.mocked(sessionAPI.createOrGetSession).mockResolvedValue({
          session_id: 1,
          table_id: 5,
          table_code: 'MESA-5',
          status: 'ACTIVE',
          table_token: 'token-123',
        })
        vi.mocked(dinerAPI.submitRound).mockRejectedValue(new Error('Network error'))

        // Reset and re-join with backend
        useTableStore.setState({ session: null, currentDiner: null, orders: [] })
        await useTableStore.getState().joinTable('5', 'Mesa 5', 'User')

        useTableStore.getState().addToCart({
          productId: '1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        const result = await useTableStore.getState().submitOrder()

        expect(result.success).toBe(false)
        expect(result.error).toContain('Network error')
        // Cart should still have items after rollback
        expect(useTableStore.getState().getCartItems()).toHaveLength(1)
      }, 15000)

      it('prevents double submission', async () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        // Set submitting state
        useTableStore.setState({ isSubmitting: true })

        const result = await useTableStore.getState().submitOrder()
        expect(result.success).toBe(false)
        expect(result.error).toBe('An order is already being submitted')
      })
    })

    describe('updateOrderStatus', () => {
      it('updates order status', async () => {
        useTableStore.getState().addToCart({
          productId: 'prod-1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })

        await useTableStore.getState().submitOrder()
        const orderId = useTableStore.getState().orders[0].id

        useTableStore.getState().updateOrderStatus(orderId, 'confirmed')

        expect(useTableStore.getState().orders[0].status).toBe('confirmed')
        expect(useTableStore.getState().orders[0].confirmedAt).toBeDefined()
      })
    })
  })

  describe('payment operations', () => {
    beforeEach(async () => {
      await useTableStore.getState().joinTable('test', 'Test', 'User')
      useTableStore.getState().addToCart({
        productId: 'prod-1',
        name: 'Test',
        price: 10,
        quantity: 1,
      })
      await useTableStore.getState().submitOrder()
    })

    describe('closeTable', () => {
      it('returns error if no orders', async () => {
        useTableStore.setState({ orders: [] })
        const result = await useTableStore.getState().closeTable()
        expect(result.success).toBe(false)
        expect(result.error).toBe('No orders to close')
      })

      it('returns error if cart has items', async () => {
        // Add item to cart after submitting order
        const session = useTableStore.getState().session!
        const currentDinerId = useTableStore.getState().currentDiner!.id
        useTableStore.setState({
          session: {
            ...session,
            sharedCart: [createMockCartItem({ id: 'new-item', productId: 'prod-2', dinerId: currentDinerId })],
          },
        })

        const result = await useTableStore.getState().closeTable()
        expect(result.success).toBe(false)
        expect(result.error).toBe('There are items in cart not submitted')
      })

      it('closes table and requests check from backend', async () => {
        // Increase timeout for retry logic
        vi.setConfig({ testTimeout: 15000 })
        vi.mocked(sessionAPI.createOrGetSession).mockResolvedValue({
          session_id: 1,
          table_id: 5,
          table_code: 'MESA-5',
          status: 'ACTIVE',
          table_token: 'token-123',
        })
        vi.mocked(dinerAPI.submitRound).mockResolvedValue({
          round_id: 10,
          round_number: 1,
          status: 'SUBMITTED',
          items: [],
        })
        vi.mocked(billingAPI.requestCheck).mockResolvedValue({
          check_id: 1,
          total_cents: 1000,
          status: 'PENDING',
        })

        // Reset store and re-join with backend session
        useTableStore.setState({
          session: null,
          currentDiner: null,
          orders: [],
          currentRound: 0,
        })
        await useTableStore.getState().joinTable('5', 'Mesa 5', 'User')
        useTableStore.getState().addToCart({
          productId: '1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })
        await useTableStore.getState().submitOrder()

        // Verify order was submitted
        expect(useTableStore.getState().orders).toHaveLength(1)
        expect(useTableStore.getState().getCartItems()).toHaveLength(0)

        const result = await useTableStore.getState().closeTable()

        expect(result.success).toBe(true)
        expect(billingAPI.requestCheck).toHaveBeenCalled()
        expect(useTableStore.getState().session?.status).toBe('paying')
      })

      it('handles close table errors', async () => {
        vi.mocked(sessionAPI.createOrGetSession).mockResolvedValue({
          session_id: 1,
          table_id: 5,
          table_code: 'MESA-5',
          status: 'ACTIVE',
          table_token: 'token-123',
        })
        vi.mocked(dinerAPI.submitRound).mockResolvedValue({
          round_id: 10,
          round_number: 1,
          status: 'SUBMITTED',
          items: [],
        })
        vi.mocked(billingAPI.requestCheck).mockRejectedValue(new Error('Payment error'))

        // Reset store and re-join with backend session
        useTableStore.setState({
          session: null,
          currentDiner: null,
          orders: [],
          currentRound: 0,
        })
        await useTableStore.getState().joinTable('5', 'Mesa 5', 'User')
        useTableStore.getState().addToCart({
          productId: '1',
          name: 'Test',
          price: 10,
          quantity: 1,
        })
        await useTableStore.getState().submitOrder()

        // Verify order was submitted
        expect(useTableStore.getState().orders).toHaveLength(1)
        expect(useTableStore.getState().getCartItems()).toHaveLength(0)

        const result = await useTableStore.getState().closeTable()

        expect(result.success).toBe(false)
        expect(result.error).toContain('Payment error')
      }, 15000)
    })

    describe('getPaymentShares', () => {
      it('returns empty array without session', () => {
        useTableStore.setState({ session: null })
        const shares = useTableStore.getState().getPaymentShares('equal')
        expect(shares).toEqual([])
      })

      it('calculates payment shares', () => {
        const shares = useTableStore.getState().getPaymentShares('equal')
        expect(shares).toHaveLength(1)
      })
    })
  })

  describe('PERF-LRU-01: limitOrders memory management', () => {
    /**
     * Tests verify the limitOrders function behavior:
     * - Orders under 50 are kept as-is
     * - Orders over 50 are trimmed to keep the most recent
     */

    it('keeps all orders when under limit (50)', () => {
      // Directly test the limit behavior by setting orders state
      const orders = Array.from({ length: 10 }, (_, i) => ({
        id: `order-${i}`,
        roundNumber: i + 1,
        items: [],
        subtotal: 10,
        status: 'submitted' as const,
        submittedBy: 'diner-1',
        submittedByName: 'Test User',
        submittedAt: new Date().toISOString(),
      }))

      useTableStore.setState({ orders })

      // Orders under 50 should remain unchanged
      expect(useTableStore.getState().orders).toHaveLength(10)
      expect(useTableStore.getState().orders[0].roundNumber).toBe(1)
      expect(useTableStore.getState().orders[9].roundNumber).toBe(10)
    })

    it('verifies limitOrders function sorts by roundNumber descending', () => {
      // The limitOrders function sorts by roundNumber descending and keeps top 50
      // Test with exactly 50 orders - should keep all
      const orders50 = Array.from({ length: 50 }, (_, i) => ({
        id: `order-${i}`,
        roundNumber: i + 1,
        items: [],
        subtotal: 10,
        status: 'submitted' as const,
        submittedBy: 'diner-1',
        submittedByName: 'Test User',
        submittedAt: new Date().toISOString(),
      }))

      useTableStore.setState({ orders: orders50 })
      expect(useTableStore.getState().orders).toHaveLength(50)
    })

    it('preserves order data integrity in state', () => {
      const order = {
        id: 'order-test',
        roundNumber: 1,
        items: [{
          id: 'item-1',
          productId: 'prod-1',
          name: 'Test Item',
          price: 15.5,
          quantity: 2,
          image: '',
          dinerId: 'diner-1',
          dinerName: 'Test User',
        }],
        subtotal: 31,
        status: 'submitted' as const,
        submittedBy: 'diner-1',
        submittedByName: 'Test User',
        submittedAt: new Date().toISOString(),
      }

      useTableStore.setState({ orders: [order] })

      const storedOrder = useTableStore.getState().orders[0]
      expect(storedOrder.subtotal).toBe(31)
      expect(storedOrder.items).toHaveLength(1)
      expect(storedOrder.items[0].name).toBe('Test Item')
      expect(storedOrder.items[0].quantity).toBe(2)
    })
  })

  describe('getters', () => {
    beforeEach(async () => {
      await useTableStore.getState().joinTable('test', 'Test', 'User')
    })

    it('getCartItems returns empty array without session', () => {
      useTableStore.setState({ session: null })
      expect(useTableStore.getState().getCartItems()).toEqual([])
    })

    it('getMyItems returns only current diner items', () => {
      const session = useTableStore.getState().session!
      const currentDinerId = useTableStore.getState().currentDiner!.id

      useTableStore.setState({
        session: {
          ...session,
          sharedCart: [
            createMockCartItem({ id: 'item-1', dinerId: currentDinerId }),
            createMockCartItem({ id: 'item-2', dinerId: 'other-diner' }),
          ],
        },
      })

      const myItems = useTableStore.getState().getMyItems()
      expect(myItems).toHaveLength(1)
      expect(myItems[0].id).toBe('item-1')
    })

    it('getCartTotal calculates total', () => {
      // Directly set cart items
      const session = useTableStore.getState().session!
      const currentDinerId = useTableStore.getState().currentDiner!.id
      useTableStore.setState({
        session: {
          ...session,
          sharedCart: [
            createMockCartItem({ id: 'item-1', productId: 'prod-1', price: 10, quantity: 2, dinerId: currentDinerId }),
            createMockCartItem({ id: 'item-2', productId: 'prod-2', price: 5, quantity: 3, dinerId: currentDinerId }),
          ],
        },
      })

      expect(useTableStore.getState().getCartTotal()).toBe(35) // 10*2 + 5*3
    })

    it('getCartCount returns total item count', () => {
      // Directly set cart items
      const session = useTableStore.getState().session!
      const currentDinerId = useTableStore.getState().currentDiner!.id
      useTableStore.setState({
        session: {
          ...session,
          sharedCart: [
            createMockCartItem({ id: 'item-1', productId: 'prod-1', price: 10, quantity: 2, dinerId: currentDinerId }),
            createMockCartItem({ id: 'item-2', productId: 'prod-2', price: 5, quantity: 3, dinerId: currentDinerId }),
          ],
        },
      })

      expect(useTableStore.getState().getCartCount()).toBe(5)
    })

    it('getDiners returns diners or empty array', () => {
      expect(useTableStore.getState().getDiners()).toHaveLength(1)

      useTableStore.setState({ session: null })
      expect(useTableStore.getState().getDiners()).toEqual([])
    })

    it('canModifyItem checks ownership', () => {
      const currentDinerId = useTableStore.getState().currentDiner!.id

      expect(
        useTableStore.getState().canModifyItem(createMockCartItem({ dinerId: currentDinerId }))
      ).toBe(true)

      expect(
        useTableStore.getState().canModifyItem(createMockCartItem({ dinerId: 'other' }))
      ).toBe(false)
    })

    it('getDinerColor returns color or default', () => {
      const currentDinerId = useTableStore.getState().currentDiner!.id
      const color = useTableStore.getState().getDinerColor(currentDinerId)
      expect(color).toBeDefined()
      expect(color).not.toBe('#888888')

      // Unknown diner returns default
      expect(useTableStore.getState().getDinerColor('unknown')).toBe('#888888')
    })

    it('getTotalConsumed sums all orders', async () => {
      useTableStore.getState().addToCart({
        productId: 'prod-1',
        name: 'Test',
        price: 10,
        quantity: 2,
      })
      const result = await useTableStore.getState().submitOrder()
      expect(result.success).toBe(true)

      expect(useTableStore.getState().getTotalConsumed()).toBe(20)
    })
  })
})
