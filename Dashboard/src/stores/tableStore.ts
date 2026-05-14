import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RestaurantTable, RestaurantTableFormData, OrderStatus } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS, TABLE_DEFAULT_TIME } from '../utils/constants'
import { tableAPI, type TableData as APITable, type TableBulkCreate, type TableBulkResult } from '../services/api'
import { dashboardWS, type WSEvent } from '../services/websocket'
import { logger } from '../utils/logger'

// QA-AUDIT-CRIT-02: Track blink animation timeouts per table to prevent multiple pending timeouts
const blinkTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// QA-AUDIT-MED-08: Track pending TABLE_STATUS_CHANGED API calls to prevent duplicates
const pendingStatusFetches = new Map<string, ReturnType<typeof setTimeout>>()

interface TableState {
  tables: RestaurantTable[]
  isLoading: boolean
  error: string | null
  // CRIT-12 FIX: Track if already subscribed to prevent duplicate listeners
  _isSubscribed: boolean
  // Actions
  setTables: (tables: RestaurantTable[]) => void
  addTable: (data: RestaurantTableFormData) => RestaurantTable
  updateTable: (id: string, data: Partial<RestaurantTableFormData>) => void
  deleteTable: (id: string) => void
  deleteByBranch: (branchId: string) => void
  getByBranch: (branchId: string) => RestaurantTable[]
  getNextTableNumber: (branchId: string) => number
  clearNewOrderFlag: (tableId: string) => void  // Clear hasNewOrder flag after attending
  // Async API actions
  fetchTables: (branchId?: number) => Promise<void>
  createTableAsync: (data: RestaurantTableFormData) => Promise<RestaurantTable>
  createTablesBatch: (data: TableBulkCreate) => Promise<TableBulkResult>
  updateTableAsync: (id: string, data: Partial<RestaurantTableFormData>) => Promise<void>
  deleteTableAsync: (id: string) => Promise<void>
  // WebSocket actions
  handleWSEvent: (event: WSEvent) => void
  subscribeToTableEvents: () => () => void
}

const generateId = () => crypto.randomUUID()

/**
 * A004 FIX: Bidirectional status mapping between frontend (Spanish) and backend (English)
 * Backend uses: FREE, ACTIVE, PAYING, OUT_OF_SERVICE (simplified states)
 * Frontend uses: libre, ocupada, solicito_pedido, pedido_cumplido, cuenta_solicitada (detailed states)
 */
const API_STATUS_TO_FRONTEND: Record<string, RestaurantTable['status']> = {
  'FREE': 'libre',
  'ACTIVE': 'ocupada',          // Backend ACTIVE covers multiple frontend states
  'PAYING': 'cuenta_solicitada',
  'OUT_OF_SERVICE': 'libre',    // Treated as libre but table will be is_active=false
  // Legacy mappings for backward compatibility
  'AVAILABLE': 'libre',
  'OCCUPIED': 'ocupada',
  'ORDERING': 'solicito_pedido',
  'SERVED': 'pedido_cumplido',
  'CHECK_REQUESTED': 'cuenta_solicitada',
}

const FRONTEND_STATUS_TO_API: Record<RestaurantTable['status'], string> = {
  'libre': 'FREE',
  'ocupada': 'ACTIVE',
  'solicito_pedido': 'ACTIVE',    // Backend treats as ACTIVE
  'pedido_cumplido': 'ACTIVE',    // Backend treats as ACTIVE
  'cuenta_solicitada': 'PAYING',
}

// Map backend round status to frontend OrderStatus
// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
const ROUND_STATUS_TO_ORDER_STATUS: Record<string, OrderStatus> = {
  'PENDING': 'pending',
  'CONFIRMED': 'confirmed',
  'SUBMITTED': 'submitted',
  'IN_KITCHEN': 'in_kitchen',
  'READY': 'ready',
  'SERVED': 'served',
}

