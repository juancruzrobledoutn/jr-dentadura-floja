import { useState, useCallback, useRef, useEffect } from 'react'
import { useIsMounted } from './useIsMounted'
import { dinerAPI } from '../services/api'
import { apiLogger } from '../utils/logger'

export type CloseStatus =
  | 'idle'
  | 'requesting'
  | 'bill_ready'
  | 'processing_payment'
  | 'waiting_waiter'  // New: waiting for waiter to process cash/card payment
  | 'paid'

export type PaymentMethod = 'card' | 'cash' | 'mercadopago'

interface UseCloseTableFlowReturn {
  closeStatus: CloseStatus
  error: string | null
  isProcessing: boolean
  startCloseFlow: () => Promise<boolean>
  confirmPayment: (method: PaymentMethod) => Promise<void>
  setError: (error: string | null) => void
  setCloseStatus: (status: CloseStatus) => void
}

/**
 * Hook to manage the table closing flow.
 * Connects to backend: requesting → bill_ready → paid
 *
 * Payment flows:
 * - Mercado Pago: Redirect to MP checkout, webhook confirms payment
 * - Cash/Card: Create service call, waiter confirms payment, WebSocket updates status
 */
export function useCloseTableFlow(
  closeTable: () => Promise<{ success: boolean; error?: string; checkId?: number }>
): UseCloseTableFlowReturn {
  const [closeStatus, setCloseStatus] = useState<CloseStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const isMounted = useIsMounted()

  // MENU-HOOK-MED-02 FIX: AbortController for cleanup of pending operations
  const abortControllerRef = useRef<AbortController | null>(null)

  // MENU-HOOK-MED-02 FIX: Cleanup pending operations on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const startCloseFlow = useCallback(async (): Promise<boolean> => {
    // MENU-HOOK-MED-02 FIX: Cancel any previous pending operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setCloseStatus('requesting')
    setError(null)

    const result = await closeTable()

    if (!isMounted()) return false

    if (result.success) {
      // Go directly to bill_ready - backend has created the check
      setCloseStatus('bill_ready')
      return true
    } else {
      setError(result.error || 'Error closing table')
      setCloseStatus('idle')
      return false
    }
  }, [closeTable, isMounted])

  const confirmPayment = useCallback(async (method: PaymentMethod): Promise<void> => {
    // For Mercado Pago, the redirect is handled in the component
    if (method === 'mercadopago') {
      return
    }

    // MENU-HOOK-MED-02 FIX: Cancel any previous pending operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // For cash/card, create a service call to notify the waiter
    setCloseStatus('processing_payment')
    setError(null)

    try {
      apiLogger.info('Creating payment service call', { method })

      // Create service call to notify waiter that customer wants to pay
      await dinerAPI.createServiceCall({ type: 'PAYMENT_HELP' })

      // MENU-HOOK-MED-02 FIX: Check if operation was aborted
      if (signal.aborted) return

      apiLogger.info('Service call created, waiting for waiter')

      if (!isMounted()) return

      // Move to waiting state - waiter will process the payment
      // The CHECK_PAID WebSocket event will move us to 'paid' state
      setCloseStatus('waiting_waiter')
    } catch (err) {
      // MENU-HOOK-MED-02 FIX: Don't process if operation was aborted
      if (signal.aborted) return
      apiLogger.error('Failed to create payment service call', err)
      if (!isMounted()) return
      setError('Error al notificar al mozo. Intenta de nuevo.')
      setCloseStatus('bill_ready')
    }
  }, [isMounted])

  const isProcessing = closeStatus !== 'idle' && closeStatus !== 'paid'

  return {
    closeStatus,
    error,
    isProcessing,
    startCloseFlow,
    confirmPayment,
    setError,
    setCloseStatus,
  }
}
