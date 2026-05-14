/**
 * Tests for branchStore - Branch management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBranchStore, selectBranches, selectSelectedBranchId, selectBranchById } from './branchStore'

vi.mock('../services/api', () => ({
  branchAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { branchAPI } from '../services/api'

describe('branchStore', () => {
  beforeEach(() => {
    useBranchStore.setState({
      branches: [],
      selectedBranchId: null,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch branches and populate state', async () => {
    const apiBranches = [
      { id: 1, name: 'Central', tenant_id: 1, address: 'Av. 9 de Julio', phone: null, slug: 'central', opening_time: '08:00', closing_time: '23:00', is_active: true, created_at: '2024-01-01' },
      { id: 2, name: 'Norte', tenant_id: 1, address: null, phone: null, slug: 'norte', opening_time: '09:00', closing_time: '22:00', is_active: true, created_at: '2024-01-01' },
    ]
    vi.mocked(branchAPI.list).mockResolvedValueOnce(apiBranches)

    await useBranchStore.getState().fetchBranches()
    const state = useBranchStore.getState()

    expect(state.branches).toHaveLength(2)
    expect(state.branches[0].name).toBe('Central')
    expect(state.branches[0].id).toBe('1') // Converted to string
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should select a branch and return true', () => {
    useBranchStore.setState({
      branches: [
        { id: '1', name: 'Central', restaurant_id: '1', opening_time: '08:00', closing_time: '23:00', order: 1 },
      ],
    })

    const result = useBranchStore.getState().selectBranch('1')
    expect(result).toBe(true)
    expect(selectSelectedBranchId(useBranchStore.getState())).toBe('1')
  })

  it('should return false when selecting non-existent branch', () => {
    useBranchStore.setState({
      branches: [
        { id: '1', name: 'Central', restaurant_id: '1', opening_time: '08:00', closing_time: '23:00', order: 1 },
      ],
    })

    const result = useBranchStore.getState().selectBranch('999')
    expect(result).toBe(false)
    expect(selectSelectedBranchId(useBranchStore.getState())).toBeNull()
  })

  it('should use selectBranches selector with stable empty array', () => {
    const emptyResult1 = selectBranches(useBranchStore.getState())
    const emptyResult2 = selectBranches(useBranchStore.getState())
    // Stable reference for empty arrays (React 19 compatibility)
    expect(emptyResult1).toBe(emptyResult2)
  })

  it('should use selectBranchById selector', () => {
    useBranchStore.setState({
      branches: [
        { id: '1', name: 'Central', restaurant_id: '1', opening_time: '08:00', closing_time: '23:00', order: 1 },
        { id: '2', name: 'Norte', restaurant_id: '1', opening_time: '09:00', closing_time: '22:00', order: 2 },
      ],
    })

    const selector = selectBranchById('1')
    const branch = selector(useBranchStore.getState())
    expect(branch?.name).toBe('Central')

    const nullSelector = selectBranchById(null)
    expect(nullSelector(useBranchStore.getState())).toBeUndefined()
  })
})
