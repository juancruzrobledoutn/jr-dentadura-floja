/**
 * SPRINT 8: useFormModal hook
 *
 * Reusable hook for managing modal state with form data.
 * Eliminates duplicate modal + form state management across 16 CRUD pages.
 *
 * Usage:
 * ```typescript
 * const modal = useFormModal(initialFormData)
 *
 * // Open for create
 * modal.openCreate()
 *
 * // Open for edit
 * modal.openEdit(existingItem)
 *
 * // Close and reset
 * modal.close()
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseFormModalReturn<T, S = T> {
  /** Is modal currently open */
  isOpen: boolean
  /** Current form data */
  formData: T
  /** Selected item being edited (null for create) */
  selectedItem: S | null
  /** Update form data */
  setFormData: React.Dispatch<React.SetStateAction<T>>
  /** Open modal for creating new item, optionally with custom initial data */
  openCreate: (customInitialData?: Partial<T>) => void
  /** Open modal for editing existing item, optionally with custom form data */
  openEdit: (item: S, customFormData?: T) => void
  /** Close modal and reset state */
  close: () => void
  /** Reset form to initial data */
  reset: () => void
}

/**
 * Hook for managing modal state with form data
 *
 * @param initialFormData - Initial/default form data
 * @returns Modal state and control functions
 *
 * @example
 * ```typescript
 * const categoryModal = useFormModal<CategoryFormData>({
 *   name: ''
 * })
 *
 * // Later in component
 * <Modal
 *   isOpen={categoryModal.isOpen}
 *   onClose={categoryModal.close}
 * >
 *   <Input
 *     value={categoryModal.formData.name}
 *     onChange={(e) => categoryModal.setFormData({
 *       ...categoryModal.formData,
 *       name: e.target.value
 *     })}
 *   />
 * </Modal>
 * ```
 */
export function useFormModal<T, S = T>(initialFormData: T): UseFormModalReturn<T, S> {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<T>(initialFormData)
  const [selectedItem, setSelectedItem] = useState<S | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const openCreate = useCallback((customInitialData?: Partial<T>) => {
    if (customInitialData) {
      setFormData({ ...initialFormData, ...customInitialData })
    } else {
      setFormData(initialFormData)
    }
    setSelectedItem(null)
    setIsOpen(true)
  }, [initialFormData])

  const openEdit = useCallback((item: S, customFormData?: T) => {
    if (customFormData) {
      setFormData(customFormData)
    } else {
      setFormData(item as unknown as T)
    }
    setSelectedItem(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Reset after animation completes
    closeTimeoutRef.current = window.setTimeout(() => {
      setFormData(initialFormData)
      setSelectedItem(null)
      closeTimeoutRef.current = null
    }, 200)
  }, [initialFormData])

  const reset = useCallback(() => {
    setFormData(initialFormData)
  }, [initialFormData])

  return {
    isOpen,
    formData,
    selectedItem,
    setFormData,
    openCreate,
    openEdit,
    close,
    reset,
  }
}
