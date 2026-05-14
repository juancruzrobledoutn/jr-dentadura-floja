/**
 * Helper functions for tableStore
 * Extracted to reduce store file size and improve testability
 */

import { DINER_COLORS, SESSION_CONFIG } from '../../constants'
import type { CartItem, Diner, OrderRecord, PaymentShare, SplitMethod } from '../../types'

// Session expiry time in milliseconds (8 hours = one restaurant shift)
const SESSION_EXPIRY_MS = Number(import.meta.env.VITE_SESSION_EXPIRY_HOURS || SESSION_CONFIG.DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000

// Threshold for stale data warning (2 hours)
const STALE_DATA_THRESHOLD_MS = 2 * 60 * 60 * 1000

/**
 * Check if a session has expired
 * SESSION TTL FIX: Check against last_activity instead of created_at
 * This allows sessions to continue as long as the user remains active
 */
export const isSessionExpired = (createdAt: string, lastActivity?: string): boolean => {
  const created = new Date(createdAt).getTime()
  const activity = lastActivity ? new Date(lastActivity).getTime() : created
  const now = Date.now()

  // Session expires after SESSION_EXPIRY_MS of inactivity (not from creation)
  return now - activity > SESSION_EXPIRY_MS
}

/**
 * Check if session data might be stale (not expired, but old enough to warn)
 */
export const isSessionStale = (createdAt: string): boolean => {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const age = now - created
  return age > STALE_DATA_THRESHOLD_MS && age < SESSION_EXPIRY_MS
}

/**
 * Validate price for cart operations
 */
export const isValidPrice = (price: unknown): price is number => {
  return typeof price === 'number' && price > 0 && isFinite(price) && !isNaN(price)
}

/**
 * Validate quantity for cart operations
 */
export const isValidQuantity = (qty: unknown): qty is number => {
  return typeof qty === 'number' && Number.isInteger(qty) && qty > 0 && qty <= 99
}

/**
 * Generate a unique ID using cryptographically secure random values
 */
export const generateId = (): string => {
  return crypto.randomUUID()
}

/**
 * Generate a random name for the diner
 */
export const generateDinerName = (index: number): string => {
  return `Diner ${index + 1}`
}

/**
 * Get a color based on index
 */
export const getColorForIndex = (index: number): string => {
  return DINER_COLORS[index % DINER_COLORS.length]
}

/**
 * Calculate total from cart items
 */
export const calculateCartTotal = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

/**
 * Calculate total for a specific diner
 */
export const calculateDinerTotal = (items: CartItem[], dinerId: string): number => {
  return items
    .filter(item => item.dinerId === dinerId)
    .reduce((sum, item) => sum + item.price * item.quantity, 0)
}

/**
 * Calculate total consumed across all orders
 */
export const calculateTotalConsumed = (orders: OrderRecord[]): number => {
  return orders.reduce((sum, order) => sum + order.subtotal, 0)
}

/**
 * Calculate total consumed by a specific diner across all orders
 */
export const calculateTotalByDiner = (orders: OrderRecord[], dinerId: string): number => {
  return orders.reduce((sum, order) => {
    const items = order.items || []
    const dinerItems = items.filter(item => item.dinerId === dinerId)
    return sum + dinerItems.reduce((s, item) => s + item.price * item.quantity, 0)
  }, 0)
}

/**
 * Calculate payment shares based on split method
 * PWAM-009: Added tipPercentage parameter for proportional tip distribution
 */
export const calculatePaymentShares = (
  diners: Diner[],
  orders: OrderRecord[],
  method: SplitMethod,
  tipPercentage: number = 0
): PaymentShare[] => {
  if (diners.length === 0) return []

  const totalConsumed = calculateTotalConsumed(orders)
  const tipTotal = totalConsumed * (tipPercentage / 100)

  if (method === 'equal') {
    // Equal split: divide both consumption and tip equally
    const shareAmount = (totalConsumed + tipTotal) / diners.length
    return diners.map(diner => ({
      dinerId: diner.id,
      dinerName: diner.name,
      amount: Math.round(shareAmount * 100) / 100,
      paid: false,
    }))
  }

  if (method === 'byConsumption') {
    // By consumption: tip is proportional to each diner's consumption
    return diners.map(diner => {
      const dinerTotal = calculateTotalByDiner(orders, diner.id)
      // Calculate proportional tip based on consumption ratio
      const consumptionRatio = totalConsumed > 0 ? dinerTotal / totalConsumed : 0
      const dinerTip = tipTotal * consumptionRatio
      const totalWithTip = dinerTotal + dinerTip
      return {
        dinerId: diner.id,
        dinerName: diner.name,
        amount: Math.round(totalWithTip * 100) / 100,
        paid: false,
      }
    })
  }

  // 'custom' - returns 0 values for user to adjust
  return diners.map(diner => ({
    dinerId: diner.id,
    dinerName: diner.name,
    amount: 0,
    paid: false,
  }))
}

/**
 * Get session age in hours (for stale data warning)
 */
export const getSessionAgeHours = (createdAt: string): number => {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000))
}

