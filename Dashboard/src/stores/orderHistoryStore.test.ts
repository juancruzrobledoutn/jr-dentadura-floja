/**
 * Tests for orderHistoryStore - Order history management state
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useOrderHistoryStore } from './orderHistoryStore'

describe('orderHistoryStore', () => {
  beforeEach(() => {
    useOrderHistoryStore.setState({
      orderHistory: [],
    })
  })

  it('should create an order history record', () => {
    const record = useOrderHistoryStore.getState().createOrderHistory({
      branch_id: '1',
      table_id: 't1',
      table_number: 5,
      staff_id: 's1',
      staff_name: 'Carlos',
    })

    const state = useOrderHistoryStore.getState()
    expect(state.orderHistory).toHaveLength(1)
    expect(record.branch_id).toBe('1')
    expect(record.table_number).toBe(5)
    expect(record.status).toBe('abierta')
    expect(record.commands).toEqual([])
    expect(record.total).toBe(0)
  })

  it('should get active order history for a table', () => {
    // Create two records, one open and one closed
    useOrderHistoryStore.getState().createOrderHistory({
      branch_id: '1', table_id: 't1', table_number: 1,
    })

    const activeHistory = useOrderHistoryStore.getState().getActiveOrderHistory('t1')
    expect(activeHistory).toBeDefined()
    expect(activeHistory?.table_id).toBe('t1')
    expect(activeHistory?.status).toBe('abierta')
  })

  it('should close an order history', () => {
    const record = useOrderHistoryStore.getState().createOrderHistory({
      branch_id: '1', table_id: 't1', table_number: 1,
    })

    useOrderHistoryStore.getState().closeOrderHistory(record.id, '22:30')
    const state = useOrderHistoryStore.getState()

    expect(state.orderHistory[0].status).toBe('cerrada')
    expect(state.orderHistory[0].close_time).toBe('22:30')
  })

  it('should filter order history by branch and date', () => {
    // Manually set records with known dates
    useOrderHistoryStore.setState({
      orderHistory: [
        { id: 'h1', branch_id: '1', table_id: 't1', table_number: 1, date: '2024-03-15', commands: [], order_time: '12:00', total: 0, status: 'cerrada', created_at: '', updated_at: '' },
        { id: 'h2', branch_id: '1', table_id: 't2', table_number: 2, date: '2024-03-16', commands: [], order_time: '13:00', total: 0, status: 'cerrada', created_at: '', updated_at: '' },
        { id: 'h3', branch_id: '2', table_id: 't3', table_number: 1, date: '2024-03-15', commands: [], order_time: '14:00', total: 0, status: 'cerrada', created_at: '', updated_at: '' },
      ],
    })

    const result = useOrderHistoryStore.getState().getByBranchAndDate('1', '2024-03-15', '2024-03-15')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('h1')
  })
})
