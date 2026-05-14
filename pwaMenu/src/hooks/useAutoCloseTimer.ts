import { useEffect, useRef } from 'react'
import { ANIMATION } from '../constants/timing'

interface UseAutoCloseTimerOptions {
  /** Delay in milliseconds before auto-close (default: 2000ms) */
  delay?: number
  /** Whether the timer is enabled */
  enabled: boolean
  /** Callback to execute when timer completes */
  onClose: () => void
}

/**
 * Hook for auto-closing modals/dialogs after a delay
 *
 * Handles cleanup on unmount and uses refs to avoid stale closure issues.
 *
 * @example
 * useAutoCloseTimer({
 *   enabled: showSuccess,
 *   onClose: () => setIsOpen(false),
 *   delay: 2000,
 * })
 */
export function useAutoCloseTimer({
  delay = ANIMATION.AUTO_CLOSE_MS,
  enabled,
  onClose,
}: UseAutoCloseTimerOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const onCloseRef = useRef(onClose)

  // Keep onClose ref updated to avoid stale closure
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Handle auto-close timer
  useEffect(() => {
    if (!enabled) {
      return
    }

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        onCloseRef.current()
      }
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, delay])
}
