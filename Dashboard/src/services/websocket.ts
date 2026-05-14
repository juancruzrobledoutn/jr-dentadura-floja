/**
 * WebSocket service for Dashboard real-time updates
 * Extends BaseWebSocketClient from shared module.
 *
 * Connects to ws://localhost:8001/ws/admin for admin/manager role
 * or ws://localhost:8001/ws/kitchen for kitchen role
 */

import { BaseWebSocketClient, type WSEvent as BaseWSEvent, type EventCallback as BaseEventCallback } from '@shared/websocket-client'
import { getAuthToken } from './api'
import { logger } from '../utils/logger'

// MED-04 FIX: WebSocket logger context
const WS_CONTEXT = 'WebSocket'

/**
 * A006 FIX: Simple throttle implementation for WebSocket events
 * Ensures callbacks are called at most once per `limit` milliseconds
 */
function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): T {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null

  return ((...args: unknown[]) => {
    const now = Date.now()
    const remaining = limit - (now - lastCall)

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastCall = now
      func(...args)
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now()
        timeout = null
        func(...args)
      }, remaining)
    }
  }) as T
}

// A006 FIX: Default throttle delay for WebSocket events (100ms)
const DEFAULT_THROTTLE_DELAY = 100

// WebSocket event types from backend
// CROSS-SYS-01 FIX: Synchronized with backend/shared/infrastructure/events/event_types.py
export type WSEventType =
  // Round lifecycle events (PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED)
  | 'ROUND_PENDING'
  | 'ROUND_CONFIRMED'
  | 'ROUND_SUBMITTED'
  | 'ROUND_IN_KITCHEN'
  | 'ROUND_READY'
  | 'ROUND_SERVED'
  | 'ROUND_CANCELED'
  | 'ROUND_ITEM_DELETED'  // Item removed from round by waiter
  | 'ROUND_ITEM_VOIDED'  // Item voided from submitted round
  // Service call events
  | 'SERVICE_CALL_CREATED'
  | 'SERVICE_CALL_ACKED'
  | 'SERVICE_CALL_CLOSED'
  // Billing events
  | 'CHECK_REQUESTED'
  | 'CHECK_PAID'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_FAILED'
  // Table events
  | 'TABLE_CLEARED'
  | 'TABLE_STATUS_CHANGED'
  | 'TABLE_SESSION_STARTED'
  // Kitchen ticket events
  | 'TICKET_IN_PROGRESS'
  | 'TICKET_READY'
  | 'TICKET_DELIVERED'
  // Admin CRUD events
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'CASCADE_DELETE'

// DEF-HIGH-01 FIX: Entity types for admin CRUD events
export type AdminEntityType =
  | 'branch'
  | 'category'
  | 'subcategory'
  | 'product'
  | 'allergen'
  | 'table'
  | 'staff'
  | 'promotion'

/**
 * WebSocket event structure
 * WS-MED-03 FIX: Made branch_id and table_id optional since not all events have them
 * (e.g., ENTITY_CREATED for admin CRUD doesn't require table_id)
 */
export interface WSEvent {
  type: WSEventType
  // WS-MED-03 FIX: Made optional - not all events have branch_id (e.g., tenant-level events)
  branch_id?: number
  // WS-MED-03 FIX: Made optional - admin CRUD events don't have table_id
  table_id?: number
  session_id?: number
  entity?: {
    round_id?: number
    round_number?: number
    call_id?: number
    call_type?: string
    check_id?: number
    total_cents?: number
    paid_cents?: number
    payment_id?: number
    amount_cents?: number
    provider?: string
    table_code?: string
    // ROUND_ITEM_DELETED event fields
    item_id?: number
    round_deleted?: boolean
    // DEF-HIGH-01 FIX: Admin CRUD entity data
    entity_type?: AdminEntityType
    entity_id?: number
    entity_name?: string
    affected_entities?: Array<{
      type: AdminEntityType
      id: number
      name?: string
    }>
  }
  timestamp?: string
}

type EventCallback = (event: WSEvent) => void
type ConnectionStateCallback = (isConnected: boolean) => void

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

class DashboardWebSocket extends BaseWebSocketClient {
  private endpoint: 'admin' | 'kitchen' = 'admin'
  private lastCloseCode: number | null = null
  private branchId: number | null = null

  constructor() {
    // Dashboard doesn't use visibility handler
    super({ handleVisibility: false })
  }

  // ---------------------------------------------------------------------------
  // BaseWebSocketClient abstract implementations
  // ---------------------------------------------------------------------------

  protected getUrl(): string {
    return `${WS_BASE}/ws/${this.endpoint}`
  }

  protected getAuthParam(): string | null {
    const token = getAuthToken()
    if (!token) {
      logger.warn(WS_CONTEXT, 'No auth token available, cannot connect')
      return null
    }
    return `token=${encodeURIComponent(token)}`
  }

  // ---------------------------------------------------------------------------
  // BaseWebSocketClient hook overrides
  // ---------------------------------------------------------------------------

  protected override onOpen(wasReconnect: boolean): void {
    logger.info(WS_CONTEXT, `Connected to ${this.endpoint} WebSocket`)

    // CATCHUP: After reconnect, fetch missed events
    if (wasReconnect && this.lastEventTimestamp > 0) {
      this.catchUpEvents().catch((err) => {
        logger.warn(WS_CONTEXT, 'Catch-up after reconnect failed', err)
      })
    }
  }

  protected override onClose(code: number, reason: string): void {
    this.lastCloseCode = code
    logger.info(WS_CONTEXT, `Connection closed: ${code} ${reason}`)
  }

  protected override onMessage(event: BaseWSEvent): void {
    // Delegate to base notifyListeners — callbacks receive the event as-is
    // (Dashboard WSEvent is a structural superset of BaseWSEvent)
    this.notifyListeners(event)
  }

