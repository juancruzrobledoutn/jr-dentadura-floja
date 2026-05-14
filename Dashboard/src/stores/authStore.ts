import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authAPI, setAuthToken, setOnTokenExpired, setOnTokenRefreshed, type AuthUser, type LoginResponse } from '../services/api'
import { dashboardWS } from '../services/websocket'
import { STORAGE_KEYS } from '../utils/constants'
import { logger } from '../utils/logger'
import {
  isAdmin,
  isManager,
  isAdminOrManager,
  canDelete,
  canCreateBranch,
  canEditBranch,
} from '../utils/permissions'

// =============================================================================
// SEC-01: Security Constants
// =============================================================================

// Base refresh interval (14 min = 1 min before 15 min token expiry)
const BASE_REFRESH_INTERVAL_MS = 14 * 60 * 1000

// SEC-01: Jitter range to prevent timing attacks (±2 minutes)
const JITTER_RANGE_MS = 2 * 60 * 1000

// Max retry attempts before auto-logout
const MAX_REFRESH_ATTEMPTS = 3

// =============================================================================
// SEC-02: Refresh Interval with Jitter
// =============================================================================

let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null

/**
 * SEC-01: Calculate refresh interval with random jitter
 * Prevents predictable refresh timing that could be exploited
 */
function getRefreshIntervalWithJitter(): number {
  const jitter = (Math.random() - 0.5) * 2 * JITTER_RANGE_MS
  const interval = BASE_REFRESH_INTERVAL_MS + jitter
  return Math.max(interval, 60000) // Minimum 1 minute
}

/**
 * SEC-02: Start token refresh with jitter-based scheduling
 * Uses setTimeout instead of setInterval for variable timing
 */
function startTokenRefreshInterval(refreshFn: () => Promise<boolean>): void {
  stopTokenRefreshInterval()

  const scheduleNextRefresh = () => {
    const interval = getRefreshIntervalWithJitter()
    logger.debug('AuthStore', `Next token refresh in ${Math.round(interval / 1000)}s`)

    refreshTimeoutId = setTimeout(async () => {
      try {
        const success = await refreshFn()
        if (success) {
          // SEC-03: Notify other tabs about successful refresh
          authBroadcast.postMessage({ type: 'TOKEN_REFRESHED' })
        }
      } catch (err) {
        logger.error('AuthStore', 'Scheduled token refresh failed', err)
      }
      // Schedule next refresh regardless of success/failure
      scheduleNextRefresh()
    }, interval)
  }

  scheduleNextRefresh()
  logger.debug('AuthStore', 'Token refresh interval started with jitter')
}

function stopTokenRefreshInterval(): void {
  if (refreshTimeoutId) {
    clearTimeout(refreshTimeoutId)
    refreshTimeoutId = null
    logger.debug('AuthStore', 'Token refresh interval stopped')
  }
}

// =============================================================================
// SEC-03: BroadcastChannel for Tab Synchronization
// =============================================================================

type AuthBroadcastMessage =
  | { type: 'TOKEN_REFRESHED' }
  | { type: 'LOGOUT' }
  | { type: 'LOGIN'; token: string }

let authBroadcast: BroadcastChannel

// Initialize BroadcastChannel with error handling
function initAuthBroadcast(): BroadcastChannel {
  if (authBroadcast) return authBroadcast

  try {
    authBroadcast = new BroadcastChannel('dashboard-auth-sync')

    authBroadcast.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      const { type } = event.data

      switch (type) {
        case 'TOKEN_REFRESHED':
          // Another tab refreshed - skip our next scheduled refresh
          logger.debug('AuthStore', 'Token refreshed in another tab')
          break

        case 'LOGOUT':
          // Another tab logged out - sync logout here
          logger.debug('AuthStore', 'Logout detected in another tab')
          performLocalLogout()
          break

        case 'LOGIN':
          // Another tab logged in - reload to sync state
          logger.debug('AuthStore', 'Login detected in another tab')
          window.location.reload()
          break
      }
    }

    authBroadcast.onmessageerror = () => {
      logger.warn('AuthStore', 'BroadcastChannel message error')
    }
  } catch {
    // BroadcastChannel not supported - create mock
    logger.warn('AuthStore', 'BroadcastChannel not supported')
    authBroadcast = {
      postMessage: () => {},
      close: () => {},
      onmessage: null,
      onmessageerror: null,
    } as unknown as BroadcastChannel
  }

  return authBroadcast
}

