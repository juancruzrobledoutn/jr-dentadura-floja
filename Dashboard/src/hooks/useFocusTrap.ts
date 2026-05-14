import { useEffect, useRef, useCallback, type RefObject } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="option"]:not([aria-disabled="true"])',
  '[role="link"]',
  '[role="checkbox"]:not([aria-disabled="true"])',
  '[role="radio"]:not([aria-disabled="true"])',
  '[role="switch"]:not([aria-disabled="true"])',
  'details > summary',
].join(', ')

export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean
): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const previousActiveElement = useRef<Element | null>(null)

  // Memoize the handler to get fresh focusable elements on each keydown
  const createHandler = useCallback((container: HTMLElement) => {
    return function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return

      // Query fresh focusable elements each time (handles dynamic content)
      const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      if (focusableElements.length === 0) return

      const focusableArray = Array.from(focusableElements)
      const firstElement = focusableArray[0]
      const lastElement = focusableArray[focusableArray.length - 1]

      // Get current focused element with null safety
      const activeElement = document.activeElement
      const currentIndex = activeElement
        ? focusableArray.indexOf(activeElement as HTMLElement)
        : -1

      if (e.shiftKey) {
        // Shift + Tab: move backwards
        if (currentIndex === 0 || currentIndex === -1) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab: move forwards
        if (currentIndex === focusableArray.length - 1) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    // Store the currently focused element
    previousActiveElement.current = document.activeElement

    const container = containerRef.current

    // Focus the first focusable element
    const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    focusableElements[0]?.focus()

    // Use AbortController for clean event listener management
    const abortController = new AbortController()
    const { signal } = abortController

    const handler = createHandler(container)
    container.addEventListener('keydown', handler, { signal })

    return () => {
      // Abort all event listeners registered with this signal
      abortController.abort()

      // Restore focus to the previously focused element (if still in DOM)
      const prev = previousActiveElement.current
      if (prev instanceof HTMLElement && document.body.contains(prev)) {
        prev.focus()
      }
    }
  }, [isActive, createHandler])

  return containerRef
}
