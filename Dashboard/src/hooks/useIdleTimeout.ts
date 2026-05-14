import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'

// Idle thresholds in milliseconds
const WARNING_TIMEOUT_MS = 25 * 60 * 1000 // 25 minutes
const LOGOUT_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes

// Pages exempt from idle timeout (always-on displays)
const EXEMPT_PATHS = ['/kitchen']

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
]

interface UseIdleTimeoutOptions {
  onWarning: () => void
  onTimeout: () => void
}

/**
 * Tracks user activity and triggers callbacks on idle timeout.
 *
 * - After 25 min of inactivity: calls onWarning
 * - After 30 min of inactivity: calls onTimeout (auto-logout)
 * - Resets timer on any user interaction
 * - Disabled on exempt pages (e.g. Kitchen always-on display)
 */
export function useIdleTimeout({ onWarning, onTimeout }: UseIdleTimeoutOptions) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasWarnedRef = useRef(false)

  const isExempt = EXEMPT_PATHS.some((path) => location.pathname.startsWith(path))

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
  }, [])

  const resetTimers = useCallback(() => {
    clearTimers()
    hasWarnedRef.current = false

    warningTimerRef.current = setTimeout(() => {
      hasWarnedRef.current = true
      logger.info('IdleTimeout', 'User idle for 25 minutes, showing warning')
      onWarning()
    }, WARNING_TIMEOUT_MS)

    logoutTimerRef.current = setTimeout(() => {
      logger.info('IdleTimeout', 'User idle for 30 minutes, auto-logout')
      onTimeout()
    }, LOGOUT_TIMEOUT_MS)
  }, [clearTimers, onWarning, onTimeout])

  useEffect(() => {
    if (!isAuthenticated || isExempt) {
      clearTimers()
      return
    }

    resetTimers()

    const handleActivity = () => {
      resetTimers()
    }

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true })
    }

    return () => {
      clearTimers()
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity)
      }
    }
  }, [isAuthenticated, isExempt, resetTimers, clearTimers])
}
