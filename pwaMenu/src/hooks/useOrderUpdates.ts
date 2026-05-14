/**
 * Hook to listen for WebSocket events and update order status in real-time
 * L002 FIX: Now plays notification sounds for important events
 * MENU-CRIT-01 FIX: Uses useRef to avoid listener accumulation on re-renders
 */

import { useEffect, useRef } from 'react'
import { dinerWS } from '../services/websocket'
import { useTableStore } from '../stores/tableStore'
import { useMenuStore } from '../stores/menuStore'
import type { WSEvent, WSEventType } from '../types/backend'
import type { OrderStatus, OrderRecord } from '../types'
import { orderUpdatesLogger } from '../utils/logger'
import { playEventSoundIfEnabled } from '../utils/notificationSound'

// Type for ROUND_ITEM_DELETED event entity
interface ItemDeletedEntity {
  round_id?: number
  item_id?: number
  product_id?: number
  round_deleted?: boolean
}

/**
 * Map WebSocket event type to order status
 */
function eventTypeToOrderStatus(eventType: WSEventType): OrderStatus | null {
  switch (eventType) {
    case 'ROUND_SUBMITTED':
      return 'submitted'
    case 'ROUND_IN_KITCHEN':
      return 'confirmed'
    case 'ROUND_READY':
      return 'ready'
    case 'ROUND_SERVED':
      return 'delivered'
    default:
      return null
  }
}

/**
 * Hook that listens to WebSocket events and updates order status
 * Should be used in a component that's mounted while the user is at a table
 *
 * MENU-CRIT-01 FIX: Uses refs to hold latest values, subscribes only once
 * to prevent listener accumulation when dependencies change.
 */
