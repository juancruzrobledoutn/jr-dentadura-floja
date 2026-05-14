import { useState, useEffect, useRef } from 'react'

interface UseOnlineStatusReturn {
  isOnline: boolean
  wasOffline: boolean
}

export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [wasOffline, setWasOffline] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    const clearTimeoutSafe = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const handleOnline = () => {
      // Only update state if component is mounted
      if (!isMountedRef.current) return

      setIsOnline(true)
      setWasOffline(true)
      // Clear state after 3 seconds
      clearTimeoutSafe()
      timeoutRef.current = setTimeout(() => {
        // Check again before updating state
        if (isMountedRef.current) {
          setWasOffline(false)
        }
      }, 3000)
    }

    const handleOffline = () => {
      if (!isMountedRef.current) return
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      isMountedRef.current = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeoutSafe()
    }
  }, []) // No dependencies - only register listeners once

  return { isOnline, wasOffline }
}
