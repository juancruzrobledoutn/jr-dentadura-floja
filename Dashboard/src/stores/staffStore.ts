import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Staff, CreateStaffData, UpdateStaffData } from '../types/staff'
import { staffAPI, type Staff as APIStaff } from '../services/api'

// LOW-29-13 FIX: Stable reference for empty array to prevent infinite re-renders
const EMPTY_STAFF: Staff[] = []

// QA-DASH-CRIT-01 FIX: Memoization caches for filtered selectors
// These caches prevent React 19 infinite re-render loops caused by .filter() creating new arrays
interface StaffByBranchCache {
  staff: Staff[] | null
  branchId: string
  result: Staff[]
}
interface ActiveStaffByBranchCache {
  staff: Staff[] | null
  branchId: string
  result: Staff[]
}
const staffByBranchCache: StaffByBranchCache = { staff: null, branchId: '', result: EMPTY_STAFF }
const activeStaffByBranchCache: ActiveStaffByBranchCache = { staff: null, branchId: '', result: EMPTY_STAFF }

interface StaffState {
  staff: Staff[]
  isLoading: boolean
  error: string | null
  addStaff: (data: CreateStaffData) => Staff
  updateStaff: (id: string, data: UpdateStaffData) => void
  deleteStaff: (id: string) => void
  getStaffById: (id: string) => Staff | undefined
  getStaffByBranch: (branchId: string) => Staff[]
  deleteStaffByBranch: (branchId: string) => void
  // Async API actions
  fetchStaff: (branchId?: number) => Promise<void>
  createStaffAsync: (data: CreateStaffData) => Promise<Staff>
  updateStaffAsync: (id: string, data: UpdateStaffData) => Promise<void>
  deleteStaffAsync: (id: string) => Promise<void>
}

// Empty initial state - data comes from backend API

/**
 * C002 FIX: Properly map API staff preserving ALL branch roles
 * D004: phone, dni, hire_date now come from backend API
 */
function mapAPIStaffToFrontend(apiStaff: APIStaff): Staff {
  const primaryRole = apiStaff.branch_roles[0]

  // C002 FIX: Map all branch roles, not just the first one
  const branchRoles = apiStaff.branch_roles.map(br => ({
    branch_id: String(br.branch_id),
    role: br.role,
  }))

  return {
    id: String(apiStaff.id),
    // Primary branch for backward compatibility
    branch_id: primaryRole ? String(primaryRole.branch_id) : '',
    role_id: primaryRole ? primaryRole.role : '',
    // C002 FIX: Store ALL branch roles
    branch_roles: branchRoles,
    first_name: apiStaff.first_name ?? '',
    last_name: apiStaff.last_name ?? '',
    email: apiStaff.email,
    // D004: These fields now come from backend
    phone: apiStaff.phone ?? '',
    dni: apiStaff.dni ?? '',
    hire_date: apiStaff.hire_date ?? '',
    is_active: apiStaff.is_active,
    created_at: apiStaff.created_at,
    // API doesn't return updated_at, use created_at as fallback
    updated_at: apiStaff.created_at,
  }
}