/**
 * Simple throttle map to track last execution times by key
 * Used to prevent rapid successive calls to the same action
 *
 * Includes automatic cleanup to prevent memory leaks from accumulated keys
 */
const throttleMap = new Map<string, number>()

// Cleanup configuration
const THROTTLE_CLEANUP_INTERVAL_MS = 60 * 1000 // Run cleanup every minute
const THROTTLE_MAX_AGE_MS = 30 * 1000 // Remove entries older than 30 seconds
const MAX_THROTTLE_MAP_SIZE = 1000 // MEMORY LEAK FIX: Prevent unbounded growth
let lastCleanupTime = Date.now()

/**
 * Clean up old entries from throttleMap to prevent memory leaks
 * Called automatically during shouldExecute
 */
function cleanupThrottleMap(): void {
  const now = Date.now()

  // MEMORY LEAK FIX: If map exceeds max size, clear everything
  if (throttleMap.size > MAX_THROTTLE_MAP_SIZE) {
    throttleMap.clear()
    lastCleanupTime = now
    return
  }

  // Only cleanup periodically to avoid performance impact
  if (now - lastCleanupTime < THROTTLE_CLEANUP_INTERVAL_MS) {
    return
  }

  lastCleanupTime = now

  // Remove entries older than max age
  for (const [key, timestamp] of throttleMap.entries()) {
    if (now - timestamp > THROTTLE_MAX_AGE_MS) {
      throttleMap.delete(key)
    }
  }
}

/**
 * DEF-HIGH-02 FIX: Throttle result with feedback capability
 */
export interface ThrottleResult {
  allowed: boolean
  remainingMs: number
}

/**
 * DEF-HIGH-02 FIX: Callback for throttle notifications
 */
let throttleNotifyCallback: ((message: string) => void) | null = null

/**
 * DEF-HIGH-02 FIX: Set callback to notify user when action is throttled
 */
export function setThrottleNotifyCallback(callback: ((message: string) => void) | null): void {
  throttleNotifyCallback = callback
}

/**
 * Check if an action should be throttled
 * @param key - Unique key for the action
 * @param delayMs - Minimum time between executions in milliseconds
 * @returns true if action should proceed, false if throttled
 */
export function shouldExecute(key: string, delayMs: number = 100): boolean {
  const now = Date.now()

  // Periodic cleanup to prevent memory leaks
  cleanupThrottleMap()

  const lastCall = throttleMap.get(key) || 0
  const timeSinceLastCall = now - lastCall

  if (timeSinceLastCall < delayMs) {
    // DEF-HIGH-02 FIX: Notify user that action was throttled
    if (throttleNotifyCallback) {
      throttleNotifyCallback('Demasiado rápido, espera un momento')
    }
    return false
  }

  throttleMap.set(key, now)
  return true
}

/**
 * DEF-HIGH-02 FIX: Check throttle status without side effects
 */
export function getThrottleStatus(key: string, delayMs: number = 100): ThrottleResult {
  const now = Date.now()
  const lastCall = throttleMap.get(key) || 0
  const timeSinceLastCall = now - lastCall
  const remainingMs = Math.max(0, delayMs - timeSinceLastCall)

  return {
    allowed: timeSinceLastCall >= delayMs,
    remainingMs
  }
}

/**
 * Clear throttle map (useful for testing or session reset)
 */
export function clearThrottleMap(): void {
  throttleMap.clear()
}

/**
 * Retry configuration for async operations
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
}

/**
 * Execute an async function with exponential backoff retry
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the async function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break
      }

      // IMPROVEMENT: Exponential backoff with proportional jitter
      // Use "Full Jitter" strategy: random value between 0 and calculated backoff
      // This provides better distribution and prevents thundering herd
      const backoff = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const delay = Math.random() * backoff

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// =============================================================================
// PERF-LRU-01: Order memory management
// =============================================================================

/**
 * PERF-LRU-01: Maximum orders to keep in memory to prevent unbounded growth
 * Keeps the most recent orders (higher round numbers)
 */
export const MAX_ORDERS_IN_MEMORY = 50

/**
 * PERF-LRU-01: Limit orders array to prevent memory growth in long sessions
 * Keeps the most recent orders based on round number
 *
 * @param orders - Array of orders to limit
 * @returns Limited array with at most MAX_ORDERS_IN_MEMORY orders
 */
export function limitOrders(orders: OrderRecord[]): OrderRecord[] {
  if (orders.length <= MAX_ORDERS_IN_MEMORY) {
    return orders
  }
  // Sort by round number descending and keep the most recent
  const sorted = [...orders].sort((a, b) => b.roundNumber - a.roundNumber)
  return sorted.slice(0, MAX_ORDERS_IN_MEMORY)
}