  // ---------------------------------------------------------------------------
  // Dashboard-specific public API
  // ---------------------------------------------------------------------------

  /**
   * Connect to WebSocket server
   * @param endpoint - 'admin' for full access or 'kitchen' for kitchen-only events
   */
  override connect(endpoint: 'admin' | 'kitchen' = 'admin'): void {
    // Close existing connection if switching endpoints
    if (this.ws && this.endpoint !== endpoint) {
      this.disconnect()
    }

    this.endpoint = endpoint
    super.connect()
  }

  /**
   * Subscribe to specific event types
   * Use '*' to listen to all events
   */
  override on(eventType: WSEventType | '*', callback: EventCallback): () => void {
    return super.on(eventType, callback as unknown as BaseEventCallback)
  }

  /**
   * C004 FIX: Subscribe to events filtered by branch ID
   * Only receives events for the specified branch
   */
  onFiltered(
    branchId: number,
    eventType: WSEventType | '*',
    callback: EventCallback
  ): () => void {
    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id === branchId) {
        callback(event)
      }
    }

    return super.on(eventType, filteredCallback as unknown as BaseEventCallback)
  }

  /**
   * C004 FIX: Subscribe to events filtered by multiple branch IDs
   * Useful when user has access to multiple branches
   */
  onFilteredMultiple(
    branchIds: number[],
    eventType: WSEventType | '*',
    callback: EventCallback
  ): () => void {
    const branchIdSet = new Set(branchIds)
    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id !== undefined && branchIdSet.has(event.branch_id)) {
        callback(event)
      }
    }

    return super.on(eventType, filteredCallback as unknown as BaseEventCallback)
  }

  /**
   * A006 FIX: Subscribe to events with throttling
   * Prevents excessive re-renders during high-traffic periods
   * @param eventType - Event type or '*' for all events
   * @param callback - Event handler
   * @param delay - Throttle delay in ms (default: 100ms)
   */
  onThrottled(
    eventType: WSEventType | '*',
    callback: EventCallback,
    delay: number = DEFAULT_THROTTLE_DELAY
  ): () => void {
    const throttledCallback = throttle(
      callback as unknown as (...args: unknown[]) => void,
      delay
    ) as unknown as BaseEventCallback

    return super.on(eventType, throttledCallback)
  }

  /**
   * A006 FIX: Subscribe with both branch filtering and throttling
   */
  onFilteredThrottled(
    branchId: number,
    eventType: WSEventType | '*',
    callback: EventCallback,
    delay: number = DEFAULT_THROTTLE_DELAY
  ): () => void {
    const throttledCallback = throttle(
      callback as unknown as (...args: unknown[]) => void,
      delay
    ) as unknown as EventCallback

    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id === branchId) {
        throttledCallback(event)
      }
    }

    return super.on(eventType, filteredCallback as unknown as BaseEventCallback)
  }

  /**
   * Subscribe to connection state changes
   * Calls callback immediately with current state (Dashboard-specific behavior)
   */
  override onConnectionChange(callback: ConnectionStateCallback): () => void {
    callback(this.isConnected())
    return super.onConnectionChange(callback)
  }

  /**
   * QA-AUDIT-03: Get last close code for debugging
   */
  getLastCloseCode(): number | null {
    return this.lastCloseCode
  }

  /**
   * DEF-DASH-01: Update token and reconnect WebSocket
   * Called when token is proactively refreshed to maintain connection
   */
  updateToken(): void {
    if (!this.isConnected()) {
      logger.debug(WS_CONTEXT, 'Not connected, skipping token update')
      return
    }

    logger.info(WS_CONTEXT, 'Token refreshed, reconnecting WebSocket')
    // Soft disconnect preserves listeners, then reconnect with new token
    this.softDisconnect()
    // Small delay to ensure clean disconnect before reconnect
    setTimeout(() => {
      this.connect(this.endpoint)
    }, 100)
  }

  // =============================================================================
  // CATCHUP: Event catch-up after reconnection
  // =============================================================================

  /**
   * Set the branch ID for catch-up requests.
   * Should be called when user selects/changes branch.
   */
  setBranchId(id: number): void {
    this.branchId = id
  }

  /**
   * Fetch missed events from the catch-up REST endpoint.
   * Called automatically after successful reconnection.
   */
  private async catchUpEvents(): Promise<void> {
    if (!this.branchId || this.lastEventTimestamp === 0) return

    const token = getAuthToken()
    if (!token) return

    try {
      // Convert ws:// or wss:// to http:// or https://
      const httpBaseUrl = WS_BASE.replace('ws://', 'http://').replace('wss://', 'https://')
      const url = `${httpBaseUrl}/ws/catchup?branch_id=${this.branchId}&since=${this.lastEventTimestamp}&token=${encodeURIComponent(token)}`

      const response = await fetch(url)
      if (!response.ok) {
        logger.warn(WS_CONTEXT, `Catch-up request failed with status ${response.status}`)
        return
      }

      const data = await response.json()
      const events = data.events as WSEvent[]

      if (events.length > 0) {
        logger.info(WS_CONTEXT, `Catching up ${events.length} missed events`)
        for (const event of events) {
          this.notifyListeners(event as BaseWSEvent)
        }
        // Update timestamp to latest caught-up event
        this.lastEventTimestamp = Date.now() / 1000
      }
    } catch (error) {
      logger.warn(WS_CONTEXT, 'Failed to catch up missed events', error)
    }
  }

  /**
   * Override destroy to add logging
   */
  override destroy(): void {
    super.destroy()
    logger.info(WS_CONTEXT, 'WebSocket service destroyed')
  }
}

// Singleton instance
export const dashboardWS = new DashboardWebSocket()
