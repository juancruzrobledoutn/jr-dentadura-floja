import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Hook for debouncing values
 * Useful to avoid excessive calls in search inputs
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  // RACE CONDITION FIX: Initialize as true immediately, not in useEffect
  const isMountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // RACE CONDITION FIX: Separate cleanup effect
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      // RACE CONDITION FIX: Check mount state before setState
      if (isMountedRef.current) {
        setDebouncedValue(value)
      }
      timerRef.current = null
    }, delay)

    // No cleanup here - handled by the mount/unmount effect
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook to create a debounced function
 * Uses useRef to avoid recreating the function on each render
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number = 300
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  const isMountedRef = useRef(true)

  // Sync ref with callback in useEffect (avoids updating ref during render)
  useEffect(() => {
    callbackRef.current = callback
  })

  // Clear timeout on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      // CRITICAL: Clear timer BEFORE marking as unmounted
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      isMountedRef.current = false
    }
  }, [])

  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      // Only execute if component is still mounted
      if (isMountedRef.current) {
        callbackRef.current(...args)
      }
    }, delay)
  }, [delay]) as T

  return debouncedCallback
}
