import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isValidPrice,
  isValidQuantity,
  generateDinerName,
  calculateCartTotal,
  calculateDinerTotal,
  calculateTotalConsumed,
  calculateTotalByDiner,
  calculatePaymentShares,
  getSessionAgeHours,
  shouldExecute,
  clearThrottleMap,
  withRetry,
  limitOrders,
  MAX_ORDERS_IN_MEMORY,
} from './helpers'
import type { CartItem, Diner, OrderRecord } from '../../types'

describe('helpers', () => {
  beforeEach(() => {
    clearThrottleMap()
  })

  describe('isValidPrice', () => {
    it('returns true for positive numbers', () => {
      expect(isValidPrice(10)).toBe(true)
      expect(isValidPrice(0.01)).toBe(true)
      expect(isValidPrice(999.99)).toBe(true)
    })

    it('returns false for zero', () => {
      expect(isValidPrice(0)).toBe(false)
    })

    it('returns false for negative numbers', () => {
      expect(isValidPrice(-1)).toBe(false)
      expect(isValidPrice(-0.01)).toBe(false)
    })

    it('returns false for non-numbers', () => {
      expect(isValidPrice('10')).toBe(false)
      expect(isValidPrice(null)).toBe(false)
      expect(isValidPrice(undefined)).toBe(false)
      expect(isValidPrice({})).toBe(false)
    })

    it('returns false for Infinity and NaN', () => {
      expect(isValidPrice(Infinity)).toBe(false)
      expect(isValidPrice(-Infinity)).toBe(false)
      expect(isValidPrice(NaN)).toBe(false)
    })
  })

  describe('isValidQuantity', () => {
    it('returns true for integers 1-99', () => {
      expect(isValidQuantity(1)).toBe(true)
      expect(isValidQuantity(50)).toBe(true)
      expect(isValidQuantity(99)).toBe(true)
    })

    it('returns false for zero', () => {
      expect(isValidQuantity(0)).toBe(false)
    })

    it('returns false for numbers > 99', () => {
      expect(isValidQuantity(100)).toBe(false)
      expect(isValidQuantity(1000)).toBe(false)
    })

    it('returns false for decimals', () => {
      expect(isValidQuantity(1.5)).toBe(false)
      expect(isValidQuantity(2.1)).toBe(false)
    })

    it('returns false for negative numbers', () => {
      expect(isValidQuantity(-1)).toBe(false)
    })

    it('returns false for non-numbers', () => {
      expect(isValidQuantity('5')).toBe(false)
      expect(isValidQuantity(null)).toBe(false)
      expect(isValidQuantity(undefined)).toBe(false)
    })
  })

  describe('generateDinerName', () => {
    it('generates name with 1-based index', () => {
      expect(generateDinerName(0)).toBe('Diner 1')
      expect(generateDinerName(1)).toBe('Diner 2')
      expect(generateDinerName(9)).toBe('Diner 10')
    })
  })

  describe('calculateCartTotal', () => {
    it('returns 0 for empty array', () => {
      expect(calculateCartTotal([])).toBe(0)
    })

    it('calculates total correctly', () => {
      const items: CartItem[] = [
        { id: '1', productId: 'p1', name: 'Item 1', price: 10, quantity: 2, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
        { id: '2', productId: 'p2', name: 'Item 2', price: 5, quantity: 3, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
      ]
      expect(calculateCartTotal(items)).toBe(35) // (10*2) + (5*3)
    })
  })

  describe('calculateDinerTotal', () => {
    it('returns 0 if diner has no items', () => {
      const items: CartItem[] = [
        { id: '1', productId: 'p1', name: 'Item 1', price: 10, quantity: 2, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
      ]
      expect(calculateDinerTotal(items, 'd2')).toBe(0)
    })

    it('calculates diner total correctly', () => {
      const items: CartItem[] = [
        { id: '1', productId: 'p1', name: 'Item 1', price: 10, quantity: 2, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
        { id: '2', productId: 'p2', name: 'Item 2', price: 5, quantity: 3, image: '', dinerId: 'd2', dinerName: 'Diner 2' },
        { id: '3', productId: 'p3', name: 'Item 3', price: 8, quantity: 1, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
      ]
      expect(calculateDinerTotal(items, 'd1')).toBe(28) // (10*2) + (8*1)
      expect(calculateDinerTotal(items, 'd2')).toBe(15) // (5*3)
    })
  })

  describe('calculateTotalConsumed', () => {
    it('returns 0 for empty orders', () => {
      expect(calculateTotalConsumed([])).toBe(0)
    })

    it('sums all order subtotals', () => {
      const orders: OrderRecord[] = [
        { id: '1', roundNumber: 1, items: [], subtotal: 100, status: 'submitted', submittedBy: 'd1', submittedByName: 'Diner 1', submittedAt: '' },
        { id: '2', roundNumber: 2, items: [], subtotal: 50, status: 'submitted', submittedBy: 'd1', submittedByName: 'Diner 1', submittedAt: '' },
      ]
      expect(calculateTotalConsumed(orders)).toBe(150)
    })
  })

  describe('calculateTotalByDiner', () => {
    it('returns 0 if diner has no items in orders', () => {
      const orders: OrderRecord[] = [
        {
          id: '1',
          roundNumber: 1,
          items: [{ id: '1', productId: 'p1', name: 'Item', price: 10, quantity: 1, image: '', dinerId: 'd1', dinerName: 'Diner 1' }],
          subtotal: 10,
          status: 'submitted',
          submittedBy: 'd1',
          submittedByName: 'Diner 1',
          submittedAt: '',
        },
      ]
      expect(calculateTotalByDiner(orders, 'd2')).toBe(0)
    })

    it('calculates total across multiple orders', () => {
      const orders: OrderRecord[] = [
        {
          id: '1',
          roundNumber: 1,
          items: [
            { id: '1', productId: 'p1', name: 'Item 1', price: 10, quantity: 2, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
            { id: '2', productId: 'p2', name: 'Item 2', price: 5, quantity: 1, image: '', dinerId: 'd2', dinerName: 'Diner 2' },
          ],
          subtotal: 25,
          status: 'submitted',
          submittedBy: 'd1',
          submittedByName: 'Diner 1',
          submittedAt: '',
        },
        {
          id: '2',
          roundNumber: 2,
          items: [
            { id: '3', productId: 'p3', name: 'Item 3', price: 15, quantity: 1, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
          ],
          subtotal: 15,
          status: 'submitted',
          submittedBy: 'd1',
          submittedByName: 'Diner 1',
          submittedAt: '',
        },
      ]
      expect(calculateTotalByDiner(orders, 'd1')).toBe(35) // (10*2) + (15*1)
      expect(calculateTotalByDiner(orders, 'd2')).toBe(5) // (5*1)
    })
  })

  describe('calculatePaymentShares', () => {
    const diners: Diner[] = [
      { id: 'd1', name: 'Diner 1', avatarColor: '#000', joinedAt: '', isCurrentUser: true },
      { id: 'd2', name: 'Diner 2', avatarColor: '#111', joinedAt: '', isCurrentUser: false },
    ]

    const orders: OrderRecord[] = [
      {
        id: '1',
        roundNumber: 1,
        items: [
          { id: '1', productId: 'p1', name: 'Item 1', price: 30, quantity: 1, image: '', dinerId: 'd1', dinerName: 'Diner 1' },
          { id: '2', productId: 'p2', name: 'Item 2', price: 20, quantity: 1, image: '', dinerId: 'd2', dinerName: 'Diner 2' },
        ],
        subtotal: 50,
        status: 'submitted',
        submittedBy: 'd1',
        submittedByName: 'Diner 1',
        submittedAt: '',
      },
    ]

    it('returns empty array for no diners', () => {
      expect(calculatePaymentShares([], orders, 'equal')).toEqual([])
    })

    it('splits equally', () => {
      const shares = calculatePaymentShares(diners, orders, 'equal')
      expect(shares).toHaveLength(2)
      expect(shares[0].amount).toBe(25) // 50/2
      expect(shares[1].amount).toBe(25)
    })

    it('splits by consumption', () => {
      const shares = calculatePaymentShares(diners, orders, 'byConsumption')
      expect(shares).toHaveLength(2)
      expect(shares[0].amount).toBe(30) // d1 consumed 30
      expect(shares[1].amount).toBe(20) // d2 consumed 20
    })

    it('returns zero for custom split', () => {
      const shares = calculatePaymentShares(diners, orders, 'custom')
      expect(shares).toHaveLength(2)
      expect(shares[0].amount).toBe(0)
      expect(shares[1].amount).toBe(0)
    })
  })

  describe('getSessionAgeHours', () => {
    it('calculates hours correctly', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      expect(getSessionAgeHours(twoHoursAgo)).toBe(2)
    })

    it('returns 0 for recent sessions', () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
      expect(getSessionAgeHours(recent)).toBe(0)
    })
  })

  describe('shouldExecute', () => {
    it('returns true on first call', () => {
      expect(shouldExecute('test-key', 100)).toBe(true)
    })

    it('returns false within delay period', () => {
      expect(shouldExecute('test-key-2', 1000)).toBe(true)
      expect(shouldExecute('test-key-2', 1000)).toBe(false)
    })

    it('allows different keys independently', () => {
      expect(shouldExecute('key-a', 100)).toBe(true)
      expect(shouldExecute('key-b', 100)).toBe(true)
      expect(shouldExecute('key-a', 100)).toBe(false)
      expect(shouldExecute('key-b', 100)).toBe(false)
    })

    it('allows execution after delay', async () => {
      expect(shouldExecute('delayed-key', 50)).toBe(true)
      expect(shouldExecute('delayed-key', 50)).toBe(false)

      await new Promise(resolve => setTimeout(resolve, 60))

      expect(shouldExecute('delayed-key', 50)).toBe(true)
    })
  })

  describe('withRetry', () => {
    it('returns result on successful first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await withRetry(fn, { maxRetries: 3 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success')

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('throws after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'))

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('always fails')

      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })
  })

  describe('limitOrders (PERF-LRU-01)', () => {
    const createOrder = (roundNumber: number): OrderRecord => ({
      id: `order-${roundNumber}`,
      roundNumber,
      items: [],
      subtotal: 10,
      status: 'submitted',
      submittedBy: 'diner-1',
      submittedByName: 'Test User',
      submittedAt: new Date().toISOString(),
    })

    it('returns same array when under limit', () => {
      const orders = Array.from({ length: 10 }, (_, i) => createOrder(i + 1))
      const result = limitOrders(orders)

      expect(result).toHaveLength(10)
      expect(result).toBe(orders) // Same reference when no limiting needed
    })

    it('returns same array when exactly at limit', () => {
      const orders = Array.from({ length: MAX_ORDERS_IN_MEMORY }, (_, i) => createOrder(i + 1))
      const result = limitOrders(orders)

      expect(result).toHaveLength(MAX_ORDERS_IN_MEMORY)
      expect(result).toBe(orders) // Same reference
    })

    it('limits orders to MAX_ORDERS_IN_MEMORY when over limit', () => {
      const orders = Array.from({ length: 60 }, (_, i) => createOrder(i + 1))
      const result = limitOrders(orders)

      expect(result).toHaveLength(MAX_ORDERS_IN_MEMORY)
    })

    it('keeps most recent orders (highest round numbers)', () => {
      const orders = Array.from({ length: 60 }, (_, i) => createOrder(i + 1))
      const result = limitOrders(orders)

      // Should have kept orders with roundNumber 11-60 (the 50 most recent)
      const roundNumbers = result.map(o => o.roundNumber)
      expect(Math.max(...roundNumbers)).toBe(60) // Most recent
      expect(Math.min(...roundNumbers)).toBe(11) // 60 - 50 + 1
    })

    it('sorts by roundNumber descending', () => {
      // Create orders in random order
      const orders = [5, 2, 8, 1, 9, 3, 7, 4, 6, 10].map(createOrder)

      // Add more to exceed limit (need 51+ to trigger sorting)
      for (let i = 11; i <= 55; i++) {
        orders.push(createOrder(i))
      }

      const result = limitOrders(orders)

      // First item should be highest roundNumber
      expect(result[0].roundNumber).toBe(55)
      // Last item should be lowest of the kept orders
      expect(result[result.length - 1].roundNumber).toBe(6)
    })

    it('preserves order data integrity', () => {
      const orderWithItems: OrderRecord = {
        id: 'order-100',
        roundNumber: 100,
        items: [
          { id: 'item-1', productId: 'prod-1', name: 'Burger', price: 15, quantity: 2, image: '', dinerId: 'd1', dinerName: 'User' },
          { id: 'item-2', productId: 'prod-2', name: 'Fries', price: 5, quantity: 1, image: '', dinerId: 'd1', dinerName: 'User' },
        ],
        subtotal: 35,
        status: 'confirmed',
        submittedBy: 'diner-1',
        submittedByName: 'Test User',
        submittedAt: '2024-01-01T12:00:00Z',
      }

      // Create 55 orders, with our special order being the most recent
      const orders = Array.from({ length: 54 }, (_, i) => createOrder(i + 1))
      orders.push(orderWithItems)

      const result = limitOrders(orders)

      // Find our special order
      const found = result.find(o => o.id === 'order-100')
      expect(found).toBeDefined()
      expect(found?.items).toHaveLength(2)
      expect(found?.subtotal).toBe(35)
      expect(found?.status).toBe('confirmed')
    })

    it('handles empty array', () => {
      const result = limitOrders([])
      expect(result).toHaveLength(0)
    })

    it('handles single order', () => {
      const orders = [createOrder(1)]
      const result = limitOrders(orders)
      expect(result).toHaveLength(1)
      expect(result[0].roundNumber).toBe(1)
    })
  })
})