// Initialize on module load
initAuthBroadcast()

/**
 * SEC-03: Close BroadcastChannel on cleanup
 */
export function closeAuthBroadcast(): void {
  if (authBroadcast) {
    try {
      authBroadcast.close()
    } catch {
      // Ignore errors on close
    }
  }
}

// =============================================================================
// SEC-04: Local Logout (without broadcasting)
// =============================================================================

/**
 * Performs logout locally without broadcasting to other tabs
 * Used when receiving logout broadcast from another tab
 */
function performLocalLogout(): void {
  stopTokenRefreshInterval()
  setOnTokenRefreshed(null)
  setOnTokenExpired(null)
  dashboardWS.disconnect()

  // SEC-05: Clear tokens from memory explicitly
  // SEC-09: refresh token lives in HttpOnly cookie, cleared by backend on /auth/logout
  setAuthToken(null)

  // Clear store state
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    error: null,
    refreshAttempts: 0,
    isRefreshing: false,
  })

  // SEC-05: Clear localStorage completely
  try {
    localStorage.removeItem(STORAGE_KEYS.AUTH || 'dashboard-auth')
  } catch {
    logger.warn('AuthStore', 'Failed to clear localStorage')
  }
}

// =============================================================================
// Store Interface
// =============================================================================

interface AuthState {
  user: AuthUser | null
  token: string | null
  // SEC-09: refresh token lives only in HttpOnly cookie, never in store state
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshAttempts: number
  isRefreshing: boolean
  // Actions
  login: (email: string, password: string, totpCode?: string) => Promise<boolean | 'requires_2fa'>
  logout: () => void
  checkAuth: () => Promise<boolean>
  clearError: () => void
  refreshAccessToken: () => Promise<boolean>
}

