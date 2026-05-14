/**
 * WebSocket service for diner real-time updates
 * Extends BaseWebSocketClient from shared module.
 *
 * Handles: table token auth, connection state tracking,
 * session-scoped catch-up after reconnection.
 */

import {
  BaseWebSocketClient,
  type WSEvent as BaseWSEvent,
  type EventCallback as BaseEventCallback,
} from '../../../shared/websocket-client'
import type { WSEvent, WSEventType } from '../types/backend'
import { getTableToken } from './api'
import { wsLogger } from '../utils/logger'

type EventCallback = (event: WSEvent) => void

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

class DinerWebSocket extends BaseWebSocketClient {
  private connectionState: ConnectionState = 'disconnected'
  private lastPongReceived: number = 0

  constructor() {
    super({ handleVisibility: true })
  }

  // ---------- abstract implementations ----------

  protected getUrl(): string {
    return `${WS_BASE}/ws/diner`
  }

  protected getAuthParam(): string | null {
    const token = getTableToken()
    if (!token) {
      wsLogger.warn(' No table token available, cannot connect')
      return null
    }
    return `table_token=${encodeURIComponent(token)}`
  }

  // ---------- hooks ----------

  protected onOpen(wasReconnect: boolean): void {
    wsLogger.info(' Connected to diner WebSocket')
    this.setConnectionState('connected')

    // Catch up missed events after reconnection
    if (wasReconnect && this.lastEventTimestamp > 0) {
      this.catchUpEvents().catch((err) => {
        wsLogger.warn('Catch-up after reconnect failed', err)
      })
    }
  }

  protected onClose(code: number, reason: string): void {
    wsLogger.info(` Connection closed: ${code} ${reason || ''}`)

    if (!this.isIntentionalClose) {
      this.setConnectionState('reconnecting')
    } else {
      this.setConnectionState('closed')
    }
  }

  // Note: onMessage is NOT overridden — the base class default (notifyListeners) is correct.
  // Pong messages are handled by the base class before reaching onMessage.

  // ---------- connection state ----------

  private setConnectionState(newState: ConnectionState): void {
    const oldState = this.connectionState
    if (oldState !== newState) {
      this.connectionState = newState
      wsLogger.debug(`Connection state: ${oldState} -> ${newState}`)
    }
  }

  // ---------- public API extensions ----------

  /**
   * Override connect to track connecting state and re-register visibility listener.
   */
  connect(): void {
    this.setConnectionState('connecting')
    super.connect()
  }

  /**
   * Override disconnect to clear state and reset timestamp.
   */
  disconnect(): void {
    super.disconnect()
    this.lastEventTimestamp = 0
    this.setConnectionState('disconnected')
    wsLogger.info(' Disconnected')
  }

  /**
   * Override destroy for logging.
   */
  destroy(): void {
    super.destroy()
    wsLogger.info(' WebSocket service destroyed')
  }

  /**
   * Subscribe to a specific event type (or '*' for all events).
   * Narrows the base class signature to pwaMenu's WSEventType.
   */
  // @ts-expect-error — Narrowing string to WSEventType is safe (string literals ⊂ string)
  on(eventType: WSEventType | '*', callback: EventCallback): () => void {
    return super.on(eventType, callback as unknown as BaseEventCallback)
  }

  /**
   * Unsubscribe from an event type.
   */
  // @ts-expect-error — Narrowing string to WSEventType is safe
  off(eventType: WSEventType | '*', callback: EventCallback): void {
    super.off(eventType, callback as unknown as BaseEventCallback)
  }

  /**
   * Get the time since last pong (for debugging).
   * Returns -1 if no pong has been received yet.
   */
  getLastPongAge(): number {
    if (this.lastPongReceived === 0) return -1
    return Date.now() - this.lastPongReceived
  }

  /**
   * Get current connection state (for debugging).
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  // ---------- catch-up ----------

  /**
   * Fetch missed events from the session catch-up REST endpoint.
   * Uses table token authentication (not JWT).
   */
  private async catchUpEvents(): Promise<void> {
    const token = getTableToken()
    if (!token || this.lastEventTimestamp === 0) return

    try {
      const wsBaseUrl = WS_BASE.replace('ws://', 'http://').replace('wss://', 'https://')

      // Extract session_id from token (JWT or legacy HMAC format)
      let sessionId: number | null = null
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          sessionId = payload.session_id ?? null
        }
      } catch {
        // Legacy HMAC format: tenant_id:branch_id:table_id:session_id:expires_at:signature
        const parts = token.split(':')
        if (parts.length === 6) {
          sessionId = parseInt(parts[3], 10) || null
        }
      }

      if (!sessionId) {
        wsLogger.warn('Could not extract session_id from table token for catch-up')
        return
      }

      const url = `${wsBaseUrl}/ws/catchup/session?session_id=${sessionId}&since=${this.lastEventTimestamp}&table_token=${encodeURIComponent(token)}`

      const response = await fetch(url)
      if (!response.ok) {
        wsLogger.warn(`Catch-up request failed with status ${response.status}`)
        return
      }

      const data = await response.json()
      const events = data.events as WSEvent[]

      if (events.length > 0) {
        wsLogger.info(`Catching up ${events.length} missed events`)
        for (const event of events) {
          this.notifyListeners(event as unknown as BaseWSEvent)
        }
        this.lastEventTimestamp = Date.now() / 1000
      }
    } catch (error) {
      wsLogger.warn('Failed to catch up missed events', error)
    }
  }
}

// Singleton instance
export const dinerWS = new DinerWebSocket()

// Convenience hook for React components
export function useDinerWebSocket() {
  return dinerWS
}
