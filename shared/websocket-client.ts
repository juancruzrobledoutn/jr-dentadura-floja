/**
 * BaseWebSocketClient — shared abstract WebSocket client for all frontends.
 *
 * Extracted from Dashboard, pwaMenu, and pwaWaiter implementations.
 * Each frontend extends this class to provide its own URL, auth param,
 * and optional hooks (catch-up, token refresh, etc.).
 *
 * Usage:
 *   class DashboardWS extends BaseWebSocketClient {
 *     protected getUrl() { return `${WS_BASE}/ws/admin` }
 *     protected getAuthParam() { return `token=${getAuthToken()}` }
 *   }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSEvent {
  type: string
  [key: string]: unknown
}

export type EventCallback = (event: WSEvent) => void
export type ConnectionCallback = (connected: boolean) => void
export type MaxReconnectCallback = () => void

export interface BaseWSClientOptions {
  /** Opt-in to automatic reconnect on page visibility change (mobile sleep). */
  handleVisibility?: boolean
}

// ---------------------------------------------------------------------------
// Constants (identical across all 3 frontends)
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL = 30_000
const HEARTBEAT_TIMEOUT = 10_000
const BASE_RECONNECT_DELAY = 1_000
const MAX_RECONNECT_DELAY = 30_000
const JITTER_FACTOR = 0.3
const MAX_RECONNECT_ATTEMPTS = 50

/** Close codes that indicate a permanent error — no reconnection. */
const NON_RECOVERABLE_CLOSE_CODES = new Set([
  4001, // AUTH_FAILED
  4003, // FORBIDDEN
  4029, // RATE_LIMITED
])

// ---------------------------------------------------------------------------
// BaseWebSocketClient
// ---------------------------------------------------------------------------

export abstract class BaseWebSocketClient {
  // ---- socket state ----
  protected ws: WebSocket | null = null
  protected reconnectAttempts = 0
  protected isIntentionalClose = false
  protected lastEventTimestamp = 0

  // ---- timers ----
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null
  protected reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

  // ---- listeners ----
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private connectionStateListeners: Set<ConnectionCallback> = new Set()
  private maxReconnectListeners: Set<MaxReconnectCallback> = new Set()

  // ---- visibility ----
  private visibilityHandler: (() => void) | null = null
  private readonly handleVisibility: boolean

  // ---------- abstract methods (subclasses MUST implement) ----------

  /** Full WebSocket URL without query string (e.g. `ws://localhost:8001/ws/admin`). */
  protected abstract getUrl(): string

  /** Query-string auth parameter (e.g. `token=xxx` or `table_token=xxx`). */
  protected abstract getAuthParam(): string | null

  // ---------- hooks (subclasses MAY override) ----------

  /**
   * Called after the socket opens.
   * @param wasReconnect `true` when this open follows a reconnection attempt.
   */
  protected onOpen(_wasReconnect: boolean): void {
    // Override for catch-up, token scheduling, etc.
  }

  /** Called when the socket closes (before reconnect scheduling). */
  protected onClose(_code: number, _reason: string): void {
    // Override for custom close handling.
  }

  /**
   * Called for every parsed, non-pong message.
   * Default behaviour: notify listeners. Override to add pre-processing.
   */
  protected onMessage(event: WSEvent): void {
    this.notifyListeners(event)
  }

  // ---------- constructor ----------

  constructor(options?: BaseWSClientOptions) {
    this.handleVisibility = options?.handleVisibility ?? false
    if (this.handleVisibility) {
      this.setupVisibilityListener()
    }
  }

  // =====================================================================
  // Public API
  // =====================================================================

  /**
   * Open (or reopen) the WebSocket connection.
   * Safe to call multiple times — a no-op if already OPEN.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const authParam = this.getAuthParam()
    if (authParam === null) return // subclass signals "can't connect yet"

    this.isIntentionalClose = false

    const url = `${this.getUrl()}?${authParam}`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      const wasReconnect = this.reconnectAttempts > 0
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.notifyConnectionState(true)
      this.onOpen(wasReconnect)
    }

    this.ws.onmessage = (raw) => {
      try {
        const data = JSON.parse(raw.data)

        // Handle heartbeat pong — never propagated to listeners.
        if (data.type === 'pong') {
          this.clearHeartbeatTimeout()
          return
        }

        // Track timestamp for catch-up after reconnect.
        this.lastEventTimestamp = Date.now() / 1000

        this.onMessage(data as WSEvent)
      } catch {
        // Non-JSON payload — ignore silently.
      }
    }

    this.ws.onclose = (ev) => {
      this.ws = null
      this.stopHeartbeat()
      this.notifyConnectionState(false)
      this.onClose(ev.code, ev.reason)

      if (!this.isIntentionalClose) {
        if (NON_RECOVERABLE_CLOSE_CODES.has(ev.code)) {
          this.notifyMaxReconnect()
          return
        }
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect handled there.
    }
  }

  /**
   * Soft disconnect — closes the socket and prevents reconnection,
   * but preserves all listeners so a subsequent `connect()` works seamlessly.
   */
  softDisconnect(): void {
    this.isIntentionalClose = true
    this.clearTimers()

    if (this.ws) {
      this.ws.close(1000, 'Soft disconnect')
      this.ws = null
    }

    this.reconnectAttempts = 0
    this.notifyConnectionState(false)
  }

