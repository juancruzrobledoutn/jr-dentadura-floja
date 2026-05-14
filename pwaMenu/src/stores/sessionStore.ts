/**
 * Session Store
 * Manages table session state with backend integration
 */

import { create } from 'zustand'
import { persist, createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { sessionAPI, setTableToken, getTableToken, setSessionExpiredCallback } from '../services/api'
import { dinerWS } from '../services/websocket'
import type { TableSessionResponse, RoundOutput, CheckDetailOutput } from '../types/backend'
import { logger } from '../utils/logger'

const sessionStoreLogger = logger.module('SessionStore')

// =============================================================================
// Types
// =============================================================================

interface Diner {
  name: string
  joinedAt: number
}

interface SessionState {
  // Session from backend
  sessionId: number | null
  tableId: number | null
  tableCode: string | null
  tableToken: string | null
  sessionStatus: 'OPEN' | 'PAYING' | null

  // Local diner info (NOT in backend)
  currentDiner: string | null
  diners: Diner[]

  // Rounds from backend (cached)
  rounds: RoundOutput[]

  // Check info (cached)
  check: CheckDetailOutput | null

  // Loading/error states
  isLoading: boolean
  error: string | null

  // Session expired state - for showing "scan QR again" modal
  isSessionExpired: boolean

  // Actions
  joinTable: (tableId: number, dinerName: string) => Promise<void>
  leaveTable: () => void
  markSessionExpired: () => void
  dismissSessionExpired: () => void
  setCurrentDiner: (name: string) => void
  addDiner: (name: string) => void
  removeDiner: (name: string) => void
  setRounds: (rounds: RoundOutput[]) => void
  addRound: (round: RoundOutput) => void
  updateRound: (roundId: number, updates: Partial<RoundOutput>) => void
  setCheck: (check: CheckDetailOutput | null) => void
  clearError: () => void
  restoreSession: () => Promise<boolean>
}

// =============================================================================
// Stable empty arrays for React 19 getSnapshot compatibility
// =============================================================================

const EMPTY_DINERS: Diner[] = []
const EMPTY_ROUNDS: RoundOutput[] = []

// =============================================================================
// Selectors
// =============================================================================

export const selectSessionId = (state: SessionState) => state.sessionId
export const selectTableId = (state: SessionState) => state.tableId
export const selectTableCode = (state: SessionState) => state.tableCode
export const selectTableToken = (state: SessionState) => state.tableToken
export const selectSessionStatus = (state: SessionState) => state.sessionStatus
export const selectCurrentDiner = (state: SessionState) => state.currentDiner
export const selectDiners = (state: SessionState) => state.diners.length > 0 ? state.diners : EMPTY_DINERS
export const selectRounds = (state: SessionState) => state.rounds.length > 0 ? state.rounds : EMPTY_ROUNDS
export const selectCheck = (state: SessionState) => state.check
export const selectIsLoading = (state: SessionState) => state.isLoading
export const selectError = (state: SessionState) => state.error
export const selectIsInSession = (state: SessionState) => state.sessionId !== null && state.currentDiner !== null
export const selectIsSessionExpired = (state: SessionState) => state.isSessionExpired

// =============================================================================
// Store
// =============================================================================

const STORAGE_KEY = 'session-storage'

// MED-02 FIX: Custom storage with error handling for persist failures
const safeStorage: PersistStorage<SessionState> = {
  getItem: (name: string): StorageValue<SessionState> | null => {
    try {
      const value = localStorage.getItem(name)
      return value ? JSON.parse(value) : null
    } catch (error) {
      sessionStoreLogger.error('Failed to read from localStorage:', error)
      return null
    }
  },
  setItem: (name: string, value: StorageValue<SessionState>): void => {
    try {
      localStorage.setItem(name, JSON.stringify(value))
    } catch (error) {
      sessionStoreLogger.error('Failed to write to localStorage:', error)
      // Handle quota exceeded or other storage errors gracefully
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        sessionStoreLogger.warn('localStorage quota exceeded, attempting to clear old data')
        try {
          // Try to clear old session data to make room
          localStorage.removeItem(name)
          localStorage.setItem(name, JSON.stringify(value))
        } catch {
          sessionStoreLogger.error('Failed to recover from storage error')
        }
      }
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name)
    } catch (error) {
      sessionStoreLogger.error('Failed to remove from localStorage:', error)
    }
  },
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessionId: null,
      tableId: null,
      tableCode: null,
      tableToken: null,
      sessionStatus: null,
      currentDiner: null,
      diners: [],
      rounds: [],
      check: null,
      isLoading: false,
      error: null,
      isSessionExpired: false,

      joinTable: async (tableId: number, dinerName: string) => {
        set({ isLoading: true, error: null })

        try {
          // Call backend to create or get session
          const response: TableSessionResponse = await sessionAPI.createOrGetSession(tableId)

          // Store token for future requests
          setTableToken(response.table_token)

          // Connect to WebSocket
          dinerWS.connect()

          const newDiner: Diner = {
            name: dinerName,
            joinedAt: Date.now(),
          }

          set({
            sessionId: response.session_id,
            tableId: response.table_id,
            tableCode: response.table_code,
            tableToken: response.table_token,
            sessionStatus: response.status,
            currentDiner: dinerName,
            diners: [newDiner],
            isLoading: false,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to join table'
          set({ isLoading: false, error: message })
          throw err
        }
      },

      leaveTable: () => {
        // Disconnect WebSocket
        dinerWS.disconnect()

        // Clear token
        setTableToken(null)

        // Reset state
        set({
          sessionId: null,
          tableId: null,
          tableCode: null,
          tableToken: null,
          sessionStatus: null,
          currentDiner: null,
          diners: [],
          rounds: [],
          check: null,
          error: null,
          isSessionExpired: false,
        })
      },

      markSessionExpired: () => {
        // Called by API when 401 is received
        set({ isSessionExpired: true })
      },

      dismissSessionExpired: () => {
        // Called when user dismisses the expired session modal
        // This will leave the table and redirect to scan QR
        get().leaveTable()
      },

      setCurrentDiner: (name: string) => {
        set({ currentDiner: name })
      },

      addDiner: (name: string) => {
        const { diners } = get()
        const exists = diners.some((d) => d.name.toLowerCase() === name.toLowerCase())
        if (!exists) {
          set({
            diners: [...diners, { name, joinedAt: Date.now() }],
          })
        }
      },

      removeDiner: (name: string) => {
        const { diners, currentDiner } = get()
        const newDiners = diners.filter((d) => d.name !== name)

        // If removing current diner, clear session
        if (currentDiner === name) {
          get().leaveTable()
          return
        }

        set({ diners: newDiners })
      },

      setRounds: (rounds: RoundOutput[]) => {
        set({ rounds })
      },

      addRound: (round: RoundOutput) => {
        const { rounds } = get()
        set({ rounds: [...rounds, round] })
      },

      updateRound: (roundId: number, updates: Partial<RoundOutput>) => {
        const { rounds } = get()
        set({
          rounds: rounds.map((r) =>
            r.id === roundId ? { ...r, ...updates } : r
          ),
        })
      },

      setCheck: (check: CheckDetailOutput | null) => {
        set({ check })
      },

      clearError: () => {
        set({ error: null })
      },

      restoreSession: async () => {
        // Check if we have a stored token
        const token = getTableToken()
        if (!token) {
          return false
        }

        const state = get()
        if (state.sessionId && state.currentDiner) {
          // Session exists, reconnect WebSocket
          dinerWS.connect()
          return true
        }

        return false
      },
    }),
    {
      name: STORAGE_KEY,
      // MED-02 FIX: Use safe storage with error handling
      storage: safeStorage,
      partialize: (state) => ({
        sessionId: state.sessionId,
        tableId: state.tableId,
        tableCode: state.tableCode,
        tableToken: state.tableToken,
        sessionStatus: state.sessionStatus,
        currentDiner: state.currentDiner,
        diners: state.diners,
      }),
      // MED-02 FIX: Handle rehydration errors
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          sessionStoreLogger.error('Failed to rehydrate session store:', error)
        } else if (state) {
          sessionStoreLogger.debug('Session store rehydrated successfully')
        }
      },
    }
  )
)

// Connect API session expiration callback to store
// This is called when API receives 401 Unauthorized
setSessionExpiredCallback(() => {
  useSessionStore.getState().markSessionExpired()
})
