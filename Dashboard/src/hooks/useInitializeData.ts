import { useEffect, useRef } from 'react'
import { useBranchStore } from '../stores/branchStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useSubcategoryStore } from '../stores/subcategoryStore'
import { useProductStore } from '../stores/productStore'
import { useTableStore } from '../stores/tableStore'
import { useStaffStore } from '../stores/staffStore'
import { useAllergenStore } from '../stores/allergenStore'
import { usePromotionStore } from '../stores/promotionStore'
import { useRestaurantStore } from '../stores/restaurantStore'
import { useAuthStore } from '../stores/authStore'
// LOW-29-12 FIX: Import handleError from logger utility
import { handleError } from '../utils/logger'

/**
 * Hook to initialize data from backend API after authentication.
 * Should be called once when the authenticated layout mounts.
 */
export function useInitializeData() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasInitialized = useRef(false)

  // Get all fetch functions
  const fetchBranches = useBranchStore((s) => s.fetchBranches)
  const fetchCategories = useCategoryStore((s) => s.fetchCategories)
  const fetchSubcategories = useSubcategoryStore((s) => s.fetchSubcategories)
  const fetchProducts = useProductStore((s) => s.fetchProducts)
  const fetchTables = useTableStore((s) => s.fetchTables)
  const fetchStaff = useStaffStore((s) => s.fetchStaff)
  const fetchAllergens = useAllergenStore((s) => s.fetchAllergens)
  const fetchPromotions = usePromotionStore((s) => s.fetchPromotions)
  const fetchRestaurant = useRestaurantStore((s) => s.fetchRestaurant)

  useEffect(() => {
    // Only fetch once when authenticated
    if (!isAuthenticated || hasInitialized.current) {
      return
    }

    hasInitialized.current = true

    // Fetch all data in parallel
    const fetchAll = async () => {
      try {
        await Promise.all([
          fetchRestaurant(),
          fetchBranches(),
          fetchCategories(),
          fetchSubcategories(),
          fetchProducts(),
          fetchTables(),
          fetchStaff(),
          fetchAllergens(),
          fetchPromotions(),
        ])
      } catch (error) {
        // LOW-29-12 FIX: Use handleError instead of console.error
        // Individual stores handle their own errors
        handleError(error, 'useInitializeData.fetchAll')
      }
    }

    fetchAll()
  }, [
    isAuthenticated,
    fetchRestaurant,
    fetchBranches,
    fetchCategories,
    fetchSubcategories,
    fetchProducts,
    fetchTables,
    fetchStaff,
    fetchAllergens,
    fetchPromotions,
  ])
}
