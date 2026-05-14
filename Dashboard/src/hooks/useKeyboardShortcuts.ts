/**
 * DASH-012: useKeyboardShortcuts hook
 *
 * Reusable hook for managing global keyboard shortcuts.
 * Handles Mac vs Windows (Cmd vs Ctrl), prevents shortcuts in inputs,
 * and provides registration/unregistration functions.
 *
 * Usage:
 * ```typescript
 * const shortcuts = useKeyboardShortcuts()
 *
 * // Register a shortcut
 * shortcuts.registerShortcut({
 *   key: 'k',
 *   ctrl: true, // or meta: true for Cmd on Mac
 *   handler: () => openSearch(),
 *   description: 'Open search'
 * })
 *
 * // Unregister when done
 * shortcuts.unregisterShortcut('ctrl+k')
 * ```
 */

import { useCallback, useEffect, useRef } from 'react'

export interface ShortcutConfig {
  /** The key to listen for (case-insensitive) */
  key: string
  /** Require Ctrl key (Windows) or Cmd key (Mac) */
  ctrl?: boolean
  /** Require Meta key (Cmd on Mac, Win key on Windows) */
  meta?: boolean
  /** Require Shift key */
  shift?: boolean
  /** Require Alt key */
  alt?: boolean
  /** Handler function called when shortcut is triggered */
  handler: (event: KeyboardEvent) => void
  /** Description of what the shortcut does (for help/documentation) */
  description?: string
  /** If true, shortcut works even when user is typing in inputs */
  allowInInput?: boolean
  /** If true, prevents default browser behavior */
  preventDefault?: boolean
}

export interface UseKeyboardShortcutsReturn {
  /** Register a new keyboard shortcut */
  registerShortcut: (config: ShortcutConfig) => void
  /** Unregister a shortcut by its key combination (e.g., 'ctrl+k', 'escape') */
  unregisterShortcut: (keyCombo: string) => void
  /** Get all registered shortcuts */
  getShortcuts: () => Map<string, ShortcutConfig>
  /** Check if running on Mac */
  isMac: boolean
}

/**
 * Checks if the active element is an input, textarea, or contenteditable
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false

  const tagName = element.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  // Check for contenteditable
  if (element.getAttribute('contenteditable') === 'true') {
    return true
  }

  return false
}

/**
 * Generates a unique key for a shortcut configuration
 */
function getShortcutKey(config: ShortcutConfig): string {
  const parts: string[] = []

  if (config.ctrl) parts.push('ctrl')
  if (config.meta) parts.push('meta')
  if (config.alt) parts.push('alt')
  if (config.shift) parts.push('shift')
  parts.push(config.key.toLowerCase())

  return parts.join('+')
}

/**
 * Detects if the user is on a Mac
 */
function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

/**
 * Hook for managing global keyboard shortcuts
 *
 * @returns Shortcut management functions and utilities
 *
 * @example
 * ```typescript
 * const shortcuts = useKeyboardShortcuts()
 *
 * useEffect(() => {
 *   // Ctrl+K or Cmd+K: Open search
 *   shortcuts.registerShortcut({
 *     key: 'k',
 *     ctrl: true,
 *     handler: () => setSearchOpen(true),
 *     preventDefault: true,
 *     description: 'Open search'
 *   })
 *
 *   // Escape: Close modals
 *   shortcuts.registerShortcut({
 *     key: 'Escape',
 *     handler: () => closeModal(),
 *     allowInInput: true,
 *     description: 'Close modal'
 *   })
 *
 *   // Ctrl+S: Save form
 *   shortcuts.registerShortcut({
 *     key: 's',
 *     ctrl: true,
 *     handler: () => saveForm(),
 *     preventDefault: true,
 *     description: 'Save form'
 *   })
 *
 *   // N: New item (only when not in input)
 *   shortcuts.registerShortcut({
 *     key: 'n',
 *     handler: () => openCreateModal(),
 *     description: 'Create new item'
 *   })
 *
 *   return () => {
 *     shortcuts.unregisterShortcut('ctrl+k')
 *     shortcuts.unregisterShortcut('escape')
 *     shortcuts.unregisterShortcut('ctrl+s')
 *     shortcuts.unregisterShortcut('n')
 *   }
 * }, [shortcuts])
 * ```
 */
export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const shortcutsRef = useRef<Map<string, ShortcutConfig>>(new Map())
  // LINT FIX: Compute isMac as a stable value outside of render
  const isMac = detectMac()
  const isMacRef = useRef(isMac)

  const registerShortcut = useCallback((config: ShortcutConfig) => {
    const key = getShortcutKey(config)
    shortcutsRef.current.set(key, config)
  }, [])

  const unregisterShortcut = useCallback((keyCombo: string) => {
    shortcutsRef.current.delete(keyCombo.toLowerCase())
  }, [])

  const getShortcuts = useCallback(() => {
    return new Map(shortcutsRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const inInput = isInputElement(activeElement)
      const isMac = isMacRef.current

      // Iterate through all registered shortcuts
      for (const [, config] of shortcutsRef.current) {
        // Skip if we're in an input and the shortcut doesn't allow it
        if (inInput && !config.allowInInput) {
          // Exception: Always allow shortcuts with Ctrl/Cmd modifier in inputs
          // (like Ctrl+S to save)
          if (!config.ctrl && !config.meta) {
            continue
          }
        }

        // Check if the key matches (case-insensitive)
        if (event.key.toLowerCase() !== config.key.toLowerCase()) {
          continue
        }

        // Handle Ctrl/Cmd - on Mac, Cmd (metaKey) is used instead of Ctrl
        if (config.ctrl) {
          const modifierPressed = isMac ? event.metaKey : event.ctrlKey
          if (!modifierPressed) continue
        }

        // Check Meta key (explicit meta requirement)
        if (config.meta && !event.metaKey) {
          continue
        }

        // Check Shift key
        if (config.shift && !event.shiftKey) {
          continue
        }

        // Check Alt key
        if (config.alt && !event.altKey) {
          continue
        }

        // If no modifier is required, ensure no modifier is pressed
        // (except for special keys like Escape which work regardless)
        if (!config.ctrl && !config.meta && !config.shift && !config.alt) {
          const specialKeys = ['escape', 'enter', 'tab', 'backspace', 'delete']
          const isSpecialKey = specialKeys.includes(config.key.toLowerCase())

          if (!isSpecialKey) {
            // For regular keys without modifiers, don't trigger if modifiers are held
            if (event.ctrlKey || event.metaKey || event.altKey) {
              continue
            }
          }
        }

        // Shortcut matched - execute handler
        if (config.preventDefault !== false) {
          event.preventDefault()
        }

        config.handler(event)

        // Only trigger one shortcut per keypress
        break
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return {
    registerShortcut,
    unregisterShortcut,
    getShortcuts,
    // LINT FIX: Return stable value, not ref.current during render
    isMac,
  }
}
