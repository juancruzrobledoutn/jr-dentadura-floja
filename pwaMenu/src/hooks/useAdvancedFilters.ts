import { useMemo, useCallback } from 'react'
import { useAllergenFilter, ProductAllergens } from './useAllergenFilter'
import { useDietaryFilter, DietaryProfile } from './useDietaryFilter'
import { useCookingMethodFilter } from './useCookingMethodFilter'

/**
 * Complete product data structure for advanced filtering.
 * This matches the ProductCompleteView from the backend service.
 */
export interface ProductFilterData {
  id: number
  name: string
  allergens?: ProductAllergens | null
  dietary?: DietaryProfile | null
  cooking?: {
    methods: string[]
    uses_oil: boolean
    prep_time_minutes?: number | null
    cook_time_minutes?: number | null
  } | null
}

/**
 * Combined hook for all advanced product filters.
 * Provides a unified interface for filtering products by:
 * - Allergens (with presence types and strictness levels)
 * - Dietary profile (vegetarian, vegan, gluten-free, etc.)
 * - Cooking methods (exclude fried, require grilled, etc.)
 */
export function useAdvancedFilters(branchSlug?: string) {
  // MENU-HOOK-LOW-02 FIX: Pass branchSlug to enable cross-reaction filtering
  const allergenFilter = useAllergenFilter(branchSlug)
  const dietaryFilter = useDietaryFilter()
  const cookingFilter = useCookingMethodFilter()

  // CRIT-29-05 FIX: Extract stable references from filters to avoid cyclic re-renders
  // Instead of depending on entire filter objects, depend on specific stable methods/values
  const allergenHasActive = allergenFilter.hasActiveFilter
  const allergenShouldHide = allergenFilter.shouldHideProductAdvanced
  const dietaryHasActive = dietaryFilter.hasActiveFilter
  const dietaryMatches = dietaryFilter.matchesFilter
  const cookingHasActive = cookingFilter.hasActiveFilter
  const cookingMatches = cookingFilter.matchesFilter

  // MENU-HOOK-LOW-02 FIX: Compute hasAnyActiveFilter first so it can be used in filterProducts
  // Memoized to prevent unnecessary recalculations
  const hasAnyActiveFilter = useMemo(
    () =>
      allergenFilter.hasActiveFilter ||
      dietaryFilter.hasActiveFilter ||
      cookingFilter.hasActiveFilter,
    [
      allergenFilter.hasActiveFilter,
      dietaryFilter.hasActiveFilter,
      cookingFilter.hasActiveFilter,
    ]
  )

  /**
   * Check if a product should be shown based on ALL active filters.
   * Returns true if the product passes all filter criteria.
   */
  const shouldShowProduct = useCallback(
    (product: ProductFilterData) => {
      // Check allergen filter
      if (allergenHasActive) {
        if (product.allergens) {
          if (allergenShouldHide(product.allergens)) {
            return false
          }
        }
      }

      // Check dietary filter
      if (dietaryHasActive) {
        if (!dietaryMatches(product.dietary)) {
          return false
        }
      }

      // Check cooking method filter
      if (cookingHasActive) {
        const methods = product.cooking?.methods || []
        const usesOil = product.cooking?.uses_oil || false
        if (!cookingMatches(methods, usesOil)) {
          return false
        }
      }

      return true
    },
    [allergenHasActive, allergenShouldHide, dietaryHasActive, dietaryMatches, cookingHasActive, cookingMatches]
  )

  /**
   * Filter an array of products using all active filters.
   * Returns only products that pass all criteria.
   * MENU-HOOK-LOW-02 FIX: Include hasAnyActiveFilter in dependencies
   */
  const filterProducts = useCallback(
    <T extends ProductFilterData>(products: T[]): T[] => {
      if (!hasAnyActiveFilter) {
        return products
      }
      return products.filter(shouldShowProduct)
    },
    [hasAnyActiveFilter, shouldShowProduct]
  )

  // MENU-HOOK-LOW-02 FIX: Memoize total count to prevent unnecessary recalculations
  // Total count of all active filters across all filter types
  const totalActiveFilters = useMemo(
    () =>
      allergenFilter.activeExclusionCount +
      dietaryFilter.activeFilterCount +
      cookingFilter.activeFilterCount,
    [
      allergenFilter.activeExclusionCount,
      dietaryFilter.activeFilterCount,
      cookingFilter.activeFilterCount,
    ]
  )

  // MENU-HOOK-LOW-02 FIX: hasAnyActiveFilter moved above filterProducts to fix reference order

  // CRIT-29-05 FIX: Extract stable clear methods to avoid cyclic dependencies
  const allergenClear = allergenFilter.clearExclusions
  const dietaryClear = dietaryFilter.clearSelections
  const cookingClear = cookingFilter.clearFilters

  // Clear all filters at once
  const clearAllFilters = useCallback(() => {
    allergenClear()
    dietaryClear()
    cookingClear()
  }, [allergenClear, dietaryClear, cookingClear])

  return {
    // Individual filters for granular control
    allergen: allergenFilter,
    dietary: dietaryFilter,
    cooking: cookingFilter,

    // Combined functionality
    shouldShowProduct,
    filterProducts,
    clearAllFilters,

    // Computed state
    totalActiveFilters,
    hasAnyActiveFilter,
  }
}
