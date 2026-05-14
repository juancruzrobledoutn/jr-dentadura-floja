import { useState, useCallback, useEffect, useMemo } from 'react'

const STORAGE_KEY = 'pwamenu_cooking_filter'

/**
 * Cooking methods that can be filtered.
 * These match the CookingMethod seed data in the backend.
 */
export type CookingMethod =
  | 'horneado'
  | 'frito'
  | 'grillado'
  | 'crudo'
  | 'hervido'
  | 'vapor'
  | 'salteado'
  | 'braseado'

/**
 * Human-readable labels for cooking methods (Spanish)
 */
export const COOKING_METHOD_LABELS: Record<CookingMethod, string> = {
  horneado: 'Horneado',
  frito: 'Frito',
  grillado: 'Grillado/Parrilla',
  crudo: 'Crudo',
  hervido: 'Hervido',
  vapor: 'Al Vapor',
  salteado: 'Salteado',
  braseado: 'Braseado',
}

/**
 * Icons for cooking methods (emoji)
 */
export const COOKING_METHOD_ICONS: Record<CookingMethod, string> = {
  horneado: '🔥',
  frito: '🍳',
  grillado: '♨️',
  crudo: '🥗',
  hervido: '🫕',
  vapor: '💨',
  salteado: '🥘',
  braseado: '🍲',
}

export interface CookingFilterState {
  excludedMethods: CookingMethod[] // Methods to EXCLUDE (user doesn't want fried, etc.)
  requiredMethods: CookingMethod[] // Methods to REQUIRE (user only wants grilled, etc.)
  excludeUsesOil: boolean // Exclude products that use oil
}

/**
 * Hook to filter products by cooking method.
 * Supports both excluding specific methods (e.g., no fried) and requiring methods (e.g., only grilled).
 */
export function useCookingMethodFilter() {
  // Initialize from sessionStorage
  const [filterState, setFilterState] = useState<CookingFilterState>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          excludedMethods: parsed.excludedMethods || [],
          requiredMethods: parsed.requiredMethods || [],
          excludeUsesOil: parsed.excludeUsesOil || false,
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      excludedMethods: [],
      requiredMethods: [],
      excludeUsesOil: false,
    }
  })

  // Persist to sessionStorage when filter changes
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filterState))
    } catch {
      // Ignore storage errors
    }
  }, [filterState])

  // Toggle excluding a cooking method
  const toggleExcludedMethod = useCallback((method: CookingMethod) => {
    setFilterState((prev) => ({
      ...prev,
      excludedMethods: prev.excludedMethods.includes(method)
        ? prev.excludedMethods.filter((m) => m !== method)
        : [...prev.excludedMethods, method],
      // Remove from required if adding to excluded
      requiredMethods: prev.requiredMethods.filter((m) => m !== method),
    }))
  }, [])

  // Toggle requiring a cooking method
  const toggleRequiredMethod = useCallback((method: CookingMethod) => {
    setFilterState((prev) => ({
      ...prev,
      requiredMethods: prev.requiredMethods.includes(method)
        ? prev.requiredMethods.filter((m) => m !== method)
        : [...prev.requiredMethods, method],
      // Remove from excluded if adding to required
      excludedMethods: prev.excludedMethods.filter((m) => m !== method),
    }))
  }, [])

  // Toggle excluding products that use oil
  const toggleExcludeOil = useCallback(() => {
    setFilterState((prev) => ({
      ...prev,
      excludeUsesOil: !prev.excludeUsesOil,
    }))
  }, [])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilterState({
      excludedMethods: [],
      requiredMethods: [],
      excludeUsesOil: false,
    })
  }, [])

  /**
   * Check if a product matches the cooking filter.
   * @param productMethods - Array of cooking method names for the product
   * @param usesOil - Whether the product uses oil in preparation
   */
  const matchesFilter = useCallback(
    (productMethods: string[], usesOil: boolean = false) => {
      const { excludedMethods, requiredMethods, excludeUsesOil } = filterState

      // Check oil exclusion
      if (excludeUsesOil && usesOil) {
        return false
      }

      // Check excluded methods - product should NOT have any excluded method
      if (excludedMethods.length > 0) {
        const hasExcludedMethod = productMethods.some((m) =>
          excludedMethods.includes(m as CookingMethod)
        )
        if (hasExcludedMethod) {
          return false
        }
      }

      // Check required methods - product should have AT LEAST ONE required method
      if (requiredMethods.length > 0) {
        const hasRequiredMethod = productMethods.some((m) =>
          requiredMethods.includes(m as CookingMethod)
        )
        if (!hasRequiredMethod) {
          return false
        }
      }

      return true
    },
    [filterState]
  )

  // Check if a method is excluded
  const isMethodExcluded = useCallback(
    (method: CookingMethod) => filterState.excludedMethods.includes(method),
    [filterState.excludedMethods]
  )

  // Check if a method is required
  const isMethodRequired = useCallback(
    (method: CookingMethod) => filterState.requiredMethods.includes(method),
    [filterState.requiredMethods]
  )

  // Number of active filters
  const activeFilterCount = useMemo(
    () =>
      filterState.excludedMethods.length +
      filterState.requiredMethods.length +
      (filterState.excludeUsesOil ? 1 : 0),
    [filterState]
  )

  return {
    filterState,
    toggleExcludedMethod,
    toggleRequiredMethod,
    toggleExcludeOil,
    clearFilters,
    matchesFilter,
    isMethodExcluded,
    isMethodRequired,
    activeFilterCount,
    hasActiveFilter: activeFilterCount > 0,
    // Helpers
    labels: COOKING_METHOD_LABELS,
    icons: COOKING_METHOD_ICONS,
  }
}
