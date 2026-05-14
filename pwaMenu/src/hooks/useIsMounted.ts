import { useRef, useEffect, useCallback } from 'react'

/**
 * Hook to check if a component is mounted.
 * Useful for preventing state updates after unmount in async operations.
 *
 * @returns Function that returns true if component is mounted
 *
 * @example
 * const isMounted = useIsMounted()
 *
 * const handleAsync = async () => {
 *   const result = await fetchData()
 *   if (!isMounted()) return  // Guard against unmount
 *   setState(result)
 * }
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return useCallback(() => isMountedRef.current, [])
}
