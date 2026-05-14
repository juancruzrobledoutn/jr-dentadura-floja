import { BaseWebSocketClient } from '@shared/websocket-client'
import type { WSEvent as BaseWSEvent } from '@shared/websocket-client'
import { wsLogger } from '../utils/logger'
import { API_CONFIG } from '../utils/constants'
import type { WSEvent, WSEventType } from '../types'

type TokenRefreshCallback = () => Promise<string | null>

/**
 * pwaWaiter WebSocket client.
 *
 * Extends BaseWebSocketClient with:
 *  - JWT token management (connect/update/refresh)
 *  - Proactive token refresh before expiration (PWAW-A001)
 *  - Connection promise deduplication
 *  - Branch-scoped event catch-up after reconnect
 */
class WebSocketService extends BaseWebSocketClient {
  private token: string | null = null
  private tokenExp: number | null = null
  private tokenRefreshTimeout: ReturnType<typeof setTimeout> | null = null
  private tokenRefreshCallback: TokenRefreshCallback | null = null
  private connectionPromise: Promise<void> | null = null
  private branchId: number | null = null

  constructor() {
    super({ handleVisibility: true })
  }

  // ==========================================================================
  // Abstract method implementations
  // ==========================================================================

  protected getUrl(): string {
    return `${API_CONFIG.WS_URL}/ws/waiter`
  }

  protected getAuthParam(): string | null {
    if (!this.token) return null
    return `token=${this.token}`
  }

  // ==========================================================================
  // Hooks
  // ==========================================================================

  protected override onOpen(wasReconnect: boolean): void {
    wsLogger.info('WebSocket connected')
    this.scheduleTokenRefresh()

    if (wasReconnect && this.lastEventTimestamp > 0) {
      this.catchUpEvents().catch((err) => {
        wsLogger.warn('Catch-up after reconnect failed', err)
      })
    }
  }

  protected override onClose(code: number, reason: string): void {
    wsLogger.info('WebSocket closed', { code, reason })
    this.connectionPromise = null
  }

  protected override onMessage(event: BaseWSEvent): void {
    wsLogger.debug('Received event', { type: event.type })
    this.notifyListeners(event)
  }

  // ==========================================================================
  // Public API — pwaWaiter-specific
  // ==========================================================================

