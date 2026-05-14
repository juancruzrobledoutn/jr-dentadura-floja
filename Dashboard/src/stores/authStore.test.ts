/**
 * Tests for authStore - Authentication state management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

// Mock shared websocket-client before anything imports it
vi.mock('@shared/websocket-client', () => ({
  BaseWebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  })),
}))

// Mock all external dependencies
vi.mock('../services/api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    refresh: vi.fn(),
  },
  setAuthToken: vi.fn(),
  setOnTokenExpired: vi.fn(),
  setOnTokenRefreshed: vi.fn(),
}))

vi.mock('../services/websocket', () => ({
  dashboardWS: {
    disconnect: vi.fn(),
    updateToken: vi.fn(),
  },
}))

// Import mocked modules for assertions
import { authAPI } from '../services/api'

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      refreshAttempts: 0,
      isRefreshing: false,
    })
    vi.clearAllMocks()
  })

  it('should have correct initial state (not authenticated)', () => {
    const state = useAuthStore.getState()

    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should set user and token on successful login', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@demo.com',
      first_name: 'Admin',
      last_name: 'User',
      roles: ['ADMIN'],
      branch_ids: [1, 2],
      tenant_id: 1,
    }

    vi.mocked(authAPI.login).mockResolvedValueOnce({
      access_token: 'mock-jwt-token',
      user: mockUser,
    })

    const result = await useAuthStore.getState().login('admin@demo.com', 'admin123')
    const state = useAuthStore.getState()

    expect(result).toBe(true)
    expect(state.isAuthenticated).toBe(true)
    expect(state.user).toEqual(mockUser)
    expect(state.token).toBe('mock-jwt-token')
    expect(state.error).toBeNull()
  })

  it('should set error on failed login', async () => {
    vi.mocked(authAPI.login).mockRejectedValueOnce(new Error('Credenciales invalidas'))

    const result = await useAuthStore.getState().login('bad@email.com', 'wrong')
    const state = useAuthStore.getState()

    expect(result).toBe(false)
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.error).toBe('Credenciales invalidas')
  })

  it('should clear state on logout', () => {
    // Set authenticated state first
    useAuthStore.setState({
      user: { id: 1, email: 'admin@demo.com', first_name: 'A', last_name: 'U', roles: ['ADMIN'], branch_ids: [1], tenant_id: 1 },
      token: 'some-token',
      isAuthenticated: true,
    })

    useAuthStore.getState().logout()
    const state = useAuthStore.getState()

    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.refreshAttempts).toBe(0)
  })
})
