/**
 * useImplicitPreferences Hook
 *
 * FASE 2: Implicit Preferences - Cross-session filter persistence
 *
 * This hook syncs allergen, dietary, and cooking method filters to the backend
 * for persistence across sessions. On app startup, it loads saved preferences
 * for returning devices.
 *
 * Usage:
 * - Call loadPreferences() on app mount to restore saved filters
 * - Hook auto-syncs when filter state changes (debounced)
 */

import { useEffect, useCallback, useRef, useMemo } from 'react'
import { dinerAPI } from '../services/api'
import { getDeviceId } from '../utils/deviceId'
import { getTableToken } from '../services/api'
import { useAllergenFilter } from './useAllergenFilter'
import { useDietaryFilter, type DietaryOption } from './useDietaryFilter'
import { useCookingMethodFilter, type CookingMethod } from './useCookingMethodFilter'
import { logger } from '../utils/logger'
import type { ImplicitPreferencesData } from '../types/backend'

// Debounce delay for syncing preferences (ms)
const SYNC_DEBOUNCE_MS = 2000

// QA-HIGH-02 FIX: Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

// QA-HIGH-04 FIX: Guard against duplicate initialization with cleanup support
let isInitialized = false
let initCleanup: (() => void) | null = null

export interface UseImplicitPreferencesResult {
  /** Load saved preferences from backend for current device */
  loadPreferences: () => Promise<void>
  /** Manually trigger sync to backend (auto-synced on changes) */
  syncPreferences: () => Promise<void>
  /** Whether preferences are currently being synced */
  isSyncing: boolean
  /** Whether preferences have been loaded */
  isLoaded: boolean
  /** Error message if load/sync failed */
  error: string | null
  /** Number of visits for this device */
  visitCount: number
}

