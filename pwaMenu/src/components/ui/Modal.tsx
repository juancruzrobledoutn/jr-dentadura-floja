import { useEffect, useRef, useCallback, type ReactNode } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdrop?: boolean
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean
  /** Whether to show the backdrop */
  showBackdrop?: boolean
  /** Additional class for the modal container */
  className?: string
  /** Alignment on mobile: 'bottom' slides from bottom, 'center' centers */
  mobileAlign?: 'bottom' | 'center'
  /** Accessibility label ID for the dialog */
  ariaLabelledBy?: string
  /** Whether to prevent closing (e.g., while processing) */
  preventClose?: boolean
}

// MENU-COMP-HIGH-01 FIX: Focusable element selectors for focus trap
const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Reusable Modal component with accessibility features.
 * Handles backdrop clicks, escape key, and focus trapping.
 */
export function Modal({
  isOpen,
  onClose,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showBackdrop = true,
  className = '',
  mobileAlign = 'center',
  ariaLabelledBy,
  preventClose = false,
}: ModalProps) {
  const onCloseRef = useRef(onClose)
  const preventCloseRef = useRef(preventClose)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // Keep refs updated
  useEffect(() => {
    onCloseRef.current = onClose
    preventCloseRef.current = preventClose
  }, [onClose, preventClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventCloseRef.current) {
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeOnEscape])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  // MENU-COMP-HIGH-01 FIX: Focus trap implementation
  useEffect(() => {
    if (!isOpen) return

    // Store the previously focused element to restore on close
    previousActiveElementRef.current = document.activeElement as HTMLElement

    // Focus the first focusable element in the modal after a short delay
    // to ensure the modal is rendered
    const focusTimeout = setTimeout(() => {
      const modal = modalRef.current
      if (!modal) return

      const focusableElements = modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      } else {
        // If no focusable element, focus the modal container itself
        modal.focus()
      }
    }, 0)

    return () => {
      clearTimeout(focusTimeout)
      // Restore focus to the previously focused element
      if (previousActiveElementRef.current && previousActiveElementRef.current.focus) {
        previousActiveElementRef.current.focus()
      }
    }
  }, [isOpen])

  // MENU-COMP-HIGH-01 FIX: Handle Tab key for focus trap
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const modal = modalRef.current
      if (!modal) return

      const focusableElements = modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // Shift+Tab on first element -> go to last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
      // Tab on last element -> go to first
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdrop && !preventCloseRef.current) {
      onCloseRef.current()
    }
  }, [closeOnBackdrop])

  if (!isOpen) return null

  const alignmentClasses =
    mobileAlign === 'bottom'
      ? 'items-end sm:items-center'
      : 'items-center'

  return (
    <div
      ref={modalRef}
      className={`fixed inset-0 z-50 flex justify-center ${alignmentClasses}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      tabIndex={-1}
    >
      {/* Backdrop */}
      {showBackdrop && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Modal content */}
      <div className={`relative ${className}`}>
        {children}
      </div>
    </div>
  )
}

export default Modal
