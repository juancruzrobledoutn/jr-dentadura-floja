/**
 * AUDIT FIX: Hook for global WebSocket connection management
 * Connects WebSocket when user is authenticated
 * Handles reconnection on visibility change (tab focus)
 * WS-CRIT-02 FIX: Use state + Promise to prevent simultaneous connections
 */

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore, selectIsAuthenticated, selectUserRoles } from '../stores/authStore'
import { useBranchStore, selectSelectedBranchId } from '../stores/branchStore'
import { dashboardWS } from '../services/websocket'

/**
 * Determines the appropriate WebSocket endpoint based on user roles
 * @param roles - User's roles array
 * @returns 'admin' for ADMIN/MANAGER, 'kitchen' for KITCHEN only
 */
function getEndpointFromRoles(roles: string[]): 'admin' | 'kitchen' {
  if (roles.includes('ADMIN') || roles.includes('MANAGER')) {
    return 'admin'
  }
  return 'kitchen'
}

/**
 * Hook to manage global WebSocket connection
 * - Connects when authenticated
 * - Disconnects on logout (handled by authStore)
 * - Reconnects on visibility change (tab becomes visible)
 * - WS-CRIT-02 FIX: Awaits connection Promise to prevent simultaneous attempts
 * - CRIT-04 FIX: Use ref instead of state for isConnecting to prevent infinite loop
 */
export function useWebSocketConnection() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const roles = useAuthStore(selectUserRoles)
  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  // CRIT-04 FIX: Use ref instead of state to avoid infinite loop from callback deps
  const isConnectingRef = useRef(false)
  const mountedRef = useRef(true)

  // CRIT-04 FIX: No dependencies on isConnecting - use ref check inside
  const safeConnect = useCallback(async (endpoint: 'admin' | 'kitchen') => {
    if (dashboardWS.isConnected() || isConnectingRef.current) {
      return
    }

    isConnectingRef.current = true
    try {
      await dashboardWS.connect(endpoint)
    } catch {
      // Connection failed, will retry on next trigger
    } finally {
      if (mountedRef.current) {
        isConnectingRef.current = false
      }
    }
  }, []) // CRIT-04 FIX: Empty deps - no re-creation on state changes

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // CATCHUP: Set branch ID on the WebSocket service for event catch-up
  useEffect(() => {
    if (selectedBranchId) {
      const numericId = parseInt(selectedBranchId, 10)
      if (!isNaN(numericId)) {
        dashboardWS.setBranchId(numericId)
      }
    }
  }, [selectedBranchId])

  useEffect(() => {
    if (!isAuthenticated || roles.length === 0) {
      return
    }

    const endpoint = getEndpointFromRoles(roles)

    // Connect immediately if not already connected
    if (!dashboardWS.isConnected() && !isConnectingRef.current) {
      safeConnect(endpoint)
    }

    // Handle visibility change - reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !dashboardWS.isConnected() && !isConnectingRef.current) {
        safeConnect(endpoint)
      }
    }

    // Handle online event - reconnect when network comes back
    const handleOnline = () => {
      if (!dashboardWS.isConnected() && !isConnectingRef.current) {
        safeConnect(endpoint)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    // WS-31-MED-05 FIX: HMR cleanup guard for development
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('online', handleOnline)
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      // NOTE: Don't disconnect here - singleton shared across app
      // Disconnect happens in authStore.logout()
    }
  }, [isAuthenticated, roles, safeConnect]) // CRIT-04 FIX: Removed isConnecting from deps
}
