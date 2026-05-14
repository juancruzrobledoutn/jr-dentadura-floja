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
      { id: 1, branch_id: 1, customer_name: 'Juan Perez', customer_phone: '555-1234', party_size: 4, date: '2024-04-01', time: '20:00', status: 'PENDING', notes: null, created_at: '2024-03-30' },
      { id: 2, branch_id: 1, customer_name: 'Maria Garcia', customer_phone: '555-5678', party_size: 2, date: '2024-04-01', time: '21:00', status: 'CONFIRMED', notes: 'Cumpleanos', created_at: '2024-03-30' },
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
        { id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', party_size: 4, date: '2024-04-01', time: '20:00', status: 'PENDING', notes: null, created_at: '2024-03-30' },
      ],
    })

    const updatedReservation = { id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', party_size: 4, date: '2024-04-01', time: '20:00', status: 'CONFIRMED', notes: null, created_at: '2024-03-30' }
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
        { id: 1, branch_id: 1, customer_name: 'Juan', customer_phone: '555', party_size: 4, date: '2024-04-01', time: '20:00', status: 'PENDING', notes: null, created_at: '2024-03-30' },
        { id: 2, branch_id: 1, customer_name: 'Maria', customer_phone: '556', party_size: 2, date: '2024-04-01', time: '21:00', status: 'CONFIRMED', notes: null, created_at: '2024-03-30' },
      ],
    })

    vi.mocked(reservationAPI.delete).mockResolvedValueOnce(undefined)

    await useReservationStore.getState().deleteReservation(1)
    const state = useReservationStore.getState()

    expect(state.reservations).toHaveLength(1)
    expect(state.reservations[0].id).toBe(2)
  })
})
