/**
 * Tests for reservationStore - Reservation management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReservationStore } from './reservationStore'

vi.mock('../services/api', () => ({
  reservationAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}))

import { reservationAPI } from '../services/api'

describe('reservationStore', () => {
  beforeEach(() => {
    useReservationStore.setState({
      reservations: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch reservations and populate state', async () => {
    const mockReservations = [
      { id: 1, tenant_id: 1, branch_id: 1, customer_name: 'Juan Perez', customer_phone: '555-1234', customer_email: null, party_size: 4, reservation_date: '2024-04-01', reservation_time: '20:00', duration_minutes: 90, table_id: null, status: 'PENDING', notes: null, is_active: true, created_at: '2024-03-30', updated_at: null },
      { id: 2, tenant_id: 1, branch_id: 1, customer_name: 'Maria Garcia', customer_phone: '555-5678', customer_email: null, party_size: 2, reservation_date: '2024-04-01', reservation_time: '21:00', duration_minutes: 90, table_id: null, status: 'CONFIRMED', notes: 'Cumpleanos', is_active: true, created_at: '2024-03-30', updated_at: null },
    ]
    vi.mocked(reservationAPI.list).mockResolvedValueOnce(mockReservations)

    await useReservationStore.getState().fetchReservations(1)
    const state = useReservationStore.getState()

    expect(state.reservations).toHaveLength(2)
    expect(state.reservations[0].customer_name).toBe('Juan Perez')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should update reservation status', async () => {
    useReservationStore.setState({
      reservations: [
        { id: 1, tenant_id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', customer_email: null, party_size: 4, reservation_date: '2024-04-01', reservation_time: '20:00', duration_minutes: 90, table_id: null, status: 'PENDING', notes: null, is_active: true, created_at: '2024-03-30', updated_at: null },
      ],
    })

    const updatedReservation = { id: 1, tenant_id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', customer_email: null, party_size: 4, reservation_date: '2024-04-01', reservation_time: '20:00', duration_minutes: 90, table_id: null, status: 'CONFIRMED', notes: null, is_active: true, created_at: '2024-03-30', updated_at: null }
    vi.mocked(reservationAPI.updateStatus).mockResolvedValueOnce(updatedReservation)

    await useReservationStore.getState().updateStatus(1, 'CONFIRMED')
    const state = useReservationStore.getState()

    expect(state.reservations[0].status).toBe('CONFIRMED')
    expect(state.isLoading).toBe(false)
  })

  it('should handle fetch error', async () => {
    vi.mocked(reservationAPI.list).mockRejectedValueOnce(new Error('Network error'))

    await expect(
      useReservationStore.getState().fetchReservations()
    ).rejects.toThrow('Network error')

    const state = useReservationStore.getState()
    expect(state.error).toBe('Network error')
    expect(state.isLoading).toBe(false)
  })

  it('should delete a reservation', async () => {
    useReservationStore.setState({
      reservations: [
        { id: 1, tenant_id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', customer_email: null, party_size: 4, reservation_date: '2024-04-01', reservation_time: '20:00', duration_minutes: 90, table_id: null, status: 'PENDING', notes: null, is_active: true, created_at: '2024-03-30', updated_at: null },
        { id: 2, tenant_id: 1, branch_id: 1, customer_name: 'Maria', customer_phone: '556', customer_email: null, party_size: 2, reservation_date: '2024-04-01', reservation_time: '21:00', duration_minutes: 90, table_id: null, status: 'CONFIRMED', notes: null, is_active: true, created_at: '2024-03-30', updated_at: null },
      ],
    })

    vi.mocked(reservationAPI.delete).mockResolvedValueOnce(undefined)

    await useReservationStore.getState().deleteReservation(1)
    const state = useReservationStore.getState()

    expect(state.reservations).toHaveLength(1)
    expect(state.reservations[0].id).toBe(2)
  })
})
