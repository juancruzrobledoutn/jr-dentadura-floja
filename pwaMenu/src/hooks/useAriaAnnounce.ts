import { useEffect, useRef } from 'react'

/**
 * Hook for announcing messages to screen readers via ARIA live region
 * Creates a visually hidden live region that announces messages
 *
 * @param message - The message to announce (cleared after announcement)
 * @param politeness - 'polite' (default) waits for user to finish, 'assertive' interrupts
 */
export const useAriaAnnounce = (
  message: string,
  politeness: 'polite' | 'assertive' = 'polite'
) => {
  const liveRegionRef = useRef<HTMLDivElement | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // MEMORY LEAK FIX: Create live region ONLY once on mount
  useEffect(() => {
    // Create region once
    const region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', politeness)
    region.setAttribute('aria-atomic', 'true')
    region.className = 'sr-only' // Visually hidden but accessible to screen readers
    document.body.appendChild(region)
    liveRegionRef.current = region

    // Cleanup guaranteed on unmount
    return () => {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // Remove DOM node
      if (liveRegionRef.current && document.body.contains(liveRegionRef.current)) {
        document.body.removeChild(liveRegionRef.current)
        liveRegionRef.current = null
      }
    }
  }, [politeness]) // Only recreate if politeness changes

  // MEMORY LEAK FIX: Separate effect for message updates
  useEffect(() => {
    if (message && liveRegionRef.current) {
      liveRegionRef.current.textContent = message

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Clear message after announcement to allow re-announcement of same message
      timeoutRef.current = setTimeout(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = ''
        }
        timeoutRef.current = null
      }, 1000)
    }
  }, [message])
}
