/**
 * Hook for real-time cart synchronization across devices.
 *
 * Listens for CART_* WebSocket events and updates the local cart state
 * when another diner at the same table adds, updates, or removes items.
 *
 * This enables the "shared cart" feature where all diners see each other's
 * cart items in real-time before submitting the round.
 *
 * PERF-01: Added debounce on reconnection to prevent multiple fetches
 * PERF-02: Added memoization cache for apiToLocalCartItem
 * PERF-03: Added event deduplication to prevent duplicate processing
 */

import { useEffect, useRef, useCallback } from 'react'
import { dinerWS } from '../services/websocket'
import { dinerAPI } from '../services/api'
import { useTableStore } from '../stores/tableStore'
import type { WSEvent } from '../types/backend'
import type { CartItemAPI } from '../types/backend'
import { cartSyncLogger } from '../utils/logger'

// Event entity types
interface CartItemAddedEntity extends CartItemAPI {}

interface CartItemUpdatedEntity extends CartItemAPI {}

interface CartItemRemovedEntity {
  item_id: number
  product_id: number
  diner_id: number
}

interface CartClearedEntity {
  cleared: boolean
}

interface CartSyncEntity {
  items: CartItemAPI[]
  version: number
}

// PERF-01: Debounce configuration
const FETCH_DEBOUNCE_MS = 1000 // 1 second debounce for reconnection fetches

// PERF-03: Event deduplication - track recently processed events
const MAX_RECENT_EVENTS = 100
const EVENT_DEDUP_TTL_MS = 5000 // 5 seconds TTL for dedup

// Local cart item type
interface LocalCartItem {
  id: string
  productId: string
  name: string
  price: number
  image: string
  quantity: number
  dinerId: string
  dinerName: string
  dinerColor?: string
  notes?: string
  backendItemId?: number
}

/**
 * PERF-02 IMPROVED: LRU Cache with O(1) operations
 * Uses Map's insertion order property for LRU tracking
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used) - O(1) operation
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest entry (first key in Map) - O(1) operation
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, value)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// PERF-02: LRU cache for apiToLocalCartItem conversions
const CACHE_TTL_MS = 30000 // 30 seconds cache TTL
const MAX_CACHE_SIZE = 200

interface CacheEntry {
  item: LocalCartItem
  timestamp: number
}

const conversionCache = new LRUCache<number, CacheEntry>(MAX_CACHE_SIZE)

/**
 * Convert backend CartItemAPI to local CartItem format
 * PERF-02: With memoization cache
 */
