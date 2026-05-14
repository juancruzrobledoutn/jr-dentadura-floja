/**
 * Store for managing branch exclusions (categories/subcategories per branch).
 * Allows ADMIN to mark which categories/subcategories are NOT sold at specific branches.
 */

import { create } from 'zustand'
import {
  exclusionAPI,
  type CategoryExclusionSummary,
  type SubcategoryExclusionSummary,
  type ExclusionOverview,
} from '../services/api'
import { handleError } from '../utils/logger'

// CRIT-12 FIX: Stable empty array reference to prevent infinite re-renders
const EMPTY_BRANCH_IDS: number[] = []

interface ExclusionState {
  // Data
  categoryExclusions: CategoryExclusionSummary[]
  subcategoryExclusions: SubcategoryExclusionSummary[]

  // Loading states
  isLoading: boolean
  isUpdating: boolean
  error: string | null

  // Actions
  fetchExclusions: () => Promise<void>
  updateCategoryExclusions: (categoryId: number, excludedBranchIds: number[]) => Promise<void>
  updateSubcategoryExclusions: (subcategoryId: number, excludedBranchIds: number[]) => Promise<void>

  // Helpers
  isCategoryExcludedFromBranch: (categoryId: number, branchId: number) => boolean
  isSubcategoryExcludedFromBranch: (subcategoryId: number, branchId: number) => boolean
  getExcludedBranchesForCategory: (categoryId: number) => number[]
  getExcludedBranchesForSubcategory: (subcategoryId: number) => number[]
}

export const useExclusionStore = create<ExclusionState>()((set, get) => ({
  // Initial state
  categoryExclusions: [],
  subcategoryExclusions: [],
  isLoading: false,
  isUpdating: false,
  error: null,

  /**
   * Fetch all exclusions from the backend.
   */
  fetchExclusions: async () => {
    set({ isLoading: true, error: null })
    try {
      const overview: ExclusionOverview = await exclusionAPI.getOverview()
      set({
        categoryExclusions: overview.category_exclusions,
        subcategoryExclusions: overview.subcategory_exclusions,
        isLoading: false,
      })
    } catch (error) {
      const message = handleError(error, 'ExclusionStore.fetchExclusions')
      set({ error: message, isLoading: false })
    }
  },

  /**
   * Update exclusions for a category.
   * @param categoryId The category ID
   * @param excludedBranchIds List of branch IDs where category is NOT sold
   */
  updateCategoryExclusions: async (categoryId: number, excludedBranchIds: number[]) => {
    set({ isUpdating: true, error: null })
    try {
      const updated = await exclusionAPI.updateCategoryExclusions(categoryId, excludedBranchIds)

      // Update local state
      set((state) => ({
        categoryExclusions: state.categoryExclusions.map((cat) =>
          cat.category_id === categoryId
            ? { ...cat, excluded_branch_ids: updated.excluded_branch_ids }
            : cat
        ),
        isUpdating: false,
      }))
    } catch (error) {
      const message = handleError(error, 'ExclusionStore.updateCategoryExclusions')
      set({ error: message, isUpdating: false })
      throw error // Re-throw so caller can handle
    }
  },

  /**
   * Update exclusions for a subcategory.
   * @param subcategoryId The subcategory ID
   * @param excludedBranchIds List of branch IDs where subcategory is NOT sold
   */
  updateSubcategoryExclusions: async (subcategoryId: number, excludedBranchIds: number[]) => {
    set({ isUpdating: true, error: null })
    try {
      const updated = await exclusionAPI.updateSubcategoryExclusions(subcategoryId, excludedBranchIds)

      // Update local state
      set((state) => ({
        subcategoryExclusions: state.subcategoryExclusions.map((subcat) =>
          subcat.subcategory_id === subcategoryId
            ? { ...subcat, excluded_branch_ids: updated.excluded_branch_ids }
            : subcat
        ),
        isUpdating: false,
      }))
    } catch (error) {
      const message = handleError(error, 'ExclusionStore.updateSubcategoryExclusions')
      set({ error: message, isUpdating: false })
      throw error // Re-throw so caller can handle
    }
  },

  /**
   * Check if a category is excluded from a specific branch.
   */
  isCategoryExcludedFromBranch: (categoryId: number, branchId: number) => {
    const exclusion = get().categoryExclusions.find((e) => e.category_id === categoryId)
    return exclusion?.excluded_branch_ids.includes(branchId) ?? false
  },

  /**
   * Check if a subcategory is excluded from a specific branch.
   */
  isSubcategoryExcludedFromBranch: (subcategoryId: number, branchId: number) => {
    const exclusion = get().subcategoryExclusions.find((e) => e.subcategory_id === subcategoryId)
    return exclusion?.excluded_branch_ids.includes(branchId) ?? false
  },

  /**
   * Get list of branch IDs where a category is excluded.
   * CRIT-12 FIX: Uses stable empty array reference to prevent infinite re-renders.
   */
  getExcludedBranchesForCategory: (categoryId: number) => {
    const exclusion = get().categoryExclusions.find((e) => e.category_id === categoryId)
    return exclusion?.excluded_branch_ids ?? EMPTY_BRANCH_IDS
  },

  /**
   * Get list of branch IDs where a subcategory is excluded.
   * CRIT-12 FIX: Uses stable empty array reference to prevent infinite re-renders.
   */
  getExcludedBranchesForSubcategory: (subcategoryId: number) => {
    const exclusion = get().subcategoryExclusions.find((e) => e.subcategory_id === subcategoryId)
    return exclusion?.excluded_branch_ids ?? EMPTY_BRANCH_IDS
  },
}))

// Selectors for use with useStore(selector) pattern
export const selectCategoryExclusions = (state: ExclusionState) => state.categoryExclusions
export const selectSubcategoryExclusions = (state: ExclusionState) => state.subcategoryExclusions
export const selectIsLoading = (state: ExclusionState) => state.isLoading
export const selectIsUpdating = (state: ExclusionState) => state.isUpdating
export const selectError = (state: ExclusionState) => state.error
