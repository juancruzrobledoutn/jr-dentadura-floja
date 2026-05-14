/**
 * DEF-HIGH-02 FIX: Hook to set up throttle notification callback
 * Shows a brief toast when user actions are throttled
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { setThrottleNotifyCallback } from '../stores/tableStore/helpers'

interface ThrottleNotificationState {
  message: string | null
  visible: boolean
}

export function useThrottleNotification() {
  const [state, setState] = useState<ThrottleNotificationState>({
    message: null,
    visible: false
  })

  // HIGH-29-13 FIX: Track timeout ID to enable cleanup on unmount
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // HIGH-29-13 FIX: Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  const showNotification = useCallback((message: string) => {
    // HIGH-29-13 FIX: Clear any existing timeout before setting a new one
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }

    setState({ message, visible: true })

    // Auto-hide after 1.5 seconds
    timeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }))
      timeoutRef.current = null
    }, 1500)
  }, [])

  useEffect(() => {
    // Register the callback
    setThrottleNotifyCallback(showNotification)

    // Cleanup on unmount
    return () => {
      setThrottleNotifyCallback(null)
    }
  }, [showNotification])

  return state
}
