import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Branch, BranchFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS, BRANCH_DEFAULT_OPENING_TIME, BRANCH_DEFAULT_CLOSING_TIME } from '../utils/constants'
import { branchAPI, type Branch as APIBranch } from '../services/api'
import { logWarning } from '../utils/logger'

interface BranchState {
  branches: Branch[]
  selectedBranchId: string | null
  isLoading: boolean
  error: string | null
  // Actions
  setBranches: (branches: Branch[]) => void
  addBranch: (data: BranchFormData & { restaurant_id: string }) => Branch
  updateBranch: (id: string, data: Partial<BranchFormData>) => void
  deleteBranch: (id: string) => void
  selectBranch: (id: string | null, authorizedBranchIds?: number[]) => boolean
  getByRestaurant: (restaurantId: string) => Branch[]
  // Async API actions
  fetchBranches: () => Promise<void>
  createBranchAsync: (data: BranchFormData & { restaurant_id: string }) => Promise<Branch>
  updateBranchAsync: (id: string, data: Partial<BranchFormData>) => Promise<void>
  deleteBranchAsync: (id: string) => Promise<void>
  // Reset action for logout
  reset: () => void
}

// Helper to convert API branch to frontend branch
function mapAPIBranchToFrontend(apiBranch: APIBranch): Branch {
  return {
    id: String(apiBranch.id),
    name: apiBranch.name,
    restaurant_id: String(apiBranch.tenant_id),
    address: apiBranch.address ?? undefined,
    phone: apiBranch.phone ?? undefined,
    opening_time: apiBranch.opening_time ?? BRANCH_DEFAULT_OPENING_TIME,
    closing_time: apiBranch.closing_time ?? BRANCH_DEFAULT_CLOSING_TIME,
    is_active: apiBranch.is_active,
    order: 0, // API doesn't have order, we'll calculate it
    created_at: apiBranch.created_at,
  }
}

// Empty initial state - data comes from backend API
const initialBranches: Branch[] = []

