/**
 * Device ID Utility
 *
 * FASE 1: Fidelización - Device tracking for cross-session recognition.
 *
 * Generates and persists a unique device identifier for customer recognition
 * across sessions without requiring explicit registration.
 *
 * Privacy considerations:
 * - Device ID is stored in localStorage (persists across sessions)
 * - Fingerprint is a hash of browser characteristics (not PII)
 * - User can clear localStorage to reset their device identity
 * - Data is only shared with the restaurant's backend, not third parties
 */

const DEVICE_ID_KEY = 'pwaMenu_device_id'
const DEVICE_FINGERPRINT_KEY = 'pwaMenu_device_fingerprint'

/**
 * Generate a UUID v4 for device identification.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a simple fingerprint hash from browser characteristics.
 * This is NOT cryptographically secure or unique - just a probabilistic identifier.
 *
 * Characteristics used:
 * - User agent
 * - Screen resolution
 * - Timezone offset
 * - Language
 * - Color depth
 * - Device memory (if available)
 * - Hardware concurrency (if available)
 * - Platform
 */
async function generateFingerprint(): Promise<string> {
  const components: string[] = []

  // User agent
  components.push(navigator.userAgent)

  // Screen info
  components.push(`${screen.width}x${screen.height}`)
  components.push(`${screen.colorDepth}`)

  // Timezone
  components.push(`${new Date().getTimezoneOffset()}`)

  // Language
  components.push(navigator.language)

  // Platform
  components.push(navigator.platform)

  // Device memory (Chrome only)
  if ('deviceMemory' in navigator) {
    components.push(`${(navigator as { deviceMemory?: number }).deviceMemory}`)
  }

  // Hardware concurrency
  if (navigator.hardwareConcurrency) {
    components.push(`${navigator.hardwareConcurrency}`)
  }

  // Max touch points
  components.push(`${navigator.maxTouchPoints}`)

  // Join and hash
  const fingerprint = components.join('|')

  // Simple hash using SubtleCrypto if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(fingerprint)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback: simple hash function
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Get the persistent device ID, creating one if it doesn't exist.
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

/**
 * Get the device fingerprint, generating one if needed.
 * Returns a cached value if available to avoid async on every call.
 */
export function getDeviceFingerprint(): string | null {
  return localStorage.getItem(DEVICE_FINGERPRINT_KEY)
}

/**
 * Initialize device fingerprint asynchronously.
 * Should be called once on app start.
 */
export async function initDeviceFingerprint(): Promise<string> {
  let fingerprint = localStorage.getItem(DEVICE_FINGERPRINT_KEY)
  if (!fingerprint) {
    fingerprint = await generateFingerprint()
    localStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint)
  }
  return fingerprint
}

/**
 * Get both device ID and fingerprint.
 * Fingerprint may be null if not yet initialized.
 */
export function getDeviceInfo(): { deviceId: string; deviceFingerprint: string | null } {
  return {
    deviceId: getDeviceId(),
    deviceFingerprint: getDeviceFingerprint(),
  }
}

/**
 * Clear device identity (for privacy/testing purposes).
 */
export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_ID_KEY)
  localStorage.removeItem(DEVICE_FINGERPRINT_KEY)
}

/**
 * Check if this is a returning device (has existing device ID).
 */
export function isReturningDevice(): boolean {
  return localStorage.getItem(DEVICE_ID_KEY) !== null
}
