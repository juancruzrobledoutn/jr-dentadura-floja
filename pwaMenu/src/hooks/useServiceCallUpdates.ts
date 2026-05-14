/**
 * A001 FIX: Hook to listen for service call WebSocket events
 * Provides feedback when waiter acknowledges or closes service calls
 * CRIT-03 FIX: Added proper timeout cleanup to prevent memory leaks
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { dinerWS } from '../services/websocket'
import { useTableStore } from '../stores/tableStore'
import type { WSEvent } from '../types/backend'
import { serviceCallLogger } from '../utils/logger'
import { playEventSoundIfEnabled } from '../utils/notificationSound'

export type ServiceCallStatus = 'idle' | 'pending' | 'acked' | 'closed'

interface ServiceCallState {
  status: ServiceCallStatus
  callId: number | null
  callType: string | null
  ackedAt: string | null
  closedAt: string | null
}

const initialState: ServiceCallState = {
  status: 'idle',
  callId: null,
  callType: null,
  ackedAt: null,
  closedAt: null,
}

/**
 * Hook that listens to service call WebSocket events
 * Returns current service call state and reset function
 * CRIT-03 FIX: Uses useRef for timeout to ensure proper cleanup
 */
export function useServiceCallUpdates() {
  const session = useTableStore((state) => state.session)
  const [serviceCall, setServiceCall] = useState<ServiceCallState>(initialState)
  // CRIT-03 FIX: Track timeout ID for cleanup
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // CRIT-03 FIX: Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current)
        resetTimeoutRef.current = null
      }
    }
  }, [])

  // Handler for SERVICE_CALL_ACKED event
  const handleAcked = useCallback((event: WSEvent) => {
    const entity = event.entity as { call_id?: number; call_type?: string }
    serviceCallLogger.info('Service call acknowledged', { callId: entity.call_id })

    setServiceCall({
      status: 'acked',
      callId: entity.call_id ?? null,
      callType: entity.call_type ?? null,
      ackedAt: new Date().toISOString(),
      closedAt: null,
    })

    // L002 FIX: Play notification sound when waiter acknowledges
    playEventSoundIfEnabled('waiter_coming')
  }, [])

  // Handler for SERVICE_CALL_CLOSED event
  const handleClosed = useCallback((event: WSEvent) => {
    const entity = event.entity as { call_id?: number; call_type?: string }
    serviceCallLogger.info('Service call closed', { callId: entity.call_id })

    setServiceCall((prev) => ({
      ...prev,
      status: 'closed',
      closedAt: new Date().toISOString(),
    }))

    // CRIT-03 FIX: Clear any existing timeout before setting new one
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current)
    }

    // Auto-reset after 3 seconds with proper cleanup tracking
    resetTimeoutRef.current = setTimeout(() => {
      setServiceCall(initialState)
      resetTimeoutRef.current = null
    }, 3000)
  }, [])

  // Mark as pending when a call is created
  const markPending = useCallback((callId: number, callType: string) => {
    setServiceCall({
      status: 'pending',
      callId,
      callType,
      ackedAt: null,
      closedAt: null,
    })
  }, [])

  // Reset to idle
  const reset = useCallback(() => {
    setServiceCall(initialState)
  }, [])

  useEffect(() => {
    // Only listen if we have a session
    if (!session?.backendSessionId) {
      return
    }

    // Ensure WebSocket is connected
    if (!dinerWS.isConnected()) {
      dinerWS.connect()
    }

    // Subscribe to service call events
    const unsubscribeAcked = dinerWS.on('SERVICE_CALL_ACKED', handleAcked)
    const unsubscribeClosed = dinerWS.on('SERVICE_CALL_CLOSED', handleClosed)

    return () => {
      unsubscribeAcked()
      unsubscribeClosed()
    }
  }, [session?.backendSessionId, handleAcked, handleClosed])

  return {
    serviceCall,
    markPending,
    reset,
    isWaiterComing: serviceCall.status === 'acked',
    isPending: serviceCall.status === 'pending',
  }
}

export default useServiceCallUpdates