export function useImplicitPreferences(
  branchSlug?: string
): UseImplicitPreferencesResult {
  const allergenFilter = useAllergenFilter(branchSlug)
  const dietaryFilter = useDietaryFilter()
  const cookingFilter = useCookingMethodFilter()

  const isSyncingRef = useRef(false)
  const isLoadedRef = useRef(false)
  const errorRef = useRef<string | null>(null)
  const visitCountRef = useRef(0)
  const syncTimeoutRef = useRef<number | null>(null)
  const lastSyncedRef = useRef<string>('')

  // Build current preferences state
  const currentPreferences = useMemo((): ImplicitPreferencesData => ({
    excluded_allergen_ids: allergenFilter.excludedAllergenIds,
    dietary_preferences: dietaryFilter.selectedOptions,
    excluded_cooking_methods: cookingFilter.filterState.excludedMethods,
    cross_reactions_enabled: allergenFilter.crossReactionsEnabled,
    strictness: allergenFilter.strictness,
  }), [
    allergenFilter.excludedAllergenIds,
    allergenFilter.crossReactionsEnabled,
    allergenFilter.strictness,
    dietaryFilter.selectedOptions,
    cookingFilter.filterState.excludedMethods,
  ])

  /**
   * Load saved preferences for this device from backend
   * QA-HIGH-02 FIX: Added retry mechanism with exponential backoff
   */
  const loadPreferences = useCallback(async (retryCount = 0) => {
    // Prevent duplicate initialization
    if (isInitialized) return

    const deviceId = getDeviceId()
    const tableToken = getTableToken()

    // Need both device ID and table token to fetch preferences
    if (!deviceId || !tableToken) {
      return
    }

    try {
      const response = await dinerAPI.getDevicePreferences(deviceId)

      if (response.has_preferences && response.implicit_preferences) {
        const prefs = response.implicit_preferences

        // Apply allergen preferences
        if (prefs.excluded_allergen_ids?.length) {
          prefs.excluded_allergen_ids.forEach((id) => {
            if (!allergenFilter.excludedAllergenIds.includes(id)) {
              allergenFilter.toggleAllergen(id)
            }
          })
        }

        // Apply strictness
        if (prefs.strictness && prefs.strictness !== allergenFilter.strictness) {
          allergenFilter.setStrictness(prefs.strictness as 'strict' | 'very_strict')
        }

        // Apply cross-reactions setting
        if (prefs.cross_reactions_enabled !== allergenFilter.crossReactionsEnabled) {
          allergenFilter.toggleCrossReactions()
        }

        // Apply dietary preferences
        if (prefs.dietary_preferences?.length) {
          prefs.dietary_preferences.forEach((pref) => {
            const option = pref as DietaryOption
            if (!dietaryFilter.selectedOptions.includes(option)) {
              dietaryFilter.toggleOption(option)
            }
          })
        }

        // Apply cooking method exclusions
        if (prefs.excluded_cooking_methods?.length) {
          prefs.excluded_cooking_methods.forEach((method) => {
            const cookingMethod = method as CookingMethod
            if (!cookingFilter.filterState.excludedMethods.includes(cookingMethod)) {
              cookingFilter.toggleExcludedMethod(cookingMethod)
            }
          })
        }

        // Store the initial state to avoid unnecessary syncs
        lastSyncedRef.current = JSON.stringify(response.implicit_preferences)
      }

      visitCountRef.current = response.visit_count
      isLoadedRef.current = true
      isInitialized = true
      errorRef.current = null
    } catch (err) {
      // QA-HIGH-02 FIX: Retry on failure with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
        logger.warn(`Load preferences failed, retrying in ${delay}ms`, { attempt: retryCount + 1, max: MAX_RETRIES })
        await new Promise((resolve) => setTimeout(resolve, delay))
        return loadPreferences(retryCount + 1)
      }

      // Max retries exceeded - silently fail, preferences are optional
      logger.warn('Failed to load preferences after retries', err)
      errorRef.current = err instanceof Error ? err.message : 'Failed to load'
      isLoadedRef.current = true
      isInitialized = true
    }
  }, [allergenFilter, dietaryFilter, cookingFilter])

  /**
   * Sync current preferences to backend
   * QA-HIGH-02 FIX: Added retry mechanism
   */
  const syncPreferences = useCallback(async (retryCount = 0) => {
    const tableToken = getTableToken()

    // Need table token to sync
    if (!tableToken) {
      return
    }

    // Don't sync if nothing changed
    const currentState = JSON.stringify(currentPreferences)
    if (currentState === lastSyncedRef.current) {
      return
    }

    try {
      isSyncingRef.current = true
      await dinerAPI.updatePreferences({
        implicit_preferences: currentPreferences,
      })
      lastSyncedRef.current = currentState
      errorRef.current = null
    } catch (err) {
      // QA-HIGH-02 FIX: Retry on failure
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
        logger.warn(`Sync preferences failed, retrying in ${delay}ms`, { attempt: retryCount + 1, max: MAX_RETRIES })
        await new Promise((resolve) => setTimeout(resolve, delay))
        return syncPreferences(retryCount + 1)
      }
      logger.warn('Failed to sync preferences after retries', err)
      errorRef.current = err instanceof Error ? err.message : 'Failed to sync'
    } finally {
      isSyncingRef.current = false
    }
  }, [currentPreferences])

  // Auto-sync preferences when they change (debounced)
  useEffect(() => {
    // Don't sync until initial load is complete
    if (!isLoadedRef.current) return

    // Clear any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    // Schedule sync after debounce period
    syncTimeoutRef.current = window.setTimeout(() => {
      syncPreferences()
    }, SYNC_DEBOUNCE_MS)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [currentPreferences, syncPreferences])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [])

  return {
    loadPreferences,
    syncPreferences,
    isSyncing: isSyncingRef.current,
    isLoaded: isLoadedRef.current,
    error: errorRef.current,
    visitCount: visitCountRef.current,
  }
}

/**
 * Reset the initialization flag (for testing/cleanup)
 */
export function resetImplicitPreferencesInit(): void {
  isInitialized = false
  if (initCleanup) {
    initCleanup()
    initCleanup = null
  }
}

// QA-HIGH-04 FIX: HMR cleanup - reset on hot module reload
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetImplicitPreferencesInit()
  })
}
