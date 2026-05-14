/**
 * M001 FIX: Store for tracking service call history
 * Maintains a list of service calls made during the session
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ServiceCallType = 'WAITER_CALL' | 'PAYMENT_HELP' | 'OTHER'
export type ServiceCallStatus = 'pending' | 'acked' | 'closed'

/** Record of a service call made by a diner */
export interface ServiceCallRecord {
  id: number
  type: ServiceCallType
  status: ServiceCallStatus
  createdAt: string
  ackedAt?: string
  closedAt?: string
}

interface ServiceCallState {
  calls: ServiceCallRecord[]
  /** Adds a new service call to the history */
  addCall: (id: number, type: ServiceCallType) => void
  /** Updates the status of an existing service call */
  updateCallStatus: (id: number, status: ServiceCallStatus) => void
  /** Clears all service calls (typically on session end) */
  clearCalls: () => void
}

// =============================================================================
// MED-03 FIX: Stable empty array for React 19 getSnapshot compatibility
// =============================================================================

const EMPTY_CALLS: ServiceCallRecord[] = []

// QA-MENU-HIGH-01 FIX: Memoization cache for filtered selectors
// Prevents React 19 infinite re-render loops caused by .filter() creating new arrays
interface PendingCallsCache {
  calls: ServiceCallRecord[] | null
  result: ServiceCallRecord[]
}
const pendingCallsCache: PendingCallsCache = { calls: null, result: EMPTY_CALLS }

export const useServiceCallStore = create<ServiceCallState>()(
  persist(
    (set) => ({
      calls: [],

      addCall: (id: number, type: ServiceCallType) => {
        set((state) => ({
          calls: [
            ...state.calls,
            {
              id,
              type,
              status: 'pending' as ServiceCallStatus,
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      },

      updateCallStatus: (id: number, status: ServiceCallStatus) => {
        set((state) => ({
          calls: state.calls.map((call) => {
            if (call.id === id) {
              return {
                ...call,
                status,
                ...(status === 'acked' ? { ackedAt: new Date().toISOString() } : {}),
                ...(status === 'closed' ? { closedAt: new Date().toISOString() } : {}),
              }
            }
            return call
          }),
        }))
      },

      clearCalls: () => {
        set({ calls: [] })
      },
    }),
    {
      name: 'pwamenu-service-calls',
      partialize: (state) => ({ calls: state.calls }),
    }
  )
)

// =============================================================================
// Selectors
// =============================================================================

/** Selects all service calls from the store */
export const selectServiceCalls = (state: ServiceCallState) =>
  state.calls.length > 0 ? state.calls : EMPTY_CALLS

/** Selects only pending or acknowledged calls (not yet closed)
 * QA-MENU-HIGH-01 FIX: Memoized to prevent React 19 infinite re-renders
 */
export const selectPendingCalls = (state: ServiceCallState): ServiceCallRecord[] => {
  // Return cached result if calls array hasn't changed
  if (state.calls === pendingCallsCache.calls) {
    return pendingCallsCache.result
  }
  // Compute new result
  const pending = state.calls.filter((c) => c.status === 'pending' || c.status === 'acked')
  // Update cache
  pendingCallsCache.calls = state.calls
  pendingCallsCache.result = pending.length > 0 ? pending : EMPTY_CALLS
  return pendingCallsCache.result
}