export function useOrderUpdates() {
  const session = useTableStore((state) => state.session)
  const updateOrderStatus = useTableStore((state) => state.updateOrderStatus)
  const removeOrderByRoundId = useTableStore((state) => state.removeOrderByRoundId)
  const removeOrderItemByProduct = useTableStore((state) => state.removeOrderItemByProduct)
  const orders = useTableStore((state) => state.orders)

  // MENU-CRIT-01 FIX: Use refs to hold latest values without causing re-subscription
  const ordersRef = useRef<OrderRecord[]>(orders)
  const updateOrderStatusRef = useRef<typeof updateOrderStatus>(updateOrderStatus)
  const removeOrderByRoundIdRef = useRef<typeof removeOrderByRoundId>(removeOrderByRoundId)
  const removeOrderItemByProductRef = useRef<typeof removeOrderItemByProduct>(removeOrderItemByProduct)

  // Keep refs updated with latest values
  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(() => {
    updateOrderStatusRef.current = updateOrderStatus
  }, [updateOrderStatus])

  useEffect(() => {
    removeOrderByRoundIdRef.current = removeOrderByRoundId
  }, [removeOrderByRoundId])

  useEffect(() => {
    removeOrderItemByProductRef.current = removeOrderItemByProduct
  }, [removeOrderItemByProduct])

  // Effect to manage WebSocket connection based on session
  useEffect(() => {
    if (!session?.backendSessionId) {
      return
    }

    // Ensure WebSocket is connected
    if (!dinerWS.isConnected()) {
      dinerWS.connect()
    }
  }, [session?.backendSessionId])

  // MENU-CRIT-01 FIX: Separate effect for subscriptions - runs only once
  useEffect(() => {
    // Handler for round status events - uses refs to access latest values
    const handleRoundEvent = (event: WSEvent) => {
      const newStatus = eventTypeToOrderStatus(event.type)
      if (!newStatus) return

      // Get round_id from the event entity (backend uses 'round_id' key)
      const entity = event.entity as { round_id?: number; id?: number }
      const roundId = entity.round_id ?? entity.id

      if (!roundId) {
        orderUpdatesLogger.warn('Event missing round_id:', event)
        return
      }

      orderUpdatesLogger.debug(`Received ${event.type} for round_id: ${roundId}`)

      // Find matching order by backendRoundId - use ref for latest orders
      const currentOrders = ordersRef.current
      const matchingOrder = currentOrders.find(
        (order) => order.backendRoundId === roundId
      )

      if (matchingOrder) {
        orderUpdatesLogger.info(`Updating order ${matchingOrder.id} from ${matchingOrder.status} to ${newStatus}`)
        // Use ref for latest updateOrderStatus function
        updateOrderStatusRef.current(matchingOrder.id, newStatus)

        // L002 FIX: Play notification sound based on status
        if (newStatus === 'ready') {
          playEventSoundIfEnabled('order_ready')
        } else if (newStatus === 'confirmed') {
          playEventSoundIfEnabled('order_confirmed')
        }
      } else {
        orderUpdatesLogger.debug(`No matching order for round_id: ${roundId}`, currentOrders.map(o => ({ id: o.id, backendRoundId: o.backendRoundId })))
      }
    }

    // Handler for table cleared event
    const handleTableCleared = (_event: WSEvent) => {
      orderUpdatesLogger.info('Table cleared event received')
      // Could trigger a UI notification or redirect
    }

    // Handler for check/payment events
    const handleCheckPaid = (_event: WSEvent) => {
      orderUpdatesLogger.info('Check paid event received')
      // Could update session status or show payment confirmation
    }

    // SYNC FIX: Handler for item deletion by waiter
    const handleItemDeleted = (event: WSEvent) => {
      const entity = event.entity as ItemDeletedEntity
      const roundId = entity.round_id
      const roundDeleted = entity.round_deleted === true
      const productId = entity.product_id

      if (!roundId) {
        orderUpdatesLogger.warn('ROUND_ITEM_DELETED missing round_id:', event)
        return
      }

      orderUpdatesLogger.info('Item deleted by waiter', { roundId, roundDeleted, productId })

      if (roundDeleted) {
        // Entire round was deleted (no items left)
        removeOrderByRoundIdRef.current(roundId)
      } else if (productId) {
        // Single item was deleted - remove by product_id
        removeOrderItemByProductRef.current(roundId, productId)
      }

      // Play notification sound to alert diner
      playEventSoundIfEnabled('order_confirmed')
    }

    // Handler for product availability changes (real-time "Agotado" badge)
    const handleProductAvailability = (event: WSEvent) => {
      const entity = event.entity as { product_id?: number; is_available?: boolean }
      if (entity.product_id != null && entity.is_available != null) {
        orderUpdatesLogger.info(`Product ${entity.product_id} availability changed: ${entity.is_available}`)
        useMenuStore.getState().updateProductAvailability(entity.product_id, entity.is_available)
      }
    }

    // WS-MED-02 FIX: Handler for unhandled events only (debugging)
    // Filter out already-handled event types to avoid double-processing
    const handledEventTypes = new Set([
      'ROUND_SUBMITTED', 'ROUND_IN_KITCHEN', 'ROUND_READY', 'ROUND_SERVED',
      'TABLE_CLEARED', 'CHECK_PAID', 'ROUND_ITEM_DELETED', 'PRODUCT_AVAILABILITY_CHANGED'
    ])
    const handleUnhandledEvents = (event: WSEvent) => {
      // WS-MED-02 FIX: Only log events not already handled by specific listeners
      if (!handledEventTypes.has(event.type)) {
        orderUpdatesLogger.debug('Unhandled WebSocket event:', event)
      }
    }

    // Subscribe to all events - only happens once due to empty deps
    const unsubscribeSubmitted = dinerWS.on('ROUND_SUBMITTED', handleRoundEvent)
    const unsubscribeInKitchen = dinerWS.on('ROUND_IN_KITCHEN', handleRoundEvent)
    const unsubscribeReady = dinerWS.on('ROUND_READY', handleRoundEvent)
    const unsubscribeServed = dinerWS.on('ROUND_SERVED', handleRoundEvent)
    const unsubscribeCleared = dinerWS.on('TABLE_CLEARED', handleTableCleared)
    const unsubscribeCheckPaid = dinerWS.on('CHECK_PAID', handleCheckPaid)
    const unsubscribeItemDeleted = dinerWS.on('ROUND_ITEM_DELETED', handleItemDeleted)
    const unsubscribeAvailability = dinerWS.on('PRODUCT_AVAILABILITY_CHANGED', handleProductAvailability)
    // WS-MED-02 FIX: Wildcard listener now filters to avoid double-processing
    const unsubscribeAll = dinerWS.on('*', handleUnhandledEvents)

    // WS-31-MED-05 FIX: HMR cleanup guard for development
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubscribeSubmitted()
        unsubscribeInKitchen()
        unsubscribeReady()
        unsubscribeServed()
        unsubscribeCleared()
        unsubscribeCheckPaid()
        unsubscribeItemDeleted()
        unsubscribeAvailability()
        unsubscribeAll()
      })
    }

    return () => {
      unsubscribeSubmitted()
      unsubscribeInKitchen()
      unsubscribeReady()
      unsubscribeServed()
      unsubscribeCleared()
      unsubscribeCheckPaid()
      unsubscribeItemDeleted()
      unsubscribeAvailability()
      unsubscribeAll()
    }
  }, []) // MENU-CRIT-01 FIX: Empty deps - subscribe only once, use refs for latest values
}

export default useOrderUpdates
