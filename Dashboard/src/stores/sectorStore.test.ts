/**
 * Tests for sectorStore - Branch sector management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSectorStore } from './sectorStore'

vi.mock('../services/api', () => ({
  sectorAPI: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

import { sectorAPI } from '../services/api'

describe('sectorStore', () => {
  beforeEach(() => {
    useSectorStore.setState({
      sectors: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch sectors and populate state', async () => {
    const apiSectors = [
      { id: 1, tenant_id: 1, branch_id: 1, name: 'Interior', prefix: 'INT', display_order: 1, is_active: true, is_global: false },
      { id: 2, tenant_id: 1, branch_id: null, name: 'Terraza', prefix: 'TER', display_order: 2, is_active: true, is_global: true },
    ]
    vi.mocked(sectorAPI.list).mockResolvedValueOnce(apiSectors)

    await useSectorStore.getState().fetchSectors()
    const state = useSectorStore.getState()

    expect(state.sectors).toHaveLength(2)
    expect(state.sectors[0].name).toBe('Interior')
    expect(state.sectors[0].id).toBe('1')
    expect(state.sectors[1].isGlobal).toBe(true)
    expect(state.isLoading).toBe(false)
  })

  it('should create a sector and add to state', async () => {
    const apiSector = { id: 3, tenant_id: 1, branch_id: 1, name: 'VIP', prefix: 'VIP', display_order: 3, is_active: true, is_global: false }
    vi.mocked(sectorAPI.create).mockResolvedValueOnce(apiSector)

    const sector = await useSectorStore.getState().createSector({
      branch_id: 1,
      name: 'VIP',
      prefix: 'VIP',
      display_order: 3,
    })

    const state = useSectorStore.getState()
    expect(state.sectors).toHaveLength(1)
    expect(sector.name).toBe('VIP')
    expect(sector.id).toBe('3')
    expect(state.isLoading).toBe(false)
  })

  it('should delete a sector from the list', async () => {
    useSectorStore.setState({
      sectors: [
        { id: '1', numericId: 1, tenantId: 1, branchId: 1, name: 'Interior', prefix: 'INT', displayOrder: 1, isActive: true, isGlobal: false },
        { id: '2', numericId: 2, tenantId: 1, branchId: 1, name: 'Terraza', prefix: 'TER', displayOrder: 2, isActive: true, isGlobal: false },
      ],
    })
    vi.mocked(sectorAPI.delete).mockResolvedValueOnce(undefined)

    await useSectorStore.getState().deleteSector('1')
    const state = useSectorStore.getState()

    expect(state.sectors).toHaveLength(1)
    expect(state.sectors[0].id).toBe('2')
  })
})
