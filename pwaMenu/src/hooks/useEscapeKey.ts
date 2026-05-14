import { useEffect, useRef } from 'react'

interface UseEscapeKeyOptions {
  /** Whether the escape key handler is active */
  enabled: boolean
  /** Callback to execute when Escape is pressed */
  onEscape: () => void
  /** Optional: prevent handler when a condition is true (e.g., isPending) */
  disabled?: boolean
}

/**
 * Hook for handling Escape key presses
 *
 * Uses refs to avoid re-registering the event listener when callback changes.
 *
 * @example
 * useEscapeKey({
 *   enabled: isOpen,
 *   onEscape: handleClose,
 *   disabled: isPending,
 * })
 */
export function useEscapeKey({
  enabled,
  onEscape,
  disabled = false,
}: UseEscapeKeyOptions): void {
  const onEscapeRef = useRef(onEscape)

  // Keep callback ref updated to avoid stale closure
  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabled) {
        onEscapeRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, disabled])
}
