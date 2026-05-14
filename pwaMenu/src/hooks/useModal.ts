import { useState, useCallback, useRef, useEffect } from 'react'
import { useIsMounted } from './useIsMounted'

export interface UseModalReturn<T = void> {
  isOpen: boolean
  data: T | null
  open: (payload?: T) => void
  close: () => void
  toggle: () => void
}

/**
 * Hook to manage modal state with optional data.
 *
 * @param initialOpen - Initial modal state (default: false)
 * @returns State and functions to control the modal
 *
 * @example
 * // Simple modal without data
 * const confirmModal = useModal()
 * <button onClick={confirmModal.open}>Open</button>
 * <ConfirmDialog isOpen={confirmModal.isOpen} onClose={confirmModal.close} />
 *
 * @example
 * // Modal with typed data
 * const productModal = useModal<Product>()
 * <button onClick={() => productModal.open(product)}>View product</button>
 * <ProductDetailModal
 *   product={productModal.data}
 *   isOpen={productModal.isOpen}
 *   onClose={productModal.close}
 * />
 */
// Constant for close animation delay
const CLOSE_ANIMATION_DELAY_MS = 300

export function useModal<T = void>(initialOpen = false): UseModalReturn<T> {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [data, setData] = useState<T | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useIsMounted()

  // MEMORY LEAK FIX: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
    }
  }, [])

  const open = useCallback((payload?: T) => {
    // Cancel any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setData((payload ?? null) as T | null)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Clear previous timeout if exists
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    // Clear data after close animation
    closeTimeoutRef.current = setTimeout(() => {
      // MEMORY LEAK FIX: Check if component is still mounted
      if (!isMounted()) return
      setData(null)
      closeTimeoutRef.current = null
    }, CLOSE_ANIMATION_DELAY_MS)
  }, [isMounted])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return { isOpen, data, open, close, toggle }
}
