import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useHistoryStore,
  selectHistory,
  selectRecentActions,
  selectLast10Actions,
  selectLast5Actions,
  closeBroadcastChannel,
  enableHistoryStore,
} from './historyStore'
import type { HistoryEntryInput } from './historyStore'

// Mock dependencies
vi.mock('../utils/logger', () => ({
  storeLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 9),
})

describe('historyStore', () => {
  beforeEach(() => {
    // Re-enable store before each test (in case closeBroadcastChannel was called)
    enableHistoryStore()
    // Reset store to initial state
    useHistoryStore.setState({ entries: [] })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have correct initial state with empty entries', () => {
      const state = useHistoryStore.getState()
      expect(state.entries).toEqual([])
    })
  })

  describe('addHistoryEntry', () => {
    it('should add a history entry with generated id and timestamp', () => {
      const entry: HistoryEntryInput = {
        action: 'ROUND_MARKED_SERVED',
        table_id: 1,
        table_code: 'INT-01',
        details: 'Round #5 served',
      }

      useHistoryStore.getState().addHistoryEntry(entry)

      const state = useHistoryStore.getState()
      expect(state.entries).toHaveLength(1)
      expect(state.entries[0].action).toBe('ROUND_MARKED_SERVED')
      expect(state.entries[0].table_id).toBe(1)
      expect(state.entries[0].table_code).toBe('INT-01')
      expect(state.entries[0].details).toBe('Round #5 served')
      expect(state.entries[0].id).toBeDefined()
      expect(state.entries[0].timestamp).toBeDefined()
    })

    it('should add new entries at the beginning (FIFO order)', () => {
      const entry1: HistoryEntryInput = {
        action: 'ROUND_MARKED_SERVED',
        table_id: 1,
        table_code: 'INT-01',
      }
      const entry2: HistoryEntryInput = {
        action: 'SERVICE_CALL_ACCEPTED',
        table_id: 2,
        table_code: 'INT-02',
      }

      useHistoryStore.getState().addHistoryEntry(entry1)
      useHistoryStore.getState().addHistoryEntry(entry2)

      const state = useHistoryStore.getState()
      expect(state.entries).toHaveLength(2)
      // Most recent entry should be first
      expect(state.entries[0].action).toBe('SERVICE_CALL_ACCEPTED')
      expect(state.entries[1].action).toBe('ROUND_MARKED_SERVED')
    })

    it('should limit entries to MAX_HISTORY_ENTRIES (50)', () => {
      // Add 55 entries to exceed the limit
      for (let i = 0; i < 55; i++) {
        useHistoryStore.getState().addHistoryEntry({
          action: 'ROUND_MARKED_SERVED',
          table_id: i,
          table_code: `T-${i}`,
        })
      }

      const state = useHistoryStore.getState()
      expect(state.entries).toHaveLength(50)
      // The most recent entry should be T-54 (last added)
      expect(state.entries[0].table_code).toBe('T-54')
    })
  })

  describe('clearHistory', () => {
    it('should clear all history entries', () => {
      // Add some entries first
      useHistoryStore.getState().addHistoryEntry({
        action: 'ROUND_MARKED_SERVED',
        table_id: 1,
        table_code: 'INT-01',
      })
      useHistoryStore.getState().addHistoryEntry({
        action: 'SERVICE_CALL_COMPLETED',
        table_id: 2,
        table_code: 'INT-02',
      })

      expect(useHistoryStore.getState().entries).toHaveLength(2)

      useHistoryStore.getState().clearHistory()

      expect(useHistoryStore.getState().entries).toHaveLength(0)
    })
  })

  describe('closeBroadcastChannel', () => {
    it('should be callable without error when no channel exists', () => {
      expect(() => closeBroadcastChannel()).not.toThrow()
    })
  })

  describe('selectors', () => {
    it('selectHistory should return all entries', () => {
      useHistoryStore.getState().addHistoryEntry({
        action: 'ROUND_MARKED_READY',
        table_id: 1,
        table_code: 'INT-01',
      })
      useHistoryStore.getState().addHistoryEntry({
        action: 'SERVICE_CALL_ACCEPTED',
        table_id: 2,
        table_code: 'INT-02',
      })

      const entries = selectHistory(useHistoryStore.getState())
      expect(entries).toHaveLength(2)
    })

    it('selectRecentActions should return limited entries', () => {
      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        useHistoryStore.getState().addHistoryEntry({
          action: 'ROUND_MARKED_SERVED',
          table_id: i,
          table_code: `T-${i}`,
        })
      }

      const selector = selectRecentActions(3)
      const recent = selector(useHistoryStore.getState())
      expect(recent).toHaveLength(3)
      // Most recent first
      expect(recent[0].table_code).toBe('T-4')
    })

    it('selectLast5Actions should return at most 5 entries', () => {
      for (let i = 0; i < 8; i++) {
        useHistoryStore.getState().addHistoryEntry({
          action: 'ROUND_MARKED_IN_KITCHEN',
          table_id: i,
          table_code: `T-${i}`,
        })
      }

      const last5 = selectLast5Actions(useHistoryStore.getState())
      expect(last5).toHaveLength(5)
    })

    it('selectLast10Actions should return at most 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        useHistoryStore.getState().addHistoryEntry({
          action: 'ROUND_MARKED_SERVED',
          table_id: i,
          table_code: `T-${i}`,
        })
      }

      const last10 = selectLast10Actions(useHistoryStore.getState())
      expect(last10).toHaveLength(10)
    })
  })
})