function apiToLocalCartItem(item: CartItemAPI): LocalCartItem {
  // Check cache first
  const cached = conversionCache.get(item.item_id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    // Verify data hasn't changed (quantity/notes can change)
    if (cached.item.quantity === item.quantity && cached.item.notes === (item.notes || undefined)) {
      return cached.item
    }
  }

  const localItem: LocalCartItem = {
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

  // Store in cache - LRU cache handles eviction automatically
  conversionCache.set(item.item_id, { item: localItem, timestamp: Date.now() })

  return localItem
}

/**
 * Hook that listens to WebSocket cart events and syncs cart state.
 *
 * Should be used in a component that's mounted while the user is at a table.
 * Works alongside the existing cart operations in tableStore.
 */
export function useCartSync() {
  const session = useTableStore((state) => state.session)
  const currentDiner = useTableStore((state) => state.currentDiner)
  const syncCartFromRemote = useTableStore((state) => state.syncCartFromRemote)
  const addRemoteCartItem = useTableStore((state) => state.addRemoteCartItem)
  const updateRemoteCartItem = useTableStore((state) => state.updateRemoteCartItem)
  const removeRemoteCartItem = useTableStore((state) => state.removeRemoteCartItem)
  const clearCartFromRemote = useTableStore((state) => state.clearCartFromRemote)

  // Refs to avoid listener resubscription
  const sessionRef = useRef(session)
  const currentDinerRef = useRef(currentDiner)
  const syncCartFromRemoteRef = useRef(syncCartFromRemote)
  const addRemoteCartItemRef = useRef(addRemoteCartItem)
  const updateRemoteCartItemRef = useRef(updateRemoteCartItem)
  const removeRemoteCartItemRef = useRef(removeRemoteCartItem)
  const clearCartFromRemoteRef = useRef(clearCartFromRemote)

  // PERF-01: Debounce state for fetch
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchRef = useRef<number>(0)

  // PERF-03: Event deduplication - track recently processed events
  const recentEventsRef = useRef<Map<string, number>>(new Map())

  // Ref for isDuplicateEvent to use in event handlers (empty deps useEffect)
  const isDuplicateEventRef = useRef<(eventType: string, itemId: number) => boolean>(() => false)

  // Keep refs updated
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    currentDinerRef.current = currentDiner
  }, [currentDiner])

  useEffect(() => {
    syncCartFromRemoteRef.current = syncCartFromRemote
  }, [syncCartFromRemote])

  useEffect(() => {
    addRemoteCartItemRef.current = addRemoteCartItem
  }, [addRemoteCartItem])

  useEffect(() => {
    updateRemoteCartItemRef.current = updateRemoteCartItem
  }, [updateRemoteCartItem])

  useEffect(() => {
    removeRemoteCartItemRef.current = removeRemoteCartItem
  }, [removeRemoteCartItem])

  useEffect(() => {
    clearCartFromRemoteRef.current = clearCartFromRemote
  }, [clearCartFromRemote])

  /**
   * PERF-03: Check if event was recently processed (deduplication)
   * Returns true if event should be skipped
   */
  const isDuplicateEvent = useCallback((eventType: string, itemId: number): boolean => {
    const key = `${eventType}:${itemId}`
    const now = Date.now()
    const lastProcessed = recentEventsRef.current.get(key)

    if (lastProcessed && now - lastProcessed < EVENT_DEDUP_TTL_MS) {
      cartSyncLogger.debug('Skipping duplicate event', { eventType, itemId })
      return true
    }

    // Record this event
    recentEventsRef.current.set(key, now)

    // Cleanup old entries to prevent memory leak
    if (recentEventsRef.current.size > MAX_RECENT_EVENTS) {
      const entries = Array.from(recentEventsRef.current.entries())
      const toRemove = entries
        .filter(([, timestamp]) => now - timestamp > EVENT_DEDUP_TTL_MS)
        .map(([k]) => k)

      for (const k of toRemove) {
        recentEventsRef.current.delete(k)
      }

      // If still over limit, remove oldest
      if (recentEventsRef.current.size > MAX_RECENT_EVENTS) {
        const sorted = entries.sort((a, b) => a[1] - b[1])
        for (let i = 0; i < 20 && i < sorted.length; i++) {
          recentEventsRef.current.delete(sorted[i][0])
        }
      }
    }

    return false
  }, [])

  // Keep isDuplicateEvent ref updated
  useEffect(() => {
    isDuplicateEventRef.current = isDuplicateEvent
  }, [isDuplicateEvent])

  // Fetch full cart on reconnection (internal, non-debounced)
  const fetchFullCartInternal = useCallback(async () => {
    try {
      const cart = await dinerAPI.getCart()
      const localItems = cart.items.map(apiToLocalCartItem)
      syncCartFromRemoteRef.current(localItems, cart.version)
      lastFetchRef.current = Date.now()
      cartSyncLogger.info('Full cart synced from backend', { itemCount: localItems.length, version: cart.version })
    } catch (error) {
      cartSyncLogger.error('Failed to fetch cart', { error })
    }
  }, [])

  /**
   * PERF-01: Debounced fetch - prevents multiple rapid fetches on reconnection
   */
  const fetchFullCart = useCallback(async () => {
    const now = Date.now()

    // If we fetched very recently, skip
    if (now - lastFetchRef.current < FETCH_DEBOUNCE_MS) {
      cartSyncLogger.debug('Skipping fetch - debounce active', {
        timeSinceLastFetch: now - lastFetchRef.current,
      })
      return
    }

    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
      fetchTimeoutRef.current = null
    }

    // Execute immediately if first time or enough time has passed
    await fetchFullCartInternal()
  }, [fetchFullCartInternal])

  // Effect to manage WebSocket connection
  useEffect(() => {
    if (!session?.backendSessionId) {
      return
    }

    // Ensure WebSocket is connected
    if (!dinerWS.isConnected()) {
      dinerWS.connect()
    }

    // Fetch full cart on initial connection/reconnection (debounced)
    fetchFullCart()

    // Cleanup on unmount
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
        fetchTimeoutRef.current = null
      }
    }
  }, [session?.backendSessionId, fetchFullCart])

  // Event handlers
  useEffect(() => {
    // Skip items from current diner (already handled locally)
    // Use backendDinerId (database ID) not local id (UUID)
    const isFromCurrentDiner = (dinerId: number) => {
      return currentDinerRef.current?.backendDinerId === dinerId
    }

    // Handler for CART_ITEM_ADDED
    const handleItemAdded = (event: WSEvent) => {
      const entity = event.entity as unknown as CartItemAddedEntity

      // Skip if from current diner (already in local state)
      if (isFromCurrentDiner(entity.diner_id)) {
        cartSyncLogger.debug('Skipping own CART_ITEM_ADDED event')
        return
      }

      // PERF-03: Skip duplicate events
      if (isDuplicateEventRef.current('CART_ITEM_ADDED', entity.item_id)) {
        return
      }

      cartSyncLogger.info('Remote diner added item', {
        dinerName: entity.diner_name,
        product: entity.product_name,
        qty: entity.quantity,
      })

      const localItem = apiToLocalCartItem(entity)
      addRemoteCartItemRef.current(localItem)
    }

    // Handler for CART_ITEM_UPDATED
    const handleItemUpdated = (event: WSEvent) => {
      const entity = event.entity as unknown as CartItemUpdatedEntity

      // Skip if from current diner
      if (isFromCurrentDiner(entity.diner_id)) {
        cartSyncLogger.debug('Skipping own CART_ITEM_UPDATED event')
        return
      }

      // PERF-03: Skip duplicate events
      if (isDuplicateEventRef.current('CART_ITEM_UPDATED', entity.item_id)) {
        return
      }

      cartSyncLogger.info('Remote diner updated item', {
        dinerName: entity.diner_name,
        product: entity.product_name,
        qty: entity.quantity,
      })

      const localItem = apiToLocalCartItem(entity)
      updateRemoteCartItemRef.current(localItem)
    }

    // Handler for CART_ITEM_REMOVED
    const handleItemRemoved = (event: WSEvent) => {
      const entity = event.entity as unknown as CartItemRemovedEntity

      // Skip if from current diner
      if (isFromCurrentDiner(entity.diner_id)) {
        cartSyncLogger.debug('Skipping own CART_ITEM_REMOVED event')
        return
      }

      // PERF-03: Skip duplicate events
      if (isDuplicateEventRef.current('CART_ITEM_REMOVED', entity.item_id)) {
        return
      }

      cartSyncLogger.info('Remote diner removed item', {
        itemId: entity.item_id,
        productId: entity.product_id,
      })

      removeRemoteCartItemRef.current(entity.item_id)
    }

    // Handler for CART_CLEARED (after round submit)
    const handleCartCleared = (event: WSEvent) => {
      const entity = event.entity as unknown as CartClearedEntity

      if (entity.cleared) {
        cartSyncLogger.info('Cart cleared (round submitted)')
        clearCartFromRemoteRef.current()
      }
    }

    // Handler for CART_SYNC (full state on reconnect)
    const handleCartSync = (event: WSEvent) => {
      const entity = event.entity as unknown as CartSyncEntity

      cartSyncLogger.info('Full cart sync received', {
        itemCount: entity.items.length,
        version: entity.version,
      })

      const localItems = entity.items.map(apiToLocalCartItem)
      syncCartFromRemoteRef.current(localItems, entity.version)
    }

    // Subscribe to cart events
    const unsubscribeAdded = dinerWS.on('CART_ITEM_ADDED', handleItemAdded)
    const unsubscribeUpdated = dinerWS.on('CART_ITEM_UPDATED', handleItemUpdated)
    const unsubscribeRemoved = dinerWS.on('CART_ITEM_REMOVED', handleItemRemoved)
    const unsubscribeCleared = dinerWS.on('CART_CLEARED', handleCartCleared)
    const unsubscribeSync = dinerWS.on('CART_SYNC', handleCartSync)

    // HMR cleanup guard
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubscribeAdded()
        unsubscribeUpdated()
        unsubscribeRemoved()
        unsubscribeCleared()
        unsubscribeSync()
      })
    }

    return () => {
      unsubscribeAdded()
      unsubscribeUpdated()
      unsubscribeRemoved()
      unsubscribeCleared()
      unsubscribeSync()
    }
  }, []) // Empty deps - subscribe once, use refs for latest values

  return {
    fetchFullCart,
  }
}

export default useCartSync
