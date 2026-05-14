/**
 * Zustand store for managing reservations.
 */
import { create } from 'zustand'
import {
  reservationAPI,
  type Reservation,
  type ReservationCreate,
  type ReservationUpdate,
} from '../services/api'

interface ReservationState {
  reservations: Reservation[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchReservations: (branchId?: number, date?: string, status?: string) => Promise<void>
  createReservation: (data: ReservationCreate) => Promise<Reservation>
  updateReservation: (id: number, data: ReservationUpdate) => Promise<Reservation>
  updateStatus: (id: number, status: string) => Promise<Reservation>
  deleteReservation: (id: number) => Promise<void>
}

export const useReservationStore = create<ReservationState>()((set) => ({
  reservations: [],
  isLoading: false,
  error: null,

  fetchReservations: async (branchId?: number, date?: string, status?: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await reservationAPI.list(branchId, date, status)
      set({ reservations: data, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar reservas'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  createReservation: async (data: ReservationCreate) => {
    set({ isLoading: true, error: null })
    try {
      const reservation = await reservationAPI.create(data)
      set((state) => ({
        reservations: [...state.reservations, reservation],
        isLoading: false,
      }))
      return reservation
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear reserva'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  updateReservation: async (id: number, data: ReservationUpdate) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await reservationAPI.update(id, data)
      set((state) => ({
        reservations: state.reservations.map((r) => (r.id === id ? updated : r)),
        isLoading: false,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar reserva'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  updateStatus: async (id: number, status: string) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await reservationAPI.updateStatus(id, status)
      set((state) => ({
        reservations: state.reservations.map((r) => (r.id === id ? updated : r)),
        isLoading: false,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cambiar estado'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  deleteReservation: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      await reservationAPI.delete(id)
      set((state) => ({
        reservations: state.reservations.filter((r) => r.id !== id),
        isLoading: false,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar reserva'
      set({ error: message, isLoading: false })
      throw error
    }
  },
}))

// Selectors
const EMPTY_RESERVATIONS: Reservation[] = []

export const selectReservations = (state: ReservationState) =>
  state.reservations.length === 0 ? EMPTY_RESERVATIONS : state.reservations
export const selectIsLoading = (state: ReservationState) => state.isLoading
export const selectError = (state: ReservationState) => state.error
