/**
 * Offline Queue Hook
 *
 * Provides functionality to queue orders when offline and sync them
 * when connection is restored. Uses IndexedDB for persistence.
 *
 * Features:
 * - Queue orders when offline
 * - Persist queue in IndexedDB (survives page refresh)
 * - Auto-sync when connection is restored
 * - Manual sync trigger
 * - Queue status tracking
 *
 * Usage:
 * ```tsx
 * const { queueOrder, pendingOrders, syncStatus, forceSyncNow } = useOfflineQueue()
 *
 * const handleOrder = async (order) => {
 *   if (navigator.onLine) {
 *     await submitOrder(order)
 *   } else {
 *     queueOrder(order)
 *     showToast('Pedido guardado. Se enviará cuando vuelva la conexión.')
 *   }
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { logger } from '../utils/logger'

// Types
interface QueuedOrder {
    id: string
    timestamp: number
    data: unknown
    retries: number
    lastError?: string
}

interface SyncStatus {
    isSyncing: boolean
    lastSyncAt: number | null
    lastError: string | null
    successCount: number
    failureCount: number
}

interface OfflineQueueState {
    /** Add an order to the offline queue */
    queueOrder: (orderData: unknown) => Promise<string>
    /** List of pending orders in queue */
    pendingOrders: QueuedOrder[]
    /** Current sync status */
    syncStatus: SyncStatus
    /** Force sync now (when online) */
    forceSyncNow: () => Promise<void>
    /** Clear a specific order from queue */
    removeFromQueue: (orderId: string) => Promise<void>
    /** Clear all orders from queue */
    clearQueue: () => Promise<void>
    /** Whether there are pending orders */
    hasPendingOrders: boolean
}

// IndexedDB configuration
const DB_NAME = 'sabor-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'orders'
const MAX_RETRIES = 3

// Open IndexedDB connection
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                store.createIndex('timestamp', 'timestamp', { unique: false })
            }
        }
    })
}