export const useStaffStore = create<StaffState>()(
  persist(
    (set, get) => ({
      staff: [],
      isLoading: false,
      error: null,

      addStaff: (data) => {
        const now = new Date().toISOString()
        const newStaff: Staff = {
          ...data,
          id: crypto.randomUUID(),
          // C002 FIX: Initialize branch_roles from primary branch/role
          branch_roles: data.branch_roles ?? [{ branch_id: data.branch_id, role: data.role_id }],
          created_at: now,
          updated_at: now,
        }
        set((state) => ({
          staff: [...state.staff, newStaff],
        }))
        return newStaff
      },

      updateStaff: (id, data) => {
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === id
              ? { ...s, ...data, updated_at: new Date().toISOString() }
              : s
          ),
        }))
      },

      deleteStaff: (id) => {
        set((state) => ({
          staff: state.staff.filter((s) => s.id !== id),
        }))
      },

      getStaffById: (id) => {
        return get().staff.find((s) => s.id === id)
      },

      getStaffByBranch: (branchId) => {
        // C002 FIX: Check all branch_roles, not just primary branch_id
        return get().staff.filter((s) =>
          s.branch_id === branchId ||
          s.branch_roles?.some(br => br.branch_id === branchId)
        )
      },

      deleteStaffByBranch: (branchId) => {
        set((state) => ({
          staff: state.staff.filter((s) => s.branch_id !== branchId),
        }))
      },

      // Async API actions
      fetchStaff: async (branchId) => {
        set({ isLoading: true, error: null })
        try {
          const apiStaff = await staffAPI.list(branchId)
          // D004: phone/dni/hire_date now come from backend, no need to preserve existing
          const staff = apiStaff.map(api => mapAPIStaffToFrontend(api))

          set((state) => {
            if (branchId) {
              // C002 FIX: Filter by branch_roles, not just primary branch_id
              const otherBranches = state.staff.filter(
                (s) => !s.branch_roles?.some(br => br.branch_id === String(branchId)) &&
                       s.branch_id !== String(branchId)
              )
              return { staff: [...otherBranches, ...staff], isLoading: false }
            }
            return { staff, isLoading: false }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar personal'
          set({ error: message, isLoading: false })
        }
      },

      createStaffAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const branchId = parseInt(data.branch_id, 10)
          if (isNaN(branchId)) {
            // Local branch, create locally
            const newStaff = get().addStaff(data)
            set({ isLoading: false })
            return newStaff
          }

          const apiStaff = await staffAPI.create({
            email: data.email,
            password: 'tempPassword123', // Default password for new staff
            first_name: data.first_name,
            last_name: data.last_name,
            phone: data.phone,
            dni: data.dni,
            hire_date: data.hire_date,
            is_active: data.is_active,
            branch_roles: [{ branch_id: branchId, role: data.role_id }],
          })

          const newStaff = mapAPIStaffToFrontend(apiStaff)

          set((state) => ({
            staff: [...state.staff, newStaff],
            isLoading: false,
          }))
          return newStaff
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear personal'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateStaffAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local staff, update locally
            get().updateStaff(id, data)
            set({ isLoading: false })
            return
          }

          const updateData: {
            email?: string
            first_name?: string
            last_name?: string
            phone?: string
            dni?: string
            hire_date?: string
            is_active?: boolean
            branch_roles?: { branch_id: number; role: string }[]
          } = {}

          if (data.email !== undefined) updateData.email = data.email
          if (data.first_name !== undefined) updateData.first_name = data.first_name
          if (data.last_name !== undefined) updateData.last_name = data.last_name
          if (data.phone !== undefined) updateData.phone = data.phone
          if (data.dni !== undefined) updateData.dni = data.dni
          if (data.hire_date !== undefined) updateData.hire_date = data.hire_date
          if (data.is_active !== undefined) updateData.is_active = data.is_active
          if (data.branch_id !== undefined && data.role_id !== undefined) {
            const branchId = parseInt(data.branch_id, 10)
            if (!isNaN(branchId)) {
              updateData.branch_roles = [{ branch_id: branchId, role: data.role_id }]
            }
          }

          await staffAPI.update(numericId, updateData)

          set((state) => ({
            staff: state.staff.map((s) =>
              s.id === id
                ? { ...s, ...data, updated_at: new Date().toISOString() }
                : s
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar personal'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteStaffAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await staffAPI.delete(numericId)
          }

          set((state) => ({
            staff: state.staff.filter((s) => s.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar personal'
          set({ error: message, isLoading: false })
          throw err
        }
      },
    }),
    {
      name: 'staff-storage',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        // Type guard: Validate persisted state structure
        if (!persistedState || typeof persistedState !== 'object') {
          return { staff: [] }
        }

        const state = persistedState as { staff?: Staff[] }

        if (!Array.isArray(state.staff)) {
          return { staff: [] }
        }

        let staff = state.staff

        // Version 3: Clear mock data, data comes from backend
        if (version < 3) {
          // Filter out any mock staff with branch-* branch_id pattern
          staff = staff.filter(s =>
            !s.branch_id.startsWith('branch-')
          )
        }

        return { staff }
      },
      partialize: (state) => ({
        staff: state.staff,
      }),
    }
  )
)

// Selectors
// LOW-29-13 FIX: Use stable reference when staff array is empty
export const selectStaff = (state: StaffState) => state.staff.length > 0 ? state.staff : EMPTY_STAFF
export const selectStaffLoading = (state: StaffState) => state.isLoading
export const selectStaffError = (state: StaffState) => state.error

// QA-DASH-CRIT-01 FIX: Memoized selector to prevent React 19 infinite re-renders
// C002 FIX: Check all branch_roles in selectors
export const selectStaffByBranch = (branchId: string) => (state: StaffState): Staff[] => {
  // Return cached result if inputs haven't changed
  if (state.staff === staffByBranchCache.staff && branchId === staffByBranchCache.branchId) {
    return staffByBranchCache.result
  }
  // Compute new result
  const filtered = state.staff.filter((s) =>
    s.branch_id === branchId ||
    s.branch_roles?.some(br => br.branch_id === branchId)
  )
  // Update cache
  staffByBranchCache.staff = state.staff
  staffByBranchCache.branchId = branchId
  staffByBranchCache.result = filtered.length > 0 ? filtered : EMPTY_STAFF
  return staffByBranchCache.result
}

// QA-DASH-CRIT-01 FIX: Memoized selector to prevent React 19 infinite re-renders
export const selectActiveStaffByBranch = (branchId: string) => (state: StaffState): Staff[] => {
  // Return cached result if inputs haven't changed
  if (state.staff === activeStaffByBranchCache.staff && branchId === activeStaffByBranchCache.branchId) {
    return activeStaffByBranchCache.result
  }
  // Compute new result
  const filtered = state.staff.filter((s) =>
    s.is_active && (
      s.branch_id === branchId ||
      s.branch_roles?.some(br => br.branch_id === branchId)
    )
  )
  // Update cache
  activeStaffByBranchCache.staff = state.staff
  activeStaffByBranchCache.branchId = branchId
  activeStaffByBranchCache.result = filtered.length > 0 ? filtered : EMPTY_STAFF
  return activeStaffByBranchCache.result
}

export const selectStaffById = (id: string) => (state: StaffState) =>
  state.staff.find((s) => s.id === id)
