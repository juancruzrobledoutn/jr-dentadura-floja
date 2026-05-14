import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// LOW-01 FIX: Removed unused selector imports (selectUser, selectIsAuthenticated, selectIsLoading, selectAuthError, selectSelectedBranchId)
import {
  useAuthStore,
  selectUserBranchIds,
} from './authStore'

// Mock all dependencies
vi.mock('../services/api', () => ({
  authAPI: {
    login: vi.fn(),
    // FIX B (Sprint 0): logout is now async (calls POST /auth/logout)
    logout: vi.fn().mockResolvedValue(undefined),
    getMe: vi.fn(),
    refresh: vi.fn(),
  },
  setAuthToken: vi.fn(),
  setTokenRefreshCallback: vi.fn(),
}))

vi.mock('../services/websocket', () => ({
  wsService: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    updateToken: vi.fn(),
  },
}))

vi.mock('../services/notifications', () => ({
  notificationService: {
    requestPermission: vi.fn(),
  },
}))

vi.mock('../utils/logger', () => ({
  authLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import mocked modules
// SEC-09: refresh token lives in HttpOnly cookie — the store does not track it.
import { authAPI, setAuthToken } from '../services/api'
import { wsService } from '../services/websocket'
import { notificationService } from '../services/notifications'

const mockUser = {
  id: 1,
  email: 'waiter@test.com',
  name: 'Test Waiter',
  roles: ['WAITER'],
  branch_ids: [1, 2],
}

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      token: null,
      selectedBranchId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      refreshAttempts: 0,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.selectedBranchId).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.refreshAttempts).toBe(0)
    })
  })

  describe('login', () => {
    it('should login successfully with WAITER role', async () => {
      // SEC-09: backend no longer returns refresh_token in the body — it sets
      // an HttpOnly cookie. The store does not track refresh tokens at all.
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser,
      })

      const result = await useAuthStore.getState().login('waiter@test.com', 'password')

      expect(result).toBe(true)
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual(mockUser)
      expect(state.token).toBe('test-token')
      expect(state.error).toBeNull()
      expect(state.refreshAttempts).toBe(0)
      expect(wsService.connect).toHaveBeenCalledWith('test-token')
      expect(notificationService.requestPermission).toHaveBeenCalled()
    })

    it('should login successfully with ADMIN role', async () => {
      const adminUser = { ...mockUser, roles: ['ADMIN'] }
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: adminUser,
      })

      const result = await useAuthStore.getState().login('admin@test.com', 'password')

      expect(result).toBe(true)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('should reject login without WAITER or ADMIN role', async () => {
      const kitchenUser = { ...mockUser, roles: ['KITCHEN'] }
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: kitchenUser,
      })

      const result = await useAuthStore.getState().login('kitchen@test.com', 'password')

      expect(result).toBe(false)
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('No tienes permisos de mozo')
    })

    it('should auto-select branch when user has only one branch', async () => {
      const singleBranchUser = { ...mockUser, branch_ids: [1] }
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: singleBranchUser,
      })

      await useAuthStore.getState().login('waiter@test.com', 'password')

      expect(useAuthStore.getState().selectedBranchId).toBe(1)
    })

    it('should not auto-select branch when user has multiple branches', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser, // has branch_ids: [1, 2]
      })

      await useAuthStore.getState().login('waiter@test.com', 'password')

      expect(useAuthStore.getState().selectedBranchId).toBeNull()
    })

    it('should handle login error', async () => {
      vi.mocked(authAPI.login).mockRejectedValue(new Error('Invalid credentials'))

      const result = await useAuthStore.getState().login('bad@test.com', 'wrong')

      expect(result).toBe(false)
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('Invalid credentials')
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
    })

    it('should set isLoading during login', async () => {
      let resolveLogin: (value: unknown) => void
      vi.mocked(authAPI.login).mockImplementation(
        () => new Promise((resolve) => { resolveLogin = resolve })
      )

      const loginPromise = useAuthStore.getState().login('waiter@test.com', 'password')

      expect(useAuthStore.getState().isLoading).toBe(true)

      resolveLogin!({
        access_token: 'test-token',
        user: mockUser,
      })

      await loginPromise
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear state on logout', async () => {
      // First login (SEC-09: no refresh_token in body anymore)
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser,
      })
      await useAuthStore.getState().login('waiter@test.com', 'password')

      // Then logout
      useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.selectedBranchId).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBeNull()
      // FIX B (Sprint 0): authAPI.logout() is fire-and-forget inside the store
      // (`void authAPI.logout()` — not awaited). Flush microtasks here so the mock
      // call is observable before we assert; otherwise this expect can race with
      // the `mockResolvedValue(undefined)` promise queueing.
      await Promise.resolve()
      expect(authAPI.logout).toHaveBeenCalled()
      expect(wsService.disconnect).toHaveBeenCalled()
    })
  })

  describe('checkAuth', () => {
    it('should return false when no token', async () => {
      const result = await useAuthStore.getState().checkAuth()

      expect(result).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should verify token and authenticate', async () => {
      // SEC-09: refresh token lives in an HttpOnly cookie — nothing to restore
      // from memory, so checkAuth only re-applies the access token.
      useAuthStore.setState({ token: 'existing-token' })
      vi.mocked(authAPI.getMe).mockResolvedValue(mockUser)

      const result = await useAuthStore.getState().checkAuth()

      expect(result).toBe(true)
      expect(setAuthToken).toHaveBeenCalledWith('existing-token')
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().user).toEqual(mockUser)
    })

    it('should reject user without WAITER role on checkAuth', async () => {
      useAuthStore.setState({ token: 'existing-token' })
      vi.mocked(authAPI.getMe).mockResolvedValue({ ...mockUser, roles: ['KITCHEN'] })

      const result = await useAuthStore.getState().checkAuth()

      expect(result).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should try refresh when auth check fails', async () => {
      // SEC-09: the store no longer needs a refresh token in memory — it always
      // attempts a refresh once on getMe() failure, relying on the HttpOnly cookie.
      useAuthStore.setState({ token: 'expired-token' })
      vi.mocked(authAPI.getMe)
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce(mockUser)
      vi.mocked(authAPI.refresh).mockResolvedValue({
        access_token: 'new-token',
      })

      const result = await useAuthStore.getState().checkAuth()

      expect(result).toBe(true)
      expect(authAPI.refresh).toHaveBeenCalled()
    })
  })

  describe('selectBranch', () => {
    it('should select branch when user has access', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser,
      })
      await useAuthStore.getState().login('waiter@test.com', 'password')

      useAuthStore.getState().selectBranch(1)

      expect(useAuthStore.getState().selectedBranchId).toBe(1)
    })

    it('should not select branch when user does not have access', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser, // has branch_ids: [1, 2]
      })
      await useAuthStore.getState().login('waiter@test.com', 'password')

      useAuthStore.getState().selectBranch(999)

      expect(useAuthStore.getState().selectedBranchId).toBeNull()
    })
  })

  describe('refreshAccessToken', () => {
    // SEC-09: There is no in-memory refresh token anymore. The refresh token
    // lives in an HttpOnly cookie that the browser sends automatically. The
    // store cannot tell from JS whether the cookie exists, so it always
    // attempts the API call and lets the server decide.
    it('should return false when refresh API returns no result', async () => {
      // Default mock returns undefined → falsy result branch → returns false.
      vi.mocked(authAPI.refresh).mockResolvedValue(undefined as never)

      const result = await useAuthStore.getState().refreshAccessToken()
      expect(result).toBe(false)
    })

    it('should refresh token successfully', async () => {
      // SEC-09: refresh response only contains access_token. The new refresh
      // token is rotated server-side and set as a new HttpOnly cookie.
      vi.mocked(authAPI.refresh).mockResolvedValue({
        access_token: 'new-access-token',
      })

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(true)
      expect(useAuthStore.getState().token).toBe('new-access-token')
      expect(useAuthStore.getState().refreshAttempts).toBe(0)
    })

    it('should increment attempt counter on failure', async () => {
      vi.mocked(authAPI.refresh).mockRejectedValue(new Error('Refresh failed'))

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(false)
      expect(useAuthStore.getState().refreshAttempts).toBe(1)
    })

    it('should logout after max refresh attempts', async () => {
      useAuthStore.setState({
        refreshAttempts: 3, // MAX_REFRESH_ATTEMPTS
        isAuthenticated: true,
        user: mockUser,
      })

      const result = await useAuthStore.getState().refreshAccessToken()

      expect(result).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      useAuthStore.setState({ error: 'Some error' })

      useAuthStore.getState().clearError()

      expect(useAuthStore.getState().error).toBeNull()
    })
  })

  describe('selectors', () => {
    it('should return empty branch ids array when no user', () => {
      const result = selectUserBranchIds(useAuthStore.getState())
      expect(result).toEqual([])
    })

    it('should return user branch ids when logged in', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        access_token: 'test-token',
        user: mockUser,
      })
      await useAuthStore.getState().login('waiter@test.com', 'password')

      const result = selectUserBranchIds(useAuthStore.getState())
      expect(result).toEqual([1, 2])
    })

    it('should return stable empty array reference for branch ids', () => {
      const state = useAuthStore.getState()
      const result1 = selectUserBranchIds(state)
      const result2 = selectUserBranchIds(state)
      expect(result1).toBe(result2) // Same reference
    })
  })
})