// Generate unique ID
function generateId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function useOfflineQueue(
    submitOrderFn?: (orderData: unknown) => Promise<boolean>
): OfflineQueueState {
    const [pendingOrders, setPendingOrders] = useState<QueuedOrder[]>([])
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({
        isSyncing: false,
        lastSyncAt: null,
        lastError: null,
        successCount: 0,
        failureCount: 0,
    })

    const dbRef = useRef<IDBDatabase | null>(null)
    const syncInProgressRef = useRef(false)

    // Initialize IndexedDB
    useEffect(() => {
        let mounted = true

        const initDB = async () => {
            try {
                dbRef.current = await openDB()
                if (mounted) {
                    await loadPendingOrders()
                }
            } catch (error) {
                logger.error('Failed to open IndexedDB', error)
            }
        }

        initDB()

        return () => {
            mounted = false
            dbRef.current?.close()
        }
    }, [])

    // Load pending orders from IndexedDB
    const loadPendingOrders = useCallback(async () => {
        const db = dbRef.current
        if (!db) return

        return new Promise<void>((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.getAll()

            request.onsuccess = () => {
                const orders = request.result as QueuedOrder[]
                // Sort by timestamp (oldest first)
                orders.sort((a, b) => a.timestamp - b.timestamp)
                setPendingOrders(orders)
                resolve()
            }

            request.onerror = () => {
                logger.error('Failed to load pending orders', request.error)
                resolve()
            }
        })
    }, [])

    // Add order to queue
    const queueOrder = useCallback(async (orderData: unknown): Promise<string> => {
        const db = dbRef.current
        if (!db) {
            throw new Error('Database not initialized')
        }

        const order: QueuedOrder = {
            id: generateId(),
            timestamp: Date.now(),
            data: orderData,
            retries: 0,
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.add(order)

            request.onsuccess = () => {
                setPendingOrders((prev) => [...prev, order])
                logger.info('Order queued for offline sync', { orderId: order.id })
                resolve(order.id)
            }

            request.onerror = () => {
                logger.error('Failed to queue order', request.error)
                reject(request.error)
            }
        })
    }, [])

    // Remove order from queue
    const removeFromQueue = useCallback(async (orderId: string): Promise<void> => {
        const db = dbRef.current
        if (!db) return

        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.delete(orderId)

            request.onsuccess = () => {
                setPendingOrders((prev) => prev.filter((o) => o.id !== orderId))
                resolve()
            }

            request.onerror = () => {
                logger.error('Failed to remove order from queue', request.error)
                resolve()
            }
        })
    }, [])

    // Update order in queue (for retry counting)
    const updateOrderInQueue = useCallback(async (order: QueuedOrder): Promise<void> => {
        const db = dbRef.current
        if (!db) return

        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.put(order)

            request.onsuccess = () => {
                setPendingOrders((prev) =>
                    prev.map((o) => (o.id === order.id ? order : o))
                )
                resolve()
            }

            request.onerror = () => {
                logger.error('Failed to update order in queue', request.error)
                resolve()
            }
        })
    }, [])

    // Clear all orders from queue
    const clearQueue = useCallback(async (): Promise<void> => {
        const db = dbRef.current
        if (!db) return

        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.clear()

            request.onsuccess = () => {
                setPendingOrders([])
                resolve()
            }

            request.onerror = () => {
                logger.error('Failed to clear queue', request.error)
                resolve()
            }
        })
    }, [])

    // Sync pending orders
    const syncOrders = useCallback(async () => {
        if (!submitOrderFn || syncInProgressRef.current || pendingOrders.length === 0) {
            return
        }

        if (!navigator.onLine) {
            return
        }

        syncInProgressRef.current = true
        setSyncStatus((prev) => ({ ...prev, isSyncing: true }))

        let successCount = 0
        let failureCount = 0
        let lastError: string | null = null

        // Process orders in sequence (oldest first)
        for (const order of pendingOrders) {
            try {
                const success = await submitOrderFn(order.data)

                if (success) {
                    await removeFromQueue(order.id)
                    successCount++
                    logger.info('Synced offline order', { orderId: order.id })
                } else {
                    throw new Error('Order submission returned false')
                }
            } catch (error) {
                failureCount++
                lastError = error instanceof Error ? error.message : 'Unknown error'

                // Update retry count
                const updatedOrder: QueuedOrder = {
                    ...order,
                    retries: order.retries + 1,
                    lastError,
                }

                if (updatedOrder.retries >= MAX_RETRIES) {
                    // Remove from queue after max retries
                    logger.error('Order failed after max retries, removing from queue', {
                        orderId: order.id,
                        lastError,
                    })
                    await removeFromQueue(order.id)
                } else {
                    await updateOrderInQueue(updatedOrder)
                }
            }
        }

        setSyncStatus({
            isSyncing: false,
            lastSyncAt: Date.now(),
            lastError,
            successCount,
            failureCount,
        })

        syncInProgressRef.current = false
    }, [pendingOrders, submitOrderFn, removeFromQueue, updateOrderInQueue])

    // Force sync now
    const forceSyncNow = useCallback(async () => {
        await syncOrders()
    }, [syncOrders])

    // Auto-sync when coming online
    useEffect(() => {
        const handleOnline = () => {
            logger.info('Connection restored, syncing offline orders...')
            syncOrders()
        }

        window.addEventListener('online', handleOnline)

        // Also try to sync on mount if online
        if (navigator.onLine && pendingOrders.length > 0) {
            syncOrders()
        }

        return () => {
            window.removeEventListener('online', handleOnline)
        }
    }, [syncOrders, pendingOrders.length])

    return {
        queueOrder,
        pendingOrders,
        syncStatus,
        forceSyncNow,
        removeFromQueue,
        clearQueue,
        hasPendingOrders: pendingOrders.length > 0,
    }
}