// =============================================================================
// Zustand Store
// =============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      refreshAttempts: 0,
      isRefreshing: false,

      login: async (email: string, password: string, totpCode?: string): Promise<boolean | 'requires_2fa'> => {
        set({ isLoading: true, error: null })
        try {
          const response = await authAPI.login(email, password, totpCode) as LoginResponse & { requires_2fa?: boolean }

          // Check if 2FA is required
          if (response.requires_2fa) {
            set({ isLoading: false })
            return 'requires_2fa'
          }

          // SEC-09: refresh token is set by the backend as an HttpOnly cookie
          // — never read from the response body. The store does not track it.

          set({
            user: response.user,
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            refreshAttempts: 0,
          })

          // Set up callback for WebSocket reconnection on token refresh
          setOnTokenRefreshed(() => {
            dashboardWS.updateToken()
          })

          // Set up callback for token expiration
          setOnTokenExpired(() => {
            get().logout()
          })

          // Start proactive token refresh interval with jitter
          startTokenRefreshInterval(() => get().refreshAccessToken())

          // SEC-03: Notify other tabs about login
          authBroadcast.postMessage({ type: 'LOGIN', token: response.access_token })

          return true
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error de autenticacion'
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: message,
          })
          return false
        }
      },

      logout: () => {
        // SEC-03: Notify other tabs before logout
        authBroadcast.postMessage({ type: 'LOGOUT' })

        // Stop refresh interval
        stopTokenRefreshInterval()
        setOnTokenRefreshed(null)
        setOnTokenExpired(null)

        // Disconnect WebSocket before clearing auth state
        dashboardWS.disconnect()

        // Call backend to invalidate token (fire and forget)
        authAPI.logout()

        // SEC-05: Clear tokens from memory explicitly
        // SEC-09: refresh token lives in HttpOnly cookie, cleared by backend on /auth/logout
        setAuthToken(null)

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          refreshAttempts: 0,
          isRefreshing: false,
        })

        // SEC-05: Clear localStorage completely
        try {
          localStorage.removeItem(STORAGE_KEYS.AUTH || 'dashboard-auth')
        } catch {
          logger.warn('AuthStore', 'Failed to clear localStorage')
        }
      },

      checkAuth: async (): Promise<boolean> => {
        const { token } = get()
        if (!token) {
          set({ isAuthenticated: false })
          return false
        }

        // Restore access token to API client.
        // SEC-09: refresh token lives in HttpOnly cookie — nothing to restore.
        setAuthToken(token)

        // Set callback for token expiration
        setOnTokenExpired(() => {
          get().logout()
        })

        try {
          const user = await authAPI.getMe()
          set({
            user,
            isAuthenticated: true,
          })

          // Set up callback for WebSocket reconnection on token refresh
          setOnTokenRefreshed(() => {
            dashboardWS.updateToken()
          })

          // Start proactive token refresh interval with jitter
          startTokenRefreshInterval(() => get().refreshAccessToken())

          return true
        } catch {
          // Token is invalid or expired (refresh already attempted by fetchAPI)
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          })
          return false
        }
      },

      clearError: () => set({ error: null }),

      // SEC-06: Proactive token refresh.
      // SEC-09: Refresh token lives only in the HttpOnly cookie. We never read
      // or compare it in JS — rotation is enforced and validated by the backend.
      refreshAccessToken: async (): Promise<boolean> => {
        const { refreshAttempts, isRefreshing } = get()

        // Prevent concurrent refresh attempts
        if (isRefreshing) {
          logger.debug('AuthStore', 'Token refresh already in progress, skipping')
          return false
        }

        // Check max retries before attempting
        if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
          logger.warn('AuthStore', 'Max refresh attempts reached, logging out')
          get().logout()
          return false
        }

        // SEC-09: Don't check for refreshToken in memory - it's in HttpOnly cookie
        // The server will reject the request if no valid cookie is present

        // Set isRefreshing flag and increment attempt counter
        set({ isRefreshing: true, refreshAttempts: refreshAttempts + 1 })

        try {
          const result = await authAPI.refresh()

          if (!result) {
            logger.warn('AuthStore', 'Token refresh returned empty result')
            set({ isRefreshing: false })
            return false
          }

          set({
            token: result.access_token,
            refreshAttempts: 0,  // Reset on success
            isRefreshing: false,
          })

          // Update API client with new access token
          setAuthToken(result.access_token)

          logger.debug('AuthStore', 'Token refreshed successfully')
          return true
        } catch (err) {
          logger.error('AuthStore', 'Token refresh failed', err)
          set({ isRefreshing: false })
          return false
        }
      },
    }),
    {
      name: STORAGE_KEYS.AUTH || 'dashboard-auth',
      version: 4, // SEC-09: Bump version - refreshToken now in HttpOnly cookie
      partialize: (state) => ({
        // Only persist access token and user, not loading/error states
        // SEC-09: refreshToken is now in HttpOnly cookie, not localStorage
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, restore access token to API client
        if (state?.token) {
          setAuthToken(state.token)
        }
        // SEC-09: refreshToken is in HttpOnly cookie, no need to restore
        // Set callback for token expiration
        setOnTokenExpired(() => {
          useAuthStore.getState().logout()
        })
      },
    }
  )
)

// =============================================================================
// Selectors
// =============================================================================

export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading = (state: AuthState) => state.isLoading
export const selectAuthError = (state: AuthState) => state.error

// C001 FIX: Use stable empty array references to avoid React 19 infinite re-renders
const EMPTY_ROLES: string[] = []
const EMPTY_BRANCH_IDS: number[] = []
export const selectUserRoles = (state: AuthState) => state.user?.roles ?? EMPTY_ROLES
export const selectUserBranchIds = (state: AuthState) => state.user?.branch_ids ?? EMPTY_BRANCH_IDS

// Permission-based selectors
export const selectIsAdmin = (state: AuthState) => isAdmin(state.user?.roles ?? EMPTY_ROLES)
export const selectIsManager = (state: AuthState) => isManager(state.user?.roles ?? EMPTY_ROLES)
export const selectIsAdminOrManager = (state: AuthState) => isAdminOrManager(state.user?.roles ?? EMPTY_ROLES)
export const selectCanDelete = (state: AuthState) => canDelete(state.user?.roles ?? EMPTY_ROLES)
export const selectCanCreateBranch = (state: AuthState) => canCreateBranch(state.user?.roles ?? EMPTY_ROLES)
export const selectCanEditBranch = (state: AuthState) => canEditBranch(state.user?.roles ?? EMPTY_ROLES)
