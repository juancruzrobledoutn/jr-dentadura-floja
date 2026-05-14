import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OrderHistory, OrderCommand, OrderCommandItem } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'

interface OrderHistoryState {
  orderHistory: OrderHistory[]
  // Actions
  setOrderHistory: (history: OrderHistory[]) => void
  // Create a new order history record when table becomes occupied
  createOrderHistory: (data: {
    branch_id: string
    table_id: string
    table_number: number
    staff_id?: string
    staff_name?: string
  }) => OrderHistory
  // Add a command to an existing order history
  addCommand: (orderHistoryId: string, items: OrderCommandItem[]) => OrderCommand | null
  // Update command status
  updateCommandStatus: (
    orderHistoryId: string,
    commandId: string,
    status: OrderCommand['status']
  ) => void
  // Close an order history (when table is freed)
  closeOrderHistory: (orderHistoryId: string, closeTime: string) => void
  // Get active order history for a table
  getActiveOrderHistory: (tableId: string) => OrderHistory | undefined
  // Get order history by branch and date range
  getByBranchAndDate: (branchId: string, startDate: string, endDate: string) => OrderHistory[]
  // Get order history by table
  getByTable: (tableId: string) => OrderHistory[]
  // Delete order history by branch (cascade delete)
  deleteByBranch: (branchId: string) => void
}

const generateId = () => crypto.randomUUID()

/**
 * Get local date string in YYYY-MM-DD format
 * Uses local timezone consistently (not UTC)
 */
const getLocalDateString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get local time string in HH:mm format
 * Uses local timezone consistently
 */
const getLocalTimeString = () => {
  const now = new Date()
  return now.toTimeString().slice(0, 5)
}

// Initial mock data for demo
const initialOrderHistory: OrderHistory[] = []

export const useOrderHistoryStore = create<OrderHistoryState>()(
  persist(
    (set, get) => ({
      orderHistory: initialOrderHistory,

      setOrderHistory: (history) => set({ orderHistory: history }),

      createOrderHistory: (data) => {
        const now = new Date().toISOString()
        const newHistory: OrderHistory = {
          id: generateId(),
          branch_id: data.branch_id,
          table_id: data.table_id,
          table_number: data.table_number,
          date: getLocalDateString(),
          staff_id: data.staff_id,
          staff_name: data.staff_name,
          commands: [],
          order_time: getLocalTimeString(),
          close_time: undefined,
          total: 0,
          status: 'abierta',
          created_at: now,
          updated_at: now,
        }
        set((state) => ({
          orderHistory: [...state.orderHistory, newHistory],
        }))
        return newHistory
      },

      addCommand: (orderHistoryId, items) => {
        const history = get().orderHistory.find((h) => h.id === orderHistoryId)
        if (!history || history.status === 'cerrada') return null

        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
        const newCommand: OrderCommand = {
          id: generateId(),
          order_history_id: orderHistoryId,
          items,
          subtotal,
          created_at: new Date().toISOString(),
          status: 'pendiente',
        }

        set((state) => ({
          orderHistory: state.orderHistory.map((h) =>
            h.id === orderHistoryId
              ? {
                  ...h,
                  commands: [...h.commands, newCommand],
                  total: h.total + subtotal,
                  updated_at: new Date().toISOString(),
                }
              : h
          ),
        }))

        return newCommand
      },

      updateCommandStatus: (orderHistoryId, commandId, status) =>
        set((state) => ({
          orderHistory: state.orderHistory.map((h) =>
            h.id === orderHistoryId
              ? {
                  ...h,
                  commands: h.commands.map((c) =>
                    c.id === commandId ? { ...c, status } : c
                  ),
                  updated_at: new Date().toISOString(),
                }
              : h
          ),
        })),

      closeOrderHistory: (orderHistoryId, closeTime) =>
        set((state) => ({
          orderHistory: state.orderHistory.map((h) =>
            h.id === orderHistoryId
              ? {
                  ...h,
                  close_time: closeTime,
                  status: 'cerrada',
                  updated_at: new Date().toISOString(),
                }
              : h
          ),
        })),

      getActiveOrderHistory: (tableId) => {
        return get().orderHistory.find(
          (h) => h.table_id === tableId && h.status === 'abierta'
        )
      },

      getByBranchAndDate: (branchId, startDate, endDate) => {
        return get().orderHistory.filter(
          (h) =>
            h.branch_id === branchId &&
            h.date >= startDate &&
            h.date <= endDate
        )
      },

      getByTable: (tableId) => {
        return get().orderHistory.filter((h) => h.table_id === tableId)
      },

      deleteByBranch: (branchId) =>
        set((state) => ({
          orderHistory: state.orderHistory.filter((h) => h.branch_id !== branchId),
        })),
    }),
    {
      name: STORAGE_KEYS.ORDER_HISTORY,
      version: STORE_VERSIONS.ORDER_HISTORY,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { orderHistory: OrderHistory[] }

        // Ensure orderHistory array exists - return new object, don't mutate
        if (!Array.isArray(persisted.orderHistory)) {
          return { orderHistory: initialOrderHistory }
        }

        const orderHistory = persisted.orderHistory

        // Future migrations here
        if (version < 1) {
          // Initial version, nothing to migrate
        }

        return { orderHistory }
      },
    }
  )
)

// Selectors
export const selectOrderHistory = (state: OrderHistoryState) => state.orderHistory
