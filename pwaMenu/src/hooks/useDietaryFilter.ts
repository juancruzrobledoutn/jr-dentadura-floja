import { useState, useCallback, useEffect, useMemo } from 'react'

const STORAGE_KEY = 'pwamenu_dietary_filter'

/**
 * Dietary profile options that can be filtered.
 * These match the ProductDietaryProfile model in the backend.
 */
export type DietaryOption =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'celiac_safe'
  | 'keto'
  | 'low_sodium'

export interface DietaryProfile {
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  is_dairy_free: boolean
  is_celiac_safe: boolean
  is_keto: boolean
  is_low_sodium: boolean
}

/**
 * Human-readable labels for dietary options (Spanish)
 */
export const DIETARY_LABELS: Record<DietaryOption, string> = {
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  gluten_free: 'Sin Gluten',
  dairy_free: 'Sin Lácteos',
  celiac_safe: 'Apto Celíacos',
  keto: 'Keto',
  low_sodium: 'Bajo en Sodio',
}

/**
 * Icons for dietary options (emoji)
 */
export const DIETARY_ICONS: Record<DietaryOption, string> = {
  vegetarian: '🥬',
  vegan: '🌱',
  gluten_free: '🌾',
  dairy_free: '🥛',
  celiac_safe: '✅',
  keto: '🥑',
  low_sodium: '🧂',
}

/**
 * Hook to filter products by dietary profile.
 * Users can select dietary requirements and only see products that match ALL selected options.
 */
export function useDietaryFilter() {
  // Initialize from sessionStorage
  const [selectedOptions, setSelectedState] = useState<DietaryOption[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed as DietaryOption[]
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  })

  // Persist to sessionStorage when filter changes
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selectedOptions))
    } catch {
      // Ignore storage errors
    }
  }, [selectedOptions])

  // Toggle a dietary option
  const toggleOption = useCallback((option: DietaryOption) => {
    setSelectedState((prev) => {
      if (prev.includes(option)) {
        return prev.filter((o) => o !== option)
      }
      return [...prev, option]
    })
  }, [])

  // Select a specific option
  const selectOption = useCallback((option: DietaryOption) => {
    setSelectedState((prev) => {
      if (prev.includes(option)) {
        return prev
      }
      return [...prev, option]
    })
  }, [])

  // Deselect a specific option
  const deselectOption = useCallback((option: DietaryOption) => {
    setSelectedState((prev) => prev.filter((o) => o !== option))
  }, [])

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedState([])
  }, [])

  // Set multiple selections at once
  const setSelectedOptions = useCallback((options: DietaryOption[]) => {
    setSelectedState(options)
  }, [])

  // Check if a product matches the dietary filter
  // Product must satisfy ALL selected dietary requirements
  const matchesFilter = useCallback(
    (profile: DietaryProfile | null | undefined) => {
      if (selectedOptions.length === 0) return true
      if (!profile) return false

      return selectedOptions.every((option) => {
        switch (option) {
          case 'vegetarian':
            return profile.is_vegetarian
          case 'vegan':
            return profile.is_vegan
          case 'gluten_free':
            return profile.is_gluten_free
          case 'dairy_free':
            return profile.is_dairy_free
          case 'celiac_safe':
            return profile.is_celiac_safe
          case 'keto':
            return profile.is_keto
          case 'low_sodium':
            return profile.is_low_sodium
          default:
            return true
        }
      })
    },
    [selectedOptions]
  )

  // Check if a specific option is selected
  const isOptionSelected = useCallback(
    (option: DietaryOption) => selectedOptions.includes(option),
    [selectedOptions]
  )

  // Number of active filters
  const activeFilterCount = useMemo(
    () => selectedOptions.length,
    [selectedOptions]
  )

  return {
    selectedOptions,
    toggleOption,
    selectOption,
    deselectOption,
    clearSelections,
    setSelectedOptions,
    matchesFilter,
    isOptionSelected,
    activeFilterCount,
    hasActiveFilter: activeFilterCount > 0,
    // Helpers
    labels: DIETARY_LABELS,
    icons: DIETARY_ICONS,
  }
}
