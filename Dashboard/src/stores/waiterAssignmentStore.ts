/**
 * Store for managing waiter-sector assignments.
 * Handles daily assignment of waiters to sectors within a branch.
 */
import { create } from 'zustand'
import {
  assignmentAPI,
  type BranchAssignmentOverview,
  type SectorWithWaiters,
  type WaiterInfo,
  type BulkAssignmentResult,
} from '../services/api'

interface WaiterAssignmentState {
  // Current view state
  overview: BranchAssignmentOverview | null
  isLoading: boolean
  error: string | null

  // Selected date and shift for the view
  selectedDate: string
  selectedShift: string | null

  // Actions
  fetchAssignments: (branchId: number, date: string, shift?: string | null) => Promise<void>
  createBulkAssignments: (
    branchId: number,
    date: string,
    shift: string | null,
    assignments: Array<{ sector_id: number; waiter_ids: number[] }>
  ) => Promise<BulkAssignmentResult>
  deleteAssignment: (assignmentId: number) => Promise<void>
  clearAssignments: (branchId: number, date: string, shift?: string | null) => Promise<number>
  copyFromPreviousDay: (branchId: number, fromDate: string, toDate: string, shift?: string | null) => Promise<BulkAssignmentResult>

  // UI helpers
  setSelectedDate: (date: string) => void
  setSelectedShift: (shift: string | null) => void
  clearError: () => void

  // Computed helpers
  getSectorWaiters: (sectorId: number) => WaiterInfo[]
  getUnassignedWaiters: () => WaiterInfo[]
  isWaiterAssigned: (waiterId: number) => boolean
}

// Get today's date in YYYY-MM-DD format
const getTodayDate = () => new Date().toISOString().split('T')[0]

export const useWaiterAssignmentStore = create<WaiterAssignmentState>()((set, get) => ({
  overview: null,
  isLoading: false,
  error: null,
  selectedDate: getTodayDate(),
  selectedShift: null,

  fetchAssignments: async (branchId, date, shift) => {
    set({ isLoading: true, error: null })
    try {
      const overview = await assignmentAPI.getOverview(branchId, date, shift)
      set({ overview, isLoading: false, selectedDate: date, selectedShift: shift ?? null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar asignaciones'
      set({ error: message, isLoading: false })
    }
  },

  createBulkAssignments: async (branchId, date, shift, assignments) => {
    set({ isLoading: true, error: null })
    try {
      const result = await assignmentAPI.createBulk({
        branch_id: branchId,
        assignment_date: date,
        shift,
        assignments,
      })

      // Refresh the overview after creating assignments
      await get().fetchAssignments(branchId, date, shift)

      set({ isLoading: false })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear asignaciones'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  deleteAssignment: async (assignmentId) => {
    const { overview, selectedDate, selectedShift } = get()
    if (!overview) return

    set({ isLoading: true, error: null })
    try {
      await assignmentAPI.delete(assignmentId)
      // Refresh the overview
      await get().fetchAssignments(overview.branch_id, selectedDate, selectedShift)
      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar asignacion'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  clearAssignments: async (branchId, date, shift) => {
    set({ isLoading: true, error: null })
    try {
      const result = await assignmentAPI.deleteBulk(branchId, date, shift)
      // Refresh the overview
      await get().fetchAssignments(branchId, date, shift)
      set({ isLoading: false })
      return result.deleted_count
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al limpiar asignaciones'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  copyFromPreviousDay: async (branchId, fromDate, toDate, shift) => {
    set({ isLoading: true, error: null })
    try {
      const result = await assignmentAPI.copy(branchId, fromDate, toDate, shift)
      // Refresh the overview for the target date
      await get().fetchAssignments(branchId, toDate, shift)
      set({ isLoading: false })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al copiar asignaciones'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedShift: (shift) => set({ selectedShift: shift }),
  clearError: () => set({ error: null }),

  getSectorWaiters: (sectorId) => {
    const { overview } = get()
    if (!overview) return []
    const sector = overview.sectors.find((s) => s.sector_id === sectorId)
    return sector?.waiters ?? []
  },

  getUnassignedWaiters: () => {
    const { overview } = get()
    return overview?.unassigned_waiters ?? []
  },

  isWaiterAssigned: (waiterId) => {
    const { overview } = get()
    if (!overview) return false
    return overview.sectors.some((s) =>
      s.waiters.some((w) => w.id === waiterId)
    )
  },
}))

// Selectors - use stable empty array references to prevent infinite loops
const EMPTY_SECTORS: SectorWithWaiters[] = []
const EMPTY_WAITERS: WaiterInfo[] = []

export const selectOverview = (state: WaiterAssignmentState) => state.overview
export const selectSectors = (state: WaiterAssignmentState): SectorWithWaiters[] =>
  state.overview?.sectors ?? EMPTY_SECTORS
export const selectUnassignedWaiters = (state: WaiterAssignmentState): WaiterInfo[] =>
  state.overview?.unassigned_waiters ?? EMPTY_WAITERS
export const selectIsLoading = (state: WaiterAssignmentState) => state.isLoading
export const selectError = (state: WaiterAssignmentState) => state.error
export const selectSelectedDate = (state: WaiterAssignmentState) => state.selectedDate
export const selectSelectedShift = (state: WaiterAssignmentState) => state.selectedShift