const generateId = () => crypto.randomUUID()

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branches: initialBranches,
      selectedBranchId: null,
      isLoading: false,
      error: null,

      setBranches: (branches) => set({ branches }),

      // Synchronous action for local-only mode (backward compatibility)
      addBranch: (data) => {
        const branches = get().branches
        const orders = branches.map((b) => b.order).filter((o) => typeof o === 'number' && !isNaN(o))
        const maxOrder = orders.length > 0 ? Math.max(...orders) : 0
        const newBranch: Branch = {
          id: generateId(),
          ...data,
          order: data.order ?? maxOrder + 1,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set({ branches: [...branches, newBranch] })
        return newBranch
      },

      // Synchronous action for local-only mode (backward compatibility)
      updateBranch: (id, data) =>
        set((state) => ({
          branches: state.branches.map((branch) =>
            branch.id === id
              ? { ...branch, ...data, updated_at: new Date().toISOString() }
              : branch
          ),
        })),

      // Synchronous action for local-only mode (backward compatibility)
      deleteBranch: (id) =>
        set((state) => ({
          branches: state.branches.filter((branch) => branch.id !== id),
          selectedBranchId: state.selectedBranchId === id ? null : state.selectedBranchId,
        })),

      // AUTH-FIX: Validate branch exists and user has access before selecting
      selectBranch: (id, authorizedBranchIds) => {
        // Allow clearing selection
        if (id === null) {
          set({ selectedBranchId: null })
          return true
        }

        const state = get()

        // Validate branch exists in loaded branches
        const branch = state.branches.find((b) => b.id === id)
        if (!branch) {
          logWarning(`selectBranch: branch ${id} not found`, 'branchStore')
          return false
        }

        // Validate user has access if authorizedBranchIds provided
        if (authorizedBranchIds !== undefined) {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId) && !authorizedBranchIds.includes(numericId)) {
            logWarning(`selectBranch: user not authorized for branch ${id}`, 'branchStore')
            return false
          }
        }

        set({ selectedBranchId: id })
        return true
      },

      getByRestaurant: (restaurantId) => {
        return get()
          .branches.filter((b) => b.restaurant_id === restaurantId)
          .sort((a, b) => a.order - b.order)
      },

      // Async API actions
      fetchBranches: async () => {
        set({ isLoading: true, error: null })
        try {
          const apiBranches = await branchAPI.list()
          const branches = apiBranches.map((b, index) => ({
            ...mapAPIBranchToFrontend(b),
            order: index + 1,
          }))
          set({ branches, isLoading: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar sucursales'
          set({ error: message, isLoading: false })
          // Keep existing branches as fallback
        }
      },

      createBranchAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          // Generate slug from name
          const slug = data.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')

          const apiBranch = await branchAPI.create({
            name: data.name,
            slug,
            address: data.address,
            phone: data.phone,
            opening_time: data.opening_time,
            closing_time: data.closing_time,
            is_active: data.is_active,
          })

          const branches = get().branches
          const maxOrder = branches.length > 0 ? Math.max(...branches.map((b) => b.order)) : 0
          const newBranch: Branch = {
            ...mapAPIBranchToFrontend(apiBranch),
            order: maxOrder + 1,
            email: data.email,
            image: data.image,
          }

          set({ branches: [...branches, newBranch], isLoading: false })
          return newBranch
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear sucursal'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateBranchAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local-only branch, update locally
            get().updateBranch(id, data)
            set({ isLoading: false })
            return
          }

          await branchAPI.update(numericId, {
            name: data.name,
            address: data.address,
            phone: data.phone,
            opening_time: data.opening_time,
            closing_time: data.closing_time,
            is_active: data.is_active,
          })

          set((state) => ({
            branches: state.branches.map((branch) =>
              branch.id === id
                ? { ...branch, ...data, updated_at: new Date().toISOString() }
                : branch
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar sucursal'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteBranchAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await branchAPI.delete(numericId)
          }

          set((state) => ({
            branches: state.branches.filter((branch) => branch.id !== id),
            selectedBranchId: state.selectedBranchId === id ? null : state.selectedBranchId,
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar sucursal'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      // Reset store to initial state (used on logout)
      reset: () => {
        set({
          branches: [],
          selectedBranchId: null,
          isLoading: false,
          error: null,
        })
      },
    }),
    {
      name: STORAGE_KEYS.BRANCHES,
      version: STORE_VERSIONS.BRANCHES,
      partialize: (state) => ({
        // Only persist branches and selection, not loading/error state
        branches: state.branches,
        selectedBranchId: state.selectedBranchId,
      }),
      migrate: (persistedState, version) => {
        const persisted = persistedState as { branches: Branch[]; selectedBranchId: string | null }

        if (!Array.isArray(persisted.branches)) {
          return {
            branches: [],
            selectedBranchId: null,
          }
        }

        let branches = persisted.branches
        let selectedBranchId = persisted.selectedBranchId

        if (version < 3) {
          selectedBranchId = null
        }

        if (version < 4) {
          branches = branches.map((branch) => ({
            ...branch,
            opening_time: branch.opening_time ?? BRANCH_DEFAULT_OPENING_TIME,
            closing_time: branch.closing_time ?? BRANCH_DEFAULT_CLOSING_TIME,
          }))
        }

        // Version 5: Clear mock data, data comes from backend
        if (version < 5) {
          branches = branches.filter(b => !b.id.startsWith('branch-'))
        }

        return { branches, selectedBranchId }
      },
    }
  )
)

// HIGH-05 FIX: Stable empty array for React 19 getSnapshot compatibility
const EMPTY_BRANCHES: Branch[] = []

// Selectors
export const selectBranches = (state: BranchState) => state.branches.length > 0 ? state.branches : EMPTY_BRANCHES
export const selectSelectedBranchId = (state: BranchState) => state.selectedBranchId
// HIGH-05 FIX: Cache selector factory results to avoid creating new functions on each call
const branchByIdCache = new Map<string | null, (state: BranchState) => Branch | undefined>()
export const selectBranchById = (id: string | null) => {
  if (!branchByIdCache.has(id)) {
    branchByIdCache.set(id, (state: BranchState) =>
      id ? state.branches.find((b) => b.id === id) : undefined
    )
  }
  return branchByIdCache.get(id)!
}
export const selectBranchLoading = (state: BranchState) => state.isLoading
export const selectBranchError = (state: BranchState) => state.error
