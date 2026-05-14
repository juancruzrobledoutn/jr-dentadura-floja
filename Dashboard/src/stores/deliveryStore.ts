/**
 * Zustand store for managing delivery and takeout orders.
 */
import { create } from 'zustand'
import {
  deliveryAPI,
  type DeliveryOrder,
  type DeliveryOrderCreate,
  type DeliveryOrderUpdate,
} from '../services/api'

interface DeliveryState {
  orders: DeliveryOrder[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchOrders: (branchId: number, status?: string, orderType?: string) => Promise<void>
  createOrder: (branchId: number, data: DeliveryOrderCreate) => Promise<DeliveryOrder>
  updateOrder: (id: number, data: DeliveryOrderUpdate) => Promise<DeliveryOrder>
  updateStatus: (id: number, status: string) => Promise<DeliveryOrder>
  deleteOrder: (id: number) => Promise<void>
}

export const useDeliveryStore = create<DeliveryState>()((set) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async (branchId: number, status?: string, orderType?: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await deliveryAPI.list(branchId, status, orderType)
      set({ orders: data, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar pedidos'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  createOrder: async (branchId: number, data: DeliveryOrderCreate) => {
    set({ isLoading: true, error: null })
    try {
      const order = await deliveryAPI.create(branchId, data)
      set((state) => ({
        orders: [order, ...state.orders],
        isLoading: false,
      }))
      return order
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear pedido'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  updateOrder: async (id: number, data: DeliveryOrderUpdate) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await deliveryAPI.update(id, data)
      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? updated : o)),
        isLoading: false,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar pedido'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  updateStatus: async (id: number, status: string) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await deliveryAPI.updateStatus(id, status)
      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? updated : o)),
        isLoading: false,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar estado'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  deleteOrder: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      await deliveryAPI.delete(id)
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== id),
        isLoading: false,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar pedido'
      set({ error: message, isLoading: false })
      throw error
    }
  },
}))

// Selectors
const EMPTY_ORDERS: DeliveryOrder[] = []

export const selectDeliveryOrders = (state: DeliveryState) =>
  state.orders.length === 0 ? EMPTY_ORDERS : state.orders
export const selectDeliveryLoading = (state: DeliveryState) => state.isLoading
export const selectDeliveryError = (state: DeliveryState) => state.error