  /**
   * Hard disconnect — closes the socket AND clears all listeners.
   * Use on logout or full teardown.
   */
  disconnect(): void {
    this.softDisconnect()
    this.listeners.clear()
    this.connectionStateListeners.clear()
    this.maxReconnectListeners.clear()
  }

  /**
   * Full cleanup including visibility listener.
   * Call when unloading / unmounting the app.
   */
  destroy(): void {
    this.disconnect()
    this.cleanupVisibilityListener()
  }

  // ---- subscription methods ----

  /**
   * Subscribe to a specific event type (or `'*'` for all events).
   * Returns an unsubscribe function.
   */
  on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)

    return () => {
      const set = this.listeners.get(eventType)
      set?.delete(callback)
      if (set?.size === 0) this.listeners.delete(eventType)
    }
  }

  /**
   * Explicit unsubscribe (pwaMenu pattern).
   */
  off(eventType: string, callback: EventCallback): void {
    const set = this.listeners.get(eventType)
    set?.delete(callback)
    if (set?.size === 0) this.listeners.delete(eventType)
  }

  /**
   * Subscribe to connection-state changes (connected / disconnected).
   * Returns an unsubscribe function.
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionStateListeners.add(callback)
    return () => {
      this.connectionStateListeners.delete(callback)
    }
  }

  /**
   * Subscribe to "max reconnect attempts reached" notifications.
   * Returns an unsubscribe function.
   */
  onMaxReconnect(callback: MaxReconnectCallback): () => void {
    this.maxReconnectListeners.add(callback)
    return () => {
      this.maxReconnectListeners.delete(callback)
    }
  }

  /** Whether the underlying socket is currently OPEN. */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // =====================================================================
  // Protected helpers (available to subclasses)
  // =====================================================================

  /** Dispatch an event to matching + wildcard listeners. */
  protected notifyListeners(event: WSEvent): void {
    this.listeners.get(event.type)?.forEach((cb) => cb(event))
    this.listeners.get('*')?.forEach((cb) => cb(event))
  }

  /** Notify all connection-state listeners. */
  protected notifyConnectionState(connected: boolean): void {
    this.connectionStateListeners.forEach((cb) => cb(connected))
  }

  /** Notify all max-reconnect listeners. */
  protected notifyMaxReconnect(): void {
    this.maxReconnectListeners.forEach((cb) => cb())
  }

  // ---- heartbeat ----

  protected startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendPing()
      }
    }, HEARTBEAT_INTERVAL)
  }

  protected stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    this.clearHeartbeatTimeout()
  }

  /** Send a JSON `{ type: "ping" }` and arm the heartbeat-timeout timer. */
  protected sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    try {
      this.ws.send(JSON.stringify({ type: 'ping' }))

      this.heartbeatTimeoutId = setTimeout(() => {
        this.ws?.close(4000, 'Heartbeat timeout')
      }, HEARTBEAT_TIMEOUT)
    } catch {
      // Send failed — onclose will trigger reconnect.
    }
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
  }

  // ---- reconnect ----

  protected scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.notifyMaxReconnect()
      return
    }

    this.reconnectAttempts++

    // Exponential backoff capped at MAX_RECONNECT_DELAY, plus random jitter.
    const exponentialDelay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY,
    )
    const jitter = exponentialDelay * JITTER_FACTOR * Math.random()
    const delay = Math.round(exponentialDelay + jitter)

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null
      this.connect()
    }, delay)
  }

  // ---- timers cleanup ----

  protected clearTimers(): void {
    this.stopHeartbeat()

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  // ---- visibility ----

  protected setupVisibilityListener(): void {
    if (typeof document === 'undefined') return

    this.cleanupVisibilityListener()

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        if (!this.isIntentionalClose && !this.isConnected()) {
          // Connection lost during sleep — reconnect.
          this.reconnectAttempts = 1 // ensures onOpen sees wasReconnect=true
          this.connect()
        } else if (this.isConnected()) {
          // Connection may be stale — send ping to verify.
          this.sendPing()
        }
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  protected cleanupVisibilityListener(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }
}
