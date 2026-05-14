/**
 * Hook for real-time table updates via WebSocket
 * Listens to table-related events and updates the store
 *
 * DASH-HIGH-01 FIX: Uses local store updates instead of refetching all tables
 * WS-MED-01 FIX: Uses ref pattern to avoid re-subscription on store function changes
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { dashboardWS, type WSEvent } from '../services/websocket'
import { useTableStore } from '../stores/tableStore'
import { getAuthToken } from '../services/api'

export function useTableWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  // DASH-HIGH-01 FIX: Use handleWSEvent from store for local updates
  const handleStoreWSEvent = useTableStore((s) => s.handleWSEvent)

  // WS-MED-01 FIX: Use ref to avoid re-subscription when store function changes
  const handleStoreWSEventRef = useRef(handleStoreWSEvent)
  useEffect(() => {
    handleStoreWSEventRef.current = handleStoreWSEvent
  }, [handleStoreWSEvent])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return

    // Connect to admin WebSocket for full table events
    dashboardWS.connect('admin')

    // Subscribe to connection state
    const unsubscribeConnection = dashboardWS.onConnectionChange(setIsConnected)

    // WS-MED-01 FIX: Stable callback that delegates to ref
    const handleWSEvent = (event: WSEvent) => {
      const { type, table_id } = event

      // Only process table-related events with valid table_id
      if (!table_id) return

      // DASH-HIGH-01 FIX: Delegate to store's handleWSEvent for local updates
      switch (type) {
        case 'TABLE_STATUS_CHANGED':
        case 'TABLE_SESSION_STARTED':  // FIX: Handle new table sessions (diner scanned QR)
        case 'TABLE_CLEARED':
        case 'CHECK_REQUESTED':
        case 'CHECK_PAID':
        case 'ROUND_PENDING':    // Order status: diner created order (waiting for manager)
        case 'ROUND_SUBMITTED':
        case 'ROUND_IN_KITCHEN':  // Order status: sent to kitchen
        case 'ROUND_READY':       // Order status: kitchen finished
        case 'ROUND_SERVED':
        case 'ROUND_CANCELED':    // CROSS-SYS-01 FIX: Handle round cancellation
          handleStoreWSEventRef.current(event)
          break
      }
    }

    // Subscribe to table-related events - only subscribes ONCE
    const unsubscribeEvents = dashboardWS.on('*', handleWSEvent)

    // WS-31-MED-05 FIX: HMR cleanup guard for development
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubscribeConnection()
        unsubscribeEvents()
      })
    }

    return () => {
      unsubscribeConnection()
      unsubscribeEvents()
      // Don't disconnect here - let the component that needs WS manage the connection
    }
  }, []) // WS-MED-01 FIX: Empty deps - subscribe once

  // Manual reconnect function
  const reconnect = useCallback(() => {
    const token = getAuthToken()
    if (!token) return

    setIsReconnecting(true)
    // Force disconnect and reconnect
    dashboardWS.softDisconnect()
    setTimeout(() => {
      dashboardWS.connect('admin')
      setIsReconnecting(false)
    }, 100)
  }, [])

  return { isConnected, isReconnecting, reconnect }
}
