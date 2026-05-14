/**
 * SPRINT 8: useConfirmDialog hook
 *
 * Reusable hook for managing confirmation dialog state.
 * Used for delete confirmations across all CRUD pages.
 *
 * Usage:
 * ```typescript
 * const deleteDialog = useConfirmDialog()
 *
 * // Open dialog
 * deleteDialog.open(itemToDelete)
 *
 * // In confirm handler
 * const handleConfirm = () => {
 *   deleteItem(deleteDialog.item.id)
 *   deleteDialog.close()
 * }
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseConfirmDialogReturn<T = unknown> {
  /** Is dialog currently open */
  isOpen: boolean
  /** Item to be deleted/confirmed */
  item: T | null
  /** Open dialog with item */
  open: (item: T) => void
  /** Close dialog and reset */
  close: () => void
}

/**
 * Hook for managing confirmation dialog state
 *
 * @returns Dialog state and control functions
 *
 * @example
 * ```typescript
 * const deleteDialog = useConfirmDialog<Category>()
 *
 * // Later in component
 * <ConfirmDialog
 *   isOpen={deleteDialog.isOpen}
 *   onClose={deleteDialog.close}
 *   onConfirm={() => {
 *     handleDelete(deleteDialog.item!.id)
 *     deleteDialog.close()
 *   }}
 *   title="Eliminar categoría"
 *   message={`¿Estás seguro de eliminar "${deleteDialog.item?.name}"?`}
 * />
 * ```
 */
export function useConfirmDialog<T = unknown>(): UseConfirmDialogReturn<T> {
  const [isOpen, setIsOpen] = useState(false)
  const [item, setItem] = useState<T | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const open = useCallback((itemToConfirm: T) => {
    setItem(itemToConfirm)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Reset after animation completes
    closeTimeoutRef.current = window.setTimeout(() => {
      setItem(null)
      closeTimeoutRef.current = null
    }, 200)
  }, [])

  return {
    isOpen,
    item,
    open,
    close,
  }
}
