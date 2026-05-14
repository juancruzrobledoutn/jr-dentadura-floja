/**
 * Tests for tableStore - Table management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTableStore } from './tableStore'

// Mock shared websocket-client before anything imports it
vi.mock('@shared/websocket-client', () => ({
  BaseWebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  })),
}))

vi.mock('../services/api', () => ({
  tableAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkCreate: vi.fn(),
  },
}))

vi.mock('../services/websocket', () => ({
  dashboardWS: {
    on: vi.fn(() => () => {}),
    off: vi.fn(),
  },
}))

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { tableAPI } from '../services/api'

describe('tableStore', () => {
  beforeEach(() => {
    useTableStore.setState({
      tables: [],
      isLoading: false,
      error: null,
      _isSubscribed: false,
    })
    vi.clearAllMocks()
  })

  it('should fetch tables and populate state', async () => {
    const apiTables = [
      { id: 1, branch_id: 1, code: 'Mesa 1', capacity: 4, sector: 'Interior', status: 'FREE', is_active: true, active_round_statuses: null, confirmed_by_name: null },
      { id: 2, branch_id: 1, code: 'Mesa 2', capacity: 6, sector: 'Terraza', status: 'ACTIVE', is_active: true, active_round_statuses: null, confirmed_by_name: null },
    ]
    vi.mocked(tableAPI.list).mockResolvedValueOnce(apiTables)

    await useTableStore.getState().fetchTables()
    const state = useTableStore.getState()

    expect(state.tables).toHaveLength(2)
    expect(state.tables[0].number).toBe(1)
    expect(state.tables[0].status).toBe('libre') // FREE -> libre
    expect(state.tables[1].status).toBe('ocupada') // ACTIVE -> ocupada
    expect(state.isLoading).toBe(false)
  })

  it('should add a table locally', () => {
    const newTable = useTableStore.getState().addTable({
      branch_id: '1',
      number: 5,
      capacity: 4,
      sector: 'Interior',
      status: 'libre',
      order_time: '00:00',
      close_time: '00:00',
      is_active: true,
    })

    const state = useTableStore.getState()
    expect(state.tables).toHaveLength(1)
    expect(newTable.number).toBe(5)
    expect(newTable.status).toBe('libre')
  })

  it('should get next table number for a branch', () => {
    useTableStore.setState({
      tables: [
        { id: 't1', branch_id: '1', number: 1, capacity: 4, sector: 'Interior', status: 'libre', order_time: '00:00', close_time: '00:00', is_active: true },
        { id: 't2', branch_id: '1', number: 3, capacity: 6, sector: 'Interior', status: 'libre', order_time: '00:00', close_time: '00:00', is_active: true },
        { id: 't3', branch_id: '2', number: 10, capacity: 2, sector: 'Interior', status: 'libre', order_time: '00:00', close_time: '00:00', is_active: true },
      ],
    })

    const nextNumber = useTableStore.getState().getNextTableNumber('1')
    expect(nextNumber).toBe(4) // Max in branch 1 is 3, so next is 4
  })

  it('should filter tables by branch', () => {
    useTableStore.setState({
      tables: [
        { id: 't1', branch_id: '1', number: 1, capacity: 4, sector: 'Interior', status: 'libre', order_time: '00:00', close_time: '00:00', is_active: true },
        { id: 't2', branch_id: '2', number: 1, capacity: 4, sector: 'Interior', status: 'ocupada', order_time: '00:00', close_time: '00:00', is_active: true },
      ],
    })

    const branch1Tables = useTableStore.getState().getByBranch('1')
    expect(branch1Tables).toHaveLength(1)
    expect(branch1Tables[0].branch_id).toBe('1')
  })
})
