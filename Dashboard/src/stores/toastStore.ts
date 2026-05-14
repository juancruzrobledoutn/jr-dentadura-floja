import { create } from 'zustand'
import type { Toast } from '../types'
import { generateId, VALIDATION_LIMITS } from '../utils/constants'

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

// Map para almacenar timeout IDs y poder cancelarlos
// CRIT-11 FIX: Added periodic cleanup for orphaned timeouts
const timeoutIds = new Map<string, ReturnType<typeof setTimeout>>()

// Use centralized constant for max toasts
const { MAX_TOASTS } = VALIDATION_LIMITS

// CRIT-11 FIX: Ensure timeoutIds Map doesn't grow unbounded
// Clean up orphaned entries every 100 additions
let additionCount = 0
const CLEANUP_INTERVAL = 100
const MAX_TIMEOUT_ENTRIES = MAX_TOASTS * 2 // Allow some buffer

function cleanupOrphanedTimeouts(currentToastIds: Set<string>): void {
  if (timeoutIds.size <= MAX_TIMEOUT_ENTRIES) return
  // Remove entries not in current toasts
  for (const id of timeoutIds.keys()) {
    if (!currentToastIds.has(id)) {
      const timeoutId = timeoutIds.get(id)
      if (timeoutId) clearTimeout(timeoutId)
      timeoutIds.delete(id)
    }
  }
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId()
    const newToast: Toast = { ...toast, id }

    // Use set() with callback to atomically handle the limit check and update
    set((state) => {
      let updatedToasts = [...state.toasts]

      // Remove oldest toasts if exceeding limit
      while (updatedToasts.length >= MAX_TOASTS) {
        const oldestToast = updatedToasts[0]
        // Clear timeout for oldest toast before removing
        const oldTimeoutId = timeoutIds.get(oldestToast.id)
        if (oldTimeoutId) {
          clearTimeout(oldTimeoutId)
          timeoutIds.delete(oldestToast.id)
        }
        updatedToasts = updatedToasts.slice(1)
      }

      return { toasts: [...updatedToasts, newToast] }
    })

    // Auto-remove after duration
    const duration = toast.duration ?? 3000
    const timeoutId = setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
      timeoutIds.delete(id)
    }, duration)

    timeoutIds.set(id, timeoutId)

    // CRIT-11 FIX: Periodic cleanup of orphaned timeout entries
    additionCount++
    if (additionCount >= CLEANUP_INTERVAL) {
      additionCount = 0
      const currentIds = new Set(useToastStore.getState().toasts.map((t) => t.id))
      cleanupOrphanedTimeouts(currentIds)
    }
  },

  removeToast: (id) => {
    // Cancelar el timeout si existe
    const timeoutId = timeoutIds.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutIds.delete(id)
    }

    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearToasts: () => {
    // Cancelar todos los timeouts
    timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId))
    timeoutIds.clear()

    set({ toasts: [] })
  },
}))

// Helper functions
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'error', message, duration }),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', message, duration }),
}