// Helper to convert API table to frontend table
// Note: API uses 'code' (string), frontend uses 'number' (int)
function mapAPITableToFrontend(apiTable: APITable): RestaurantTable {
  // Parse table number from code (e.g., "Mesa 1" -> 1, or just "1" -> 1)
  const codeMatch = apiTable.code.match(/\d+/)
  const tableNumber = codeMatch ? parseInt(codeMatch[0], 10) : 1

  // A004 FIX: Use status mapping
  const status = API_STATUS_TO_FRONTEND[apiTable.status] ?? 'libre'

  // Convert active_round_statuses from API (numeric keys) to roundStatuses (string keys)
  const roundStatuses: Record<string, OrderStatus> = {}
  if (apiTable.active_round_statuses) {
    for (const [roundId, roundStatus] of Object.entries(apiTable.active_round_statuses)) {
      const frontendStatus = ROUND_STATUS_TO_ORDER_STATUS[roundStatus]
      if (frontendStatus) {
        roundStatuses[roundId] = frontendStatus
      }
    }
  }

  // Calculate initial orderStatus from active rounds
  const orderStatus = calculateAggregateOrderStatus(roundStatuses)
  const hasPendingRounds = Object.values(roundStatuses).includes('pending')

  return {
    id: String(apiTable.id),
    branch_id: String(apiTable.branch_id),
    number: tableNumber,
    capacity: apiTable.capacity,
    sector: apiTable.sector ?? 'Interior',
    status,
    orderStatus,
    roundStatuses,
    order_time: TABLE_DEFAULT_TIME,
    close_time: TABLE_DEFAULT_TIME,
    is_active: apiTable.is_active,
    statusChanged: false,
    hasNewOrder: hasPendingRounds,
    confirmedByName: apiTable.confirmed_by_name ?? undefined,
  }
}

// Helper to convert frontend status to API status
function mapFrontendStatusToAPI(status: RestaurantTable['status']): string {
  return FRONTEND_STATUS_TO_API[status]
}

/**
 * Calculate aggregate order status from individual round statuses.
 * Priority order (highest to lowest):
 *   1. ready_with_kitchen - If any round is READY and any is NOT ready (pending/submitted/in_kitchen)
 *      → Show "Listo + Cocina" to alert waiter that items are ready for pickup
 *   2. pending - If ALL rounds are pending (none ready), show "Pendiente"
 *   3. submitted/in_kitchen - All rounds in kitchen (same priority, both = "En Cocina")
 *   4. ready - All rounds ready
 *   5. served - All rounds served
 *   6. none - No active order
 *
 * Examples:
 *   [ready, pending] → 'ready_with_kitchen' (some ready, some pending)
 *   [ready, in_kitchen] → 'ready_with_kitchen' (some ready, some in kitchen)
 *   [pending, pending] → 'pending' (all pending)
 *   [submitted, in_kitchen] → 'in_kitchen' (all in kitchen)
 */
// Flow: pending → confirmed → submitted → in_kitchen → ready → served
const ORDER_STATUS_PRIORITY: Record<OrderStatus, number> = {
  'pending': 0,            // Worst - needs waiter to verify at table → "Pendiente"
  'confirmed': 1,          // Waiter verified, needs manager to send → "Confirmado"
  'submitted': 2,          // Sent to kitchen → "En Cocina"
  'in_kitchen': 2,         // Kitchen working → "En Cocina" (same priority)
  'ready_with_kitchen': 3, // Mixed: some ready, some still in kitchen
  'ready': 4,              // Kitchen finished → "Listo"
  'served': 5,             // Delivered → "Servido"
  'none': 6,               // No active order
}

function calculateAggregateOrderStatus(roundStatuses: Record<string, OrderStatus> | undefined): OrderStatus {
  if (!roundStatuses) return 'none'

  const statuses = Object.values(roundStatuses)
  if (statuses.length === 0) return 'none'

  // PRIORITY 1: Check for combined state - ready + anything not ready
  // If any round is ready AND any round is still pending/confirmed/in_kitchen/submitted,
  // show "Listo + Cocina" to alert waiter that some items are ready for pickup
  const hasReady = statuses.includes('ready')
  const hasNotReady = statuses.includes('pending') ||
                      statuses.includes('confirmed') ||
                      statuses.includes('in_kitchen') ||
                      statuses.includes('submitted')

  if (hasReady && hasNotReady) {
    // Combined state: some rounds ready, some still awaiting kitchen
    return 'ready_with_kitchen'
  }

  // PRIORITY 2: If ANY round is pending (and none ready), show pending
  // pending takes precedence over confirmed (waiter must verify first)
  if (statuses.includes('pending')) {
    return 'pending'
  }

  // PRIORITY 2.5: If ANY round is confirmed (and none pending/ready), show confirmed
  if (statuses.includes('confirmed')) {
    return 'confirmed'
  }

  // PRIORITY 3: Find the status with lowest priority (worst/earliest status)
  let worstStatus: OrderStatus = 'none'
  let worstPriority = ORDER_STATUS_PRIORITY['none']

  for (const status of statuses) {
    const priority = ORDER_STATUS_PRIORITY[status] ?? 6
    if (priority < worstPriority) {
      worstStatus = status
      worstPriority = priority
    }
  }

  return worstStatus
}

