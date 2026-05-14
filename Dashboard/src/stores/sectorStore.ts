/**
 * Zustand store for managing branch sectors.
 * Sectors are used to organize tables within a branch (e.g., Interior, Terraza, VIP).
 */
import { create } from 'zustand'
import { sectorAPI, type SectorData, type SectorCreate } from '../services/api'

export interface Sector {
  id: string
  numericId: number
  tenantId: number
  branchId: number | null
  name: string
  prefix: string
  displayOrder: number
  isActive: boolean
  isGlobal: boolean
}

interface SectorState {
  sectors: Sector[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchSectors: (branchId?: number) => Promise<void>
  createSector: (data: SectorCreate) => Promise<Sector>
  deleteSector: (id: string) => Promise<void>

  // Selectors
  getSectorsForBranch: (branchId: number) => Sector[]
  getGlobalSectors: () => Sector[]
}

/**
 * Convert API response to frontend format
 */
function mapAPIToFrontend(apiSector: SectorData): Sector {
  return {
    id: String(apiSector.id),
    numericId: apiSector.id,
    tenantId: apiSector.tenant_id,
    branchId: apiSector.branch_id,
    name: apiSector.name,
    prefix: apiSector.prefix,
    displayOrder: apiSector.display_order,
    isActive: apiSector.is_active,
    isGlobal: apiSector.is_global,
  }
}

export const useSectorStore = create<SectorState>()((set, get) => ({
  sectors: [],
  isLoading: false,
  error: null,

  fetchSectors: async (branchId?: number) => {
    set({ isLoading: true, error: null })
    try {
      const data = await sectorAPI.list(branchId)
      const sectors = data.map(mapAPIToFrontend)
      set({ sectors, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error fetching sectors'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  createSector: async (data: SectorCreate) => {
    set({ isLoading: true, error: null })
    try {
      const apiSector = await sectorAPI.create(data)
      const sector = mapAPIToFrontend(apiSector)
      set((state) => ({
        sectors: [...state.sectors, sector],
        isLoading: false,
      }))
      return sector
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error creating sector'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  deleteSector: async (id: string) => {
    const numericId = parseInt(id, 10)
    if (isNaN(numericId)) {
      throw new Error('Invalid sector ID')
    }

    set({ isLoading: true, error: null })
    try {
      await sectorAPI.delete(numericId)
      set((state) => ({
        sectors: state.sectors.filter((s) => s.id !== id),
        isLoading: false,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error deleting sector'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  getSectorsForBranch: (branchId: number) => {
    return get().sectors.filter(
      (s) => s.isGlobal || s.branchId === branchId
    )
  },

  getGlobalSectors: () => {
    return get().sectors.filter((s) => s.isGlobal)
  },
}))

// CRIT-06 FIX: Stable empty array references to prevent infinite re-renders
const EMPTY_SECTORS: Sector[] = []

// CRIT-06 FIX: Memoization cache for filtered sector selectors
interface SectorsByBranchCache {
  sectors: Sector[] | null
  branchId: number
  result: Sector[]
}
const sectorsByBranchCache: SectorsByBranchCache = { sectors: null, branchId: 0, result: EMPTY_SECTORS }
const globalSectorsCache = { sectors: null as Sector[] | null, result: EMPTY_SECTORS }

// Selectors for use with useStore(selector) pattern
export const selectSectors = (state: SectorState) =>
  state.sectors.length === 0 ? EMPTY_SECTORS : state.sectors
export const selectIsLoading = (state: SectorState) => state.isLoading
export const selectError = (state: SectorState) => state.error

// CRIT-06 FIX: Memoized selector to prevent React 19 infinite re-renders
export const selectSectorsForBranch = (branchId: number) => (state: SectorState): Sector[] => {
  if (state.sectors === sectorsByBranchCache.sectors && branchId === sectorsByBranchCache.branchId) {
    return sectorsByBranchCache.result
  }
  const filtered = state.sectors.filter((s) => s.isGlobal || s.branchId === branchId)
  sectorsByBranchCache.sectors = state.sectors
  sectorsByBranchCache.branchId = branchId
  sectorsByBranchCache.result = filtered.length > 0 ? filtered : EMPTY_SECTORS
  return sectorsByBranchCache.result
}

// CRIT-06 FIX: Memoized selector for global sectors
export const selectGlobalSectors = (state: SectorState): Sector[] => {
  if (state.sectors === globalSectorsCache.sectors) {
    return globalSectorsCache.result
  }
  const filtered = state.sectors.filter((s) => s.isGlobal)
  globalSectorsCache.sectors = state.sectors
  globalSectorsCache.result = filtered.length > 0 ? filtered : EMPTY_SECTORS
  return globalSectorsCache.result
}