  /**
   * Connect with a JWT token. Deduplicates concurrent calls with the same token.
   * When called without arguments (by base class reconnect/visibility), uses the stored token.
   */
  override connect(token?: string): Promise<void> {
    // Internal calls from base class (reconnect, visibility) pass no token
    const effectiveToken = token ?? this.token
    if (!effectiveToken) return Promise.resolve()

    if (this.connectionPromise && this.token === effectiveToken) {
      return this.connectionPromise
    }

    this.token = effectiveToken
    if (token) this.parseTokenExpiration(effectiveToken)

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      wsLogger.info('Connecting to WebSocket', { url: API_CONFIG.WS_URL })

      // Listen for the first successful connection to resolve the promise
      const onOpenUnsub = this.onConnectionChange((connected) => {
        if (connected) {
          onOpenUnsub()
          resolve()
        }
      })

      try {
        super.connect()
      } catch {
        this.connectionPromise = null
        onOpenUnsub()
        reject(new Error('WebSocket connection failed'))
        return
      }
    })

    return this.connectionPromise
  }

  /**
   * PWAW-A001: Register a callback that returns a fresh JWT token.
   * Called automatically ~60s before the current token expires.
   */
  setTokenRefreshCallback(callback: TokenRefreshCallback): void {
    this.tokenRefreshCallback = callback
  }

  /**
   * Set branch ID for catch-up requests after reconnection.
   */
  setBranchId(branchId: number): void {
    this.branchId = branchId
  }

  /**
   * Update the JWT token and reconnect if currently connected.
   */
  async updateToken(newToken: string): Promise<void> {
    wsLogger.info('Updating WebSocket token')
    this.token = newToken
    this.parseTokenExpiration(newToken)

    if (this.isConnected()) {
      this.softDisconnect()
      this.connectionPromise = null

      // Wait for onclose to process before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 100))
      await this.connect(newToken)
      wsLogger.info('WebSocket reconnected with refreshed token')
    }
  }

  /**
   * Subscribe to specific event type or all events ('*').
   * Overloaded to accept pwaWaiter's WSEventType union.
   */
  on(eventType: WSEventType | '*', callback: (event: WSEvent) => void): () => void {
    return super.on(eventType, callback as (event: BaseWSEvent) => void)
  }

  /**
   * Subscribe to connection state changes.
   * Immediately notifies with the current state (pwaWaiter convention).
   */
  override onConnectionChange(callback: (connected: boolean) => void): () => void {
    const unsub = super.onConnectionChange(callback)
    callback(this.isConnected())
    return unsub
  }

  /**
   * Hard disconnect — clears all token state (for logout).
   */
  override disconnect(): void {
    this.clearTokenRefreshTimeout()
    super.disconnect()

    this.token = null
    this.tokenExp = null
    this.tokenRefreshCallback = null
    this.connectionPromise = null
    this.lastEventTimestamp = 0

    wsLogger.info('Disconnected from WebSocket')
  }

  /**
   * Full cleanup including visibility listener.
   */
  override destroy(): void {
    this.clearTokenRefreshTimeout()
    super.destroy()
    wsLogger.info('WebSocket service destroyed')
  }

  // ==========================================================================
  // Token refresh (PWAW-A001)
  // ==========================================================================

  private parseTokenExpiration(token: string): void {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        this.tokenExp = null
        return
      }
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp && typeof payload.exp === 'number' && payload.exp > 0) {
        this.tokenExp = payload.exp
        wsLogger.debug('Token expires at', { exp: new Date(payload.exp * 1000).toISOString() })
      } else {
        this.tokenExp = null
      }
    } catch {
      wsLogger.warn('Failed to parse token expiration')
      this.tokenExp = null
    }
  }

  private scheduleTokenRefresh(): void {
    this.clearTokenRefreshTimeout()
    if (!this.tokenExp || !this.tokenRefreshCallback) return

    const now = Date.now() / 1000
    const refreshIn = Math.max(0, (this.tokenExp - now - 60) * 1000)

    if (refreshIn <= 0) {
      wsLogger.warn('Token expired or expiring soon, triggering refresh')
      this.handleTokenRefresh()
      return
    }

    wsLogger.debug(`Scheduling token refresh in ${Math.round(refreshIn / 1000)}s`)
    this.tokenRefreshTimeout = setTimeout(() => this.handleTokenRefresh(), refreshIn)
  }

  private async handleTokenRefresh(): Promise<void> {
    if (!this.tokenRefreshCallback) return
    wsLogger.info('Refreshing WebSocket token')

    try {
      const newToken = await this.tokenRefreshCallback()
      if (newToken && !this.isIntentionalClose) {
        await this.updateToken(newToken)
      }
    } catch (error) {
      wsLogger.error('Token refresh failed', error)
    }
  }

  private clearTokenRefreshTimeout(): void {
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout)
      this.tokenRefreshTimeout = null
    }
  }

  // ==========================================================================
  // Event catch-up after reconnection
  // ==========================================================================

  private async catchUpEvents(): Promise<void> {
    if (!this.branchId || !this.token || this.lastEventTimestamp === 0) return

    try {
      const wsBaseUrl = API_CONFIG.WS_URL.replace('ws://', 'http://').replace('wss://', 'https://')
      const url = `${wsBaseUrl}/ws/catchup?branch_id=${this.branchId}&since=${this.lastEventTimestamp}&token=${this.token}`

      const response = await fetch(url)
      if (!response.ok) {
        wsLogger.warn('Catch-up request failed', { status: response.status })
        return
      }

      const data = await response.json()
      const events = data.events as WSEvent[]

      if (events.length > 0) {
        wsLogger.info(`Catching up ${events.length} missed events`)
        for (const event of events) {
          this.notifyListeners(event as BaseWSEvent)
        }
        this.lastEventTimestamp = Date.now() / 1000
      }
    } catch (error) {
      wsLogger.warn('Failed to catch up missed events', error)
    }
  }
}

// Singleton instance
export const wsService = new WebSocketService()
