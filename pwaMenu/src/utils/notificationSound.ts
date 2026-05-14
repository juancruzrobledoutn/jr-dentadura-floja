/**
 * L002 FIX: Notification sound utility
 * Plays audio cues for important WebSocket events
 */

import { notificationLogger } from './logger'

// Audio context for playing sounds
let audioContext: AudioContext | null = null

/**
 * Initialize audio context (must be called after user interaction)
 */
function getAudioContext(): AudioContext | null {
  if (!audioContext && typeof window !== 'undefined' && window.AudioContext) {
    try {
      audioContext = new AudioContext()
    } catch (err) {
      notificationLogger.error('Failed to create AudioContext', err)
    }
  }
  return audioContext
}

/**
 * Play a simple beep sound using Web Audio API
 * @param frequency - Frequency in Hz (default 800)
 * @param duration - Duration in ms (default 150)
 * @param volume - Volume 0-1 (default 0.3)
 */
export function playBeep(frequency = 800, duration = 150, volume = 0.3): void {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)

    notificationLogger.debug('Played beep', { frequency, duration })
  } catch (err) {
    notificationLogger.error('Failed to play beep', err)
  }
}

/**
 * Play a success sound (two ascending beeps)
 */
export function playSuccessSound(): void {
  playBeep(600, 100, 0.25)
  setTimeout(() => playBeep(900, 150, 0.25), 120)
}

/**
 * Play an alert sound (attention-grabbing)
 */
export function playAlertSound(): void {
  playBeep(1000, 100, 0.3)
  setTimeout(() => playBeep(1200, 100, 0.3), 120)
  setTimeout(() => playBeep(1000, 100, 0.3), 240)
}

/**
 * Play a soft notification sound
 */
export function playNotificationSound(): void {
  playBeep(700, 120, 0.2)
}

/**
 * Play sound based on event type
 */
export type NotificationEventType =
  | 'order_ready'
  | 'order_confirmed'
  | 'waiter_coming'
  | 'payment_success'
  | 'call_created'

export function playEventSound(eventType: NotificationEventType): void {
  switch (eventType) {
    case 'order_ready':
      // Order is ready - attention!
      playAlertSound()
      break
    case 'order_confirmed':
      // Order confirmed by kitchen
      playNotificationSound()
      break
    case 'waiter_coming':
      // Waiter acknowledged
      playSuccessSound()
      break
    case 'payment_success':
      // Payment completed
      playSuccessSound()
      break
    case 'call_created':
      // Call was sent
      playNotificationSound()
      break
    default:
      playNotificationSound()
  }
}

/**
 * Check if notifications are enabled in user preferences
 */
export function areSoundsEnabled(): boolean {
  try {
    const stored = localStorage.getItem('pwamenu-sound-enabled')
    // Default to enabled
    return stored !== 'false'
  } catch {
    return true
  }
}

/**
 * Enable or disable notification sounds
 */
export function setSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('pwamenu-sound-enabled', enabled ? 'true' : 'false')
  } catch {
    // Ignore storage errors
  }
}

/**
 * Play sound only if enabled in preferences
 */
export function playEventSoundIfEnabled(eventType: NotificationEventType): void {
  if (areSoundsEnabled()) {
    playEventSound(eventType)
  }
}
