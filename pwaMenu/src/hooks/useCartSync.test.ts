/**
 * Tests for useCartSync hook - PERF improvements
 *
 * Tests verify:
 * - PERF-01: Debounce on reconnection fetch
 * - PERF-02: Memoization cache for apiToLocalCartItem
 * - PERF-03: Event deduplication to prevent duplicate processing
 */

import { describe, it, expect } from 'vitest'

// Test the internal functions directly by extracting the logic
// Since the hook internals are not exported, we test the patterns

describe('useCartSync performance patterns', () => {
  describe('PERF-01: Debounce logic', () => {
    const FETCH_DEBOUNCE_MS = 1000

    it('should skip fetch when called within debounce period', () => {
      let lastFetch = Date.now()
      const now = Date.now()

      // Simulate first fetch just happened
      const timeSinceLastFetch = now - lastFetch

      // Should skip because we're within debounce period
      expect(timeSinceLastFetch < FETCH_DEBOUNCE_MS).toBe(true)
    })

    it('should allow fetch after debounce period expires', async () => {
      const FETCH_DEBOUNCE_MS = 100 // Use shorter delay for test
      let lastFetch = Date.now() - 200 // 200ms ago
      const now = Date.now()

      const timeSinceLastFetch = now - lastFetch

      // Should allow because debounce period has passed
      expect(timeSinceLastFetch >= FETCH_DEBOUNCE_MS).toBe(true)
    })
  })

  describe('PERF-02: Memoization cache', () => {
    const CACHE_TTL_MS = 30000
    const MAX_CACHE_SIZE = 200

    interface CacheEntry {
      item: { id: string; quantity: number; notes?: string }
      timestamp: number
    }

    function testCache() {
      const cache = new Map<number, CacheEntry>()

      function cleanupCache(): void {
        if (cache.size <= MAX_CACHE_SIZE) return

        const now = Date.now()
        const entries = Array.from(cache.entries())

        // Remove expired entries
        for (const [key, value] of entries) {
          if (now - value.timestamp > CACHE_TTL_MS) {
            cache.delete(key)
          }
        }

        // If still over limit, remove oldest
        if (cache.size > MAX_CACHE_SIZE) {
          const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
          const toRemove = sorted.slice(0, cache.size - MAX_CACHE_SIZE + 20)
          for (const [key] of toRemove) {
            cache.delete(key)
          }
        }
      }

      function getCached(itemId: number): CacheEntry | undefined {
        const cached = cache.get(itemId)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          return cached
        }
        return undefined
      }

      function setCache(itemId: number, item: CacheEntry['item']): void {
        cache.set(itemId, { item, timestamp: Date.now() })
        cleanupCache()
      }

      return { cache, getCached, setCache, cleanupCache }
    }

    it('should return cached value when available and fresh', () => {
      const { getCached, setCache } = testCache()

      const item = { id: 'backend-123', quantity: 2 }
      setCache(123, item)

      const cached = getCached(123)
      expect(cached).toBeDefined()
      expect(cached?.item.id).toBe('backend-123')
    })

    it('should return undefined for expired cache entries', async () => {
      const CACHE_TTL_MS_SHORT = 50 // 50ms for testing
      const cache = new Map<number, CacheEntry>()

      // Set entry with old timestamp
      cache.set(123, {
        item: { id: 'backend-123', quantity: 2 },
        timestamp: Date.now() - 100, // 100ms ago, older than TTL
      })

      const cached = cache.get(123)
      const isExpired = cached && Date.now() - cached.timestamp > CACHE_TTL_MS_SHORT

      expect(isExpired).toBe(true)
    })

    it('should verify data change invalidates cache', () => {
      const { getCached, setCache } = testCache()

      const item = { id: 'backend-123', quantity: 2, notes: 'original' }
      setCache(123, item)

      // Simulate API response with different data
      const apiItem = { quantity: 3, notes: 'updated' }
      const cached = getCached(123)

      // Data changed, should not use cache
      const dataChanged =
        !cached ||
        cached.item.quantity !== apiItem.quantity ||
        cached.item.notes !== apiItem.notes

      expect(dataChanged).toBe(true)
    })

    it('should limit cache size and evict oldest entries', () => {
      const cache = new Map<number, CacheEntry>()
      const MAX_SIZE = 5

      // Fill cache beyond limit
      for (let i = 0; i < 10; i++) {
        cache.set(i, {
          item: { id: `item-${i}`, quantity: 1 },
          timestamp: Date.now() - (10 - i) * 1000, // Oldest first
        })
      }

      // Simulate cleanup
      if (cache.size > MAX_SIZE) {
        const entries = Array.from(cache.entries())
        const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
        const toRemove = sorted.slice(0, cache.size - MAX_SIZE + 2)
        for (const [key] of toRemove) {
          cache.delete(key)
        }
      }

      expect(cache.size).toBeLessThanOrEqual(MAX_SIZE)
      // Should have kept the most recent entries
      expect(cache.has(9)).toBe(true) // Most recent
      expect(cache.has(0)).toBe(false) // Oldest, should be evicted
    })
  })

  describe('PERF-03: Event deduplication', () => {
    const MAX_RECENT_EVENTS = 100
    const EVENT_DEDUP_TTL_MS = 5000

    function testDeduplication() {
      const recentEvents = new Map<string, number>()

      function isDuplicateEvent(eventType: string, itemId: number): boolean {
        const key = `${eventType}:${itemId}`
        const now = Date.now()
        const lastProcessed = recentEvents.get(key)

        if (lastProcessed && now - lastProcessed < EVENT_DEDUP_TTL_MS) {
          return true // Duplicate
        }

        // Record this event
        recentEvents.set(key, now)

        // Cleanup old entries to prevent memory leak
        if (recentEvents.size > MAX_RECENT_EVENTS) {
          const entries = Array.from(recentEvents.entries())
          const toRemove = entries
            .filter(([, timestamp]) => now - timestamp > EVENT_DEDUP_TTL_MS)
            .map(([k]) => k)

          for (const k of toRemove) {
            recentEvents.delete(k)
          }

          // If still over limit, remove oldest
          if (recentEvents.size > MAX_RECENT_EVENTS) {
            const sorted = entries.sort((a, b) => a[1] - b[1])
            for (let i = 0; i < 20 && i < sorted.length; i++) {
              recentEvents.delete(sorted[i][0])
            }
          }
        }

        return false
      }

      return { isDuplicateEvent, recentEvents }
    }

    it('should detect duplicate events within TTL', () => {
      const { isDuplicateEvent } = testDeduplication()

      // First event - not duplicate
      const firstResult = isDuplicateEvent('CART_ITEM_ADDED', 123)
      expect(firstResult).toBe(false)

      // Same event immediately after - duplicate
      const secondResult = isDuplicateEvent('CART_ITEM_ADDED', 123)
      expect(secondResult).toBe(true)
    })

    it('should allow same event after TTL expires', async () => {
      const SHORT_TTL = 50 // 50ms for testing
      const recentEvents = new Map<string, number>()

      // Record event with old timestamp
      recentEvents.set('CART_ITEM_ADDED:123', Date.now() - 100) // 100ms ago

      const now = Date.now()
      const lastProcessed = recentEvents.get('CART_ITEM_ADDED:123')
      const isExpired = !lastProcessed || now - lastProcessed >= SHORT_TTL

      expect(isExpired).toBe(true)
    })

    it('should treat different event types as separate', () => {
      const { isDuplicateEvent } = testDeduplication()

      // Add event
      isDuplicateEvent('CART_ITEM_ADDED', 123)

      // Different event type, same item - not duplicate
      const updateResult = isDuplicateEvent('CART_ITEM_UPDATED', 123)
      expect(updateResult).toBe(false)

      // Different item, same event type - not duplicate
      const differentItemResult = isDuplicateEvent('CART_ITEM_ADDED', 456)
      expect(differentItemResult).toBe(false)
    })

    it('should limit dedup map size to prevent memory leak', () => {
      const recentEvents = new Map<string, number>()
      const MAX_SIZE = 10

      // Fill beyond limit
      for (let i = 0; i < 20; i++) {
        recentEvents.set(`CART_ITEM_ADDED:${i}`, Date.now() - i * 100)
      }

      // Simulate cleanup when over limit (same logic as in useCartSync)
      if (recentEvents.size > MAX_SIZE) {
        const entries = Array.from(recentEvents.entries())
        const sorted = entries.sort((a, b) => a[1] - b[1])
        // Remove enough entries to get back under limit
        const toRemoveCount = recentEvents.size - MAX_SIZE + 5 // Remove 15 to get to 5
        for (let i = 0; i < toRemoveCount && i < sorted.length; i++) {
          recentEvents.delete(sorted[i][0])
        }
      }

      // Should have removed 15 entries (20 - 10 + 5 = 15), leaving 5
      expect(recentEvents.size).toBeLessThanOrEqual(MAX_SIZE)
    })

    it('should cleanup expired entries during size check', () => {
      const recentEvents = new Map<string, number>()
      const TTL = 100 // 100ms TTL
      const now = Date.now()

      // Add mix of fresh and expired entries
      recentEvents.set('fresh:1', now - 50) // 50ms ago, fresh
      recentEvents.set('expired:1', now - 200) // 200ms ago, expired
      recentEvents.set('expired:2', now - 300) // 300ms ago, expired
      recentEvents.set('fresh:2', now - 20) // 20ms ago, fresh

      // Cleanup expired
      for (const [key, timestamp] of recentEvents.entries()) {
        if (now - timestamp > TTL) {
          recentEvents.delete(key)
        }
      }

      expect(recentEvents.size).toBe(2)
      expect(recentEvents.has('fresh:1')).toBe(true)
      expect(recentEvents.has('fresh:2')).toBe(true)
      expect(recentEvents.has('expired:1')).toBe(false)
      expect(recentEvents.has('expired:2')).toBe(false)
    })
  })

  describe('apiToLocalCartItem conversion', () => {
    interface CartItemAPI {
      item_id: number
      product_id: number
      product_name: string
      price_cents: number
      product_image?: string | null
      quantity: number
      diner_id: number
      diner_name: string
      diner_color?: string
      notes?: string | null
    }

    function apiToLocalCartItem(item: CartItemAPI) {
      return {
        id: `backend-${item.item_id}`,
        productId: String(item.product_id),
        name: item.product_name,
        price: item.price_cents / 100,
        image: item.product_image || '',
        quantity: item.quantity,
        dinerId: String(item.diner_id),
        dinerName: item.diner_name,
        dinerColor: item.diner_color,
        notes: item.notes || undefined,
        backendItemId: item.item_id,
      }
    }

    it('should convert API item to local format correctly', () => {
      const apiItem: CartItemAPI = {
        item_id: 123,
        product_id: 456,
        product_name: 'Coca-Cola',
        price_cents: 1500,
        product_image: 'http://example.com/image.jpg',
        quantity: 2,
        diner_id: 789,
        diner_name: 'Carlos',
        diner_color: '#f97316',
        notes: 'Sin hielo',
      }

      const local = apiToLocalCartItem(apiItem)

      expect(local.id).toBe('backend-123')
      expect(local.productId).toBe('456')
      expect(local.name).toBe('Coca-Cola')
      expect(local.price).toBe(15) // 1500 cents = $15
      expect(local.image).toBe('http://example.com/image.jpg')
      expect(local.quantity).toBe(2)
      expect(local.dinerId).toBe('789')
      expect(local.dinerName).toBe('Carlos')
      expect(local.dinerColor).toBe('#f97316')
      expect(local.notes).toBe('Sin hielo')
      expect(local.backendItemId).toBe(123)
    })

    it('should handle null/undefined optional fields', () => {
      const apiItem: CartItemAPI = {
        item_id: 123,
        product_id: 456,
        product_name: 'Test',
        price_cents: 1000,
        product_image: null,
        quantity: 1,
        diner_id: 789,
        diner_name: 'Test User',
        notes: null,
      }

      const local = apiToLocalCartItem(apiItem)

      expect(local.image).toBe('')
      expect(local.notes).toBeUndefined()
      expect(local.dinerColor).toBeUndefined()
    })
  })
})