// Empty initial state - data comes from backend API
const initialTables: RestaurantTable[] = []

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      tables: initialTables,
      isLoading: false,
      error: null,
      // CRIT-12 FIX: Initialize subscription tracking
      _isSubscribed: false,

      setTables: (tables) => set({ tables }),

      addTable: (data) => {
        const newTable: RestaurantTable = {
          id: generateId(),
          ...data,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ tables: [...state.tables, newTable] }))
        return newTable
      },

      updateTable: (id, data) =>
        set((state) => ({
          tables: state.tables.map((table) =>
            table.id === id
              ? { ...table, ...data, updated_at: new Date().toISOString() }
              : table
          ),
        })),

      deleteTable: (id) =>
        set((state) => ({
          tables: state.tables.filter((table) => table.id !== id),
        })),

      deleteByBranch: (branchId) =>
        set((state) => ({
          tables: state.tables.filter((table) => table.branch_id !== branchId),
        })),

      getByBranch: (branchId) => {
        return get().tables.filter((table) => table.branch_id === branchId)
      },

      getNextTableNumber: (branchId) => {
        const branchTables = get().tables.filter((t) => t.branch_id === branchId)
        if (branchTables.length === 0) return 1
        const maxNumber = Math.max(...branchTables.map((t) => t.number))
        return maxNumber + 1
      },

      clearNewOrderFlag: (tableId) => {
        set((state) => ({
          tables: state.tables.map((table) =>
            table.id === tableId
              ? { ...table, hasNewOrder: false }
              : table
          ),
        }))
      },

      // Async API actions
      fetchTables: async (branchId) => {
        set({ isLoading: true, error: null })
        try {
          const apiTables = await tableAPI.list(branchId)
          const baseTables = apiTables.map(mapAPITableToFrontend)

          set((state) => {
            // Create a map of existing UI state by table ID (animations only)
            const existingUIState = new Map(
              state.tables.map((t) => [t.id, {
                statusChanged: t.statusChanged,
              }])
            )

            // Use API data as source of truth for order status
            // API returns active_round_statuses which mapAPITableToFrontend converts to roundStatuses
            // Only preserve UI animation state (statusChanged)
            const tables = baseTables.map((table) => {
              const existing = existingUIState.get(table.id)
              if (existing) {
                return {
                  ...table,
                  // Preserve animation state only
                  statusChanged: existing.statusChanged,
                }
              }
              return table
            })

            if (branchId) {
              // Replace only tables for this branch
              const otherBranches = state.tables.filter(
                (t) => t.branch_id !== String(branchId)
              )
              return { tables: [...otherBranches, ...tables], isLoading: false }
            }
            return { tables, isLoading: false }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar mesas'
          set({ error: message, isLoading: false })
        }
      },

      createTableAsync: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const branchId = parseInt(data.branch_id, 10)
          if (isNaN(branchId)) {
            // Local branch, create locally
            const newTable = get().addTable(data)
            set({ isLoading: false })
            return newTable
          }

          const apiTable = await tableAPI.create({
            branch_id: branchId,
            code: `Mesa ${data.number}`,
            capacity: data.capacity,
            sector: data.sector,
            is_active: data.is_active,
          })

          const newTable = mapAPITableToFrontend(apiTable)
          // Preserve frontend-specific fields
          newTable.order_time = data.order_time ?? TABLE_DEFAULT_TIME
          newTable.close_time = data.close_time ?? TABLE_DEFAULT_TIME

          set((state) => ({
            tables: [...state.tables, newTable],
            isLoading: false,
          }))
          return newTable
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear mesa'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      createTablesBatch: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const result = await tableAPI.createBatch(data)

          // Convert all created tables to frontend format
          const newTables = result.tables.map(mapAPITableToFrontend)

          set((state) => ({
            tables: [...state.tables, ...newTables],
            isLoading: false,
          }))

          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear mesas'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      updateTableAsync: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (isNaN(numericId)) {
            // Local table, update locally
            get().updateTable(id, data)
            set({ isLoading: false })
            return
          }

          const updateData: { code?: string; capacity?: number; sector?: string; status?: string; is_active?: boolean } = {}
          if (data.number !== undefined) updateData.code = `Mesa ${data.number}`
          if (data.capacity !== undefined) updateData.capacity = data.capacity
          if (data.sector !== undefined) updateData.sector = data.sector
          if (data.status !== undefined) updateData.status = mapFrontendStatusToAPI(data.status)
          if (data.is_active !== undefined) updateData.is_active = data.is_active

          await tableAPI.update(numericId, updateData)

          set((state) => ({
            tables: state.tables.map((table) =>
              table.id === id
                ? { ...table, ...data, updated_at: new Date().toISOString() }
                : table
            ),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al actualizar mesa'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      deleteTableAsync: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const numericId = parseInt(id, 10)
          if (!isNaN(numericId)) {
            await tableAPI.delete(numericId)
          }

          set((state) => ({
            tables: state.tables.filter((table) => table.id !== id),
            isLoading: false,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al eliminar mesa'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      // DASH-001: WebSocket event handler for real-time table updates
      handleWSEvent: (event) => {
        // QA-AUDIT-MED-06: Validate table_id before processing
        if (event.table_id === undefined || event.table_id === null) {
          // Some events (like ENTITY_CREATED) don't have table_id - skip silently
          return
        }
        const tableId = String(event.table_id)

        // QA-AUDIT-MED-06: Validate tableId is not "undefined" or "null" string
        if (tableId === 'undefined' || tableId === 'null' || tableId === '') {
          return
        }

        // Extract round_id from event entity (for round-specific tracking)
        const roundId = event.entity?.round_id ? String(event.entity.round_id) : null

        // QA-AUDIT-CRIT-02: Helper to schedule blink clear with timeout tracking
        const scheduleBinkClear = (tableId: string) => {
          // Clear any existing timeout for this table to prevent multiple pending timeouts
          const existingTimeout = blinkTimeouts.get(tableId)
          if (existingTimeout) {
            clearTimeout(existingTimeout)
          }
          // Schedule new timeout
          const timeoutId = setTimeout(() => {
            blinkTimeouts.delete(tableId)
            set((state) => ({
              tables: state.tables.map((table) =>
                table.id === tableId
                  ? { ...table, statusChanged: false }
                  : table
              ),
            }))
          }, 1500)
          blinkTimeouts.set(tableId, timeoutId)
        }

        // Helper to update table with statusChanged flag and auto-clear after animation
        const updateTableWithBlink = (
          tableId: string,
          updates: Partial<RestaurantTable>
        ) => {
          set((state) => ({
            tables: state.tables.map((table) =>
              table.id === tableId
                ? {
                    ...table,
                    ...updates,
                    statusChanged: true,
                    updated_at: new Date().toISOString(),
                  }
                : table
            ),
          }))
          // QA-AUDIT-CRIT-02: Use tracked timeout instead of anonymous setTimeout
          scheduleBinkClear(tableId)
        }

        /**
         * Helper to update a specific round's status and recalculate aggregate.
         * This ensures that if table has 3 rounds and only 1 is submitted,
         * the aggregate stays 'pending' until ALL rounds are submitted.
         */
        const updateRoundStatus = (
          tableId: string,
          roundId: string | null,
          newRoundStatus: OrderStatus,
          extraUpdates?: Partial<RestaurantTable>
        ) => {
          set((state) => ({
            tables: state.tables.map((table) => {
              if (table.id !== tableId) return table

              // Update the specific round's status
              const roundStatuses = { ...(table.roundStatuses ?? {}) }
              if (roundId) {
                roundStatuses[roundId] = newRoundStatus
              }

              // Calculate aggregate status (worst status across all rounds)
              const aggregateStatus = calculateAggregateOrderStatus(roundStatuses)

              // Check if any round is still pending (for hasNewOrder flag)
              const hasPendingRounds = Object.values(roundStatuses).includes('pending')

              return {
                ...table,
                ...extraUpdates,
                roundStatuses,
                orderStatus: aggregateStatus,
                hasNewOrder: hasPendingRounds,
                statusChanged: true,
                updated_at: new Date().toISOString(),
              }
            }),
          }))

          // QA-AUDIT-CRIT-02: Use tracked timeout instead of anonymous setTimeout
          scheduleBinkClear(tableId)
        }

        switch (event.type) {
          case 'TABLE_CLEARED':
            // Table session ended - clear all rounds and set status to libre
            updateTableWithBlink(tableId, {
              status: 'libre' as const,
              orderStatus: 'none' as OrderStatus,
              roundStatuses: {},  // Clear all round tracking
              order_time: TABLE_DEFAULT_TIME,
              close_time: TABLE_DEFAULT_TIME,
              hasNewOrder: false,
            })
            break

          case 'TABLE_STATUS_CHANGED':
            // Generic status change - refetch the specific table to get new status
            // QA-AUDIT-MED-08: Debounce API calls to prevent multiple simultaneous requests
            {
              // Cancel any pending fetch for this table
              const existingFetch = pendingStatusFetches.get(tableId)
              if (existingFetch) {
                clearTimeout(existingFetch)
              }

              // Schedule new fetch with 100ms debounce
              const fetchTimeout = setTimeout(() => {
                pendingStatusFetches.delete(tableId)
                tableAPI.get(event.table_id!).then((apiTable: APITable) => {
                  const updatedTable = mapAPITableToFrontend(apiTable)
                  set((state) => ({
                    tables: state.tables.map((table) =>
                      table.id === tableId
                        ? { ...table, ...updatedTable, updated_at: new Date().toISOString() }
                        : table
                    ),
                  }))
                }).catch((err: Error) => {
                  // QA-AUDIT: Use static logger import
                  logger.error('TableStore', 'Failed to fetch table after status change', err)
                })
              }, 100)
              pendingStatusFetches.set(tableId, fetchTimeout)
            }
            break

          case 'TABLE_SESSION_STARTED':
            // Diner scanned QR code - table is now occupied, reset round tracking
            updateTableWithBlink(tableId, {
              status: 'ocupada' as const,
              orderStatus: 'none' as OrderStatus,
              roundStatuses: {},  // Fresh session, no rounds yet
            })
            break

          case 'ROUND_PENDING':
            // Client created order - track this round as pending
            updateRoundStatus(tableId, roundId, 'pending', {
              status: 'ocupada' as const,
              order_time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            })
            break

          case 'ROUND_CONFIRMED':
            // Waiter verified order at table - track this round as confirmed
            updateRoundStatus(tableId, roundId, 'confirmed', {
              status: 'ocupada' as const,
            })
            break

          case 'ROUND_SUBMITTED':
            // Manager sent this round to kitchen
            updateRoundStatus(tableId, roundId, 'submitted', {
              status: 'ocupada' as const,
            })
            break

          case 'ROUND_IN_KITCHEN':
            // Kitchen started preparing this round
            updateRoundStatus(tableId, roundId, 'in_kitchen')
            break

          case 'ROUND_READY':
            // Kitchen finished this round
            updateRoundStatus(tableId, roundId, 'ready')
            break

          case 'ROUND_SERVED':
            // This round delivered - update status and clean up if all served
            if (roundId) {
              set((state) => ({
                tables: state.tables.map((table) => {
                  if (table.id !== tableId) return table

                  // Update this round to served
                  const roundStatuses = { ...(table.roundStatuses ?? {}) }
                  roundStatuses[roundId] = 'served'

                  // QA-AUDIT-MED-04: Clean up old served rounds to prevent unbounded growth
                  // If all rounds are now served, clear the roundStatuses to free memory
                  const allServed = Object.values(roundStatuses).every((s) => s === 'served')
                  const cleanedRoundStatuses = allServed ? {} : roundStatuses

                  // Recalculate aggregate status
                  const aggregateStatus = calculateAggregateOrderStatus(cleanedRoundStatuses)
                  const hasPendingRounds = Object.values(cleanedRoundStatuses).includes('pending')

                  return {
                    ...table,
                    roundStatuses: cleanedRoundStatuses,
                    orderStatus: aggregateStatus,
                    hasNewOrder: hasPendingRounds,
                    status: 'pedido_cumplido' as const,
                    statusChanged: true,
                    updated_at: new Date().toISOString(),
                  }
                }),
              }))

              // QA-AUDIT-CRIT-02: Use tracked timeout
              scheduleBinkClear(tableId)
            }
            break

          case 'ROUND_CANCELED':
            // CROSS-SYS-01 FIX: Handle round cancellation
            // Remove this round from tracking and recalculate aggregate status
            if (roundId) {
              set((state) => ({
                tables: state.tables.map((table) => {
                  if (table.id !== tableId) return table

                  // Remove the canceled round from tracking
                  const roundStatuses = { ...(table.roundStatuses ?? {}) }
                  delete roundStatuses[roundId]

                  // Recalculate aggregate status
                  const aggregateStatus = calculateAggregateOrderStatus(roundStatuses)
                  const hasPendingRounds = Object.values(roundStatuses).includes('pending')

                  return {
                    ...table,
                    roundStatuses,
                    orderStatus: aggregateStatus,
                    hasNewOrder: hasPendingRounds,
                    statusChanged: true,
                    updated_at: new Date().toISOString(),
                  }
                }),
              }))

              // QA-AUDIT-CRIT-02: Use tracked timeout instead of anonymous setTimeout
              scheduleBinkClear(tableId)
            }
            break

          case 'ROUND_ITEM_DELETED':
            // Item deleted from round by waiter - refetch table to get updated data
            // If round_deleted is true, entire round was removed (was empty after item deletion)
            {
              const roundDeleted = event.entity?.round_deleted === true

              if (roundDeleted && roundId) {
                // Round was deleted - remove from tracking
                set((state) => ({
                  tables: state.tables.map((table) => {
                    if (table.id !== tableId) return table

                    const roundStatuses = { ...(table.roundStatuses ?? {}) }
                    delete roundStatuses[roundId]

                    const aggregateStatus = calculateAggregateOrderStatus(roundStatuses)
                    const hasPendingRounds = Object.values(roundStatuses).includes('pending')

                    return {
                      ...table,
                      roundStatuses,
                      orderStatus: aggregateStatus,
                      hasNewOrder: hasPendingRounds,
                      statusChanged: true,
                      updated_at: new Date().toISOString(),
                    }
                  }),
                }))
                scheduleBinkClear(tableId)
              } else {
                // Item deleted but round still exists - just trigger blink to notify
                updateTableWithBlink(tableId, {})
              }
            }
            break

          case 'CHECK_REQUESTED':
            // Check requested - table wants to pay
            updateTableWithBlink(tableId, {
              status: 'cuenta_solicitada' as const,
              close_time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            })
            break

          case 'CHECK_PAID':
            // Check paid - table session will be cleared
            // TABLE_CLEARED event will follow, but update status immediately
            set((state) => ({
              tables: state.tables.map((table) =>
                table.id === tableId
                  ? {
                      ...table,
                      status: 'cuenta_solicitada' as const,
                      updated_at: new Date().toISOString(),
                    }
                  : table
              ),
            }))
            break
        }
      },

      // Subscribe to relevant WebSocket events
      // CRIT-12 FIX: Prevent duplicate subscriptions
      // WS-HIGH-04 NOTE: This method is not used - Dashboard uses useTableWebSocket hook instead.
      // Kept for potential future use or if components need direct store subscription.
      // If removing, also update the TablesState interface (line 30).
      subscribeToTableEvents: () => {
        // If already subscribed, return a no-op cleanup function
        if (get()._isSubscribed) {
          return () => {}
        }

        const eventTypes = [
          'TABLE_CLEARED',
          'TABLE_STATUS_CHANGED',
          'ROUND_PENDING',
          'ROUND_CONFIRMED',
          'ROUND_SUBMITTED',
          'ROUND_IN_KITCHEN',
          'ROUND_READY',
          'ROUND_SERVED',
          'ROUND_CANCELED',
          'CHECK_REQUESTED',
          'CHECK_PAID',
        ] as const

        const unsubscribers = eventTypes.map((eventType) =>
          dashboardWS.on(eventType, get().handleWSEvent)
        )

        // CRIT-12 FIX: Mark as subscribed
        set({ _isSubscribed: true })

        // Return cleanup function
        return () => {
          unsubscribers.forEach((unsub) => unsub())
          set({ _isSubscribed: false })
        }
      },
    }),
    {
      name: STORAGE_KEYS.TABLES,
      version: STORE_VERSIONS.TABLES,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { tables: RestaurantTable[] }

        // Ensure tables array exists - return new object, don't mutate
        if (!Array.isArray(persisted.tables)) {
          return { tables: [] }
        }

        let tables = persisted.tables

        // v2: Add order_time and close_time fields
        if (version < 2) {
          tables = tables.map((table) => ({
            ...table,
            order_time: table.order_time ?? TABLE_DEFAULT_TIME,
            close_time: table.close_time ?? TABLE_DEFAULT_TIME,
          }))
        }

        // v3/v4/v5/v6: Update time rules based on status
        // - libre/ocupada: both times = 00:00
        // - solicito_pedido/pedido_cumplido: order_time = value, close_time = 00:00
        // - cuenta_solicitada: both times have values
        if (version < 6) {
          // Use a fixed fallback time for migration to ensure consistency
          const MIGRATION_FALLBACK_TIME = '12:00'

          tables = tables.map((table) => {
            if (table.status === 'libre' || table.status === 'ocupada') {
              return {
                ...table,
                order_time: TABLE_DEFAULT_TIME,
                close_time: TABLE_DEFAULT_TIME,
              }
            }
            if (table.status === 'solicito_pedido' || table.status === 'pedido_cumplido') {
              return {
                ...table,
                // Keep existing order_time or use fixed fallback time for consistency
                order_time: table.order_time && table.order_time !== TABLE_DEFAULT_TIME
                  ? table.order_time
                  : MIGRATION_FALLBACK_TIME,
                close_time: TABLE_DEFAULT_TIME,
              }
            }
            return table
          })
        }

        // Version 7: Clear mock data, data comes from backend
        if (version < 7) {
          tables = tables.filter(t => !t.id.startsWith('table-'))
        }

        return { tables }
      },
      partialize: (state) => ({
        tables: state.tables,
      }),
    }
  )
)

// HIGH-05 FIX: Stable empty array for React 19 getSnapshot compatibility
const EMPTY_TABLES: RestaurantTable[] = []

// Selectors
export const selectTables = (state: TableState) => state.tables.length > 0 ? state.tables : EMPTY_TABLES
export const selectTableLoading = (state: TableState) => state.isLoading
export const selectTableError = (state: TableState) => state.error

// =============================================================================
// ZUSTAND-REACT19: Memoized filtered selectors with cache pattern
// Prevents new array references on every call when filtering by branch
// =============================================================================

// Cache for selectTablesByBranch - keyed by branchId
const tablesByBranchCache = new Map<string, { tables: RestaurantTable[] | null, result: RestaurantTable[] }>()

/**
 * Memoized selector for tables filtered by branch ID.
 * Returns stable array reference when tables haven't changed.
 */
export const selectTablesByBranch = (branchId: string) => (state: TableState): RestaurantTable[] => {
  let cache = tablesByBranchCache.get(branchId)
  if (!cache) {
    cache = { tables: null, result: EMPTY_TABLES }
    tablesByBranchCache.set(branchId, cache)
  }

  if (state.tables === cache.tables) {
    return cache.result
  }

  const filtered = state.tables.filter((t) => t.branch_id === branchId)
  cache.tables = state.tables
  cache.result = filtered.length > 0 ? filtered : EMPTY_TABLES
  return cache.result
}

// Cache for selectTablesWithPendingRounds
const pendingRoundsCache = { tables: null as RestaurantTable[] | null, result: EMPTY_TABLES }

/**
 * Memoized selector for tables with pending rounds.
 * Returns stable array reference when tables haven't changed.
 */
export const selectTablesWithPendingRounds = (state: TableState): RestaurantTable[] => {
  if (state.tables === pendingRoundsCache.tables) {
    return pendingRoundsCache.result
  }
  const filtered = state.tables.filter((t) => t.orderStatus === 'pending')
  pendingRoundsCache.tables = state.tables
  pendingRoundsCache.result = filtered.length > 0 ? filtered : EMPTY_TABLES
  return pendingRoundsCache.result
}

// Cache for selectTablesWithActiveOrders
const activeOrdersCache = { tables: null as RestaurantTable[] | null, result: EMPTY_TABLES }

/**
 * Memoized selector for tables with active orders (not none/served).
 * Returns stable array reference when tables haven't changed.
 */
export const selectTablesWithActiveOrders = (state: TableState): RestaurantTable[] => {
  if (state.tables === activeOrdersCache.tables) {
    return activeOrdersCache.result
  }
  const filtered = state.tables.filter((t) =>
    t.orderStatus !== 'none' && t.orderStatus !== 'served'
  )
  activeOrdersCache.tables = state.tables
  activeOrdersCache.result = filtered.length > 0 ? filtered : EMPTY_TABLES
  return activeOrdersCache.result
}
