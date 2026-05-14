/**
 * Centralized store reset function for logout
 * Clears all data stores to prevent data leakage between sessions
 */

import { useBranchStore } from './branchStore'
import { useCategoryStore } from './categoryStore'
import { useProductStore } from './productStore'
import { useTableStore } from './tableStore'
import { useSubcategoryStore } from './subcategoryStore'
import { useSectorStore } from './sectorStore'
import { useStaffStore } from './staffStore'
import { useAllergenStore } from './allergenStore'
import { usePromotionStore } from './promotionStore'
import { useIngredientStore } from './ingredientStore'
import { useRecipeStore } from './recipeStore'
import { useWaiterAssignmentStore } from './waiterAssignmentStore'
import { useExclusionStore } from './exclusionStore'
import { useCustomizationStore } from './customizationStore'
import { useDeliveryStore } from './deliveryStore'
import { useReservationStore } from './reservationStore'

/**
 * Resets all data stores to their initial state
 * Called on logout to clear sensitive/user-specific data
 */
export function resetAllStores(): void {
  // Branch store has explicit reset method
  useBranchStore.getState().reset()

  // Reset other stores by setting their data arrays to empty
  // These stores use persist middleware, so we set state directly

  useCategoryStore.setState({ categories: [], isLoading: false, error: null })
  useProductStore.setState({ products: [], isLoading: false, error: null })
  useTableStore.setState({ tables: [], isLoading: false, error: null, _isSubscribed: false })
  useSubcategoryStore.setState({ subcategories: [], isLoading: false, error: null })
  useSectorStore.setState({ sectors: [], isLoading: false, error: null })
  useStaffStore.setState({ staff: [], isLoading: false, error: null })
  useAllergenStore.setState({ allergens: [], isLoading: false, error: null })
  usePromotionStore.setState({ promotions: [], isLoading: false, error: null })
  useIngredientStore.setState({ ingredients: [], isLoading: false, error: null })
  useRecipeStore.setState({ recipes: [], isLoading: false, error: null })
  useWaiterAssignmentStore.setState({ assignments: [], isLoading: false, error: null })
  useExclusionStore.setState({ exclusions: [], isLoading: false, error: null })
  useCustomizationStore.setState({ options: [], isLoading: false, error: null })
  useDeliveryStore.setState({ orders: [], isLoading: false, error: null })
  useReservationStore.setState({ reservations: [], isLoading: false, error: null })

  // Clear persisted storage for all stores
  localStorage.removeItem('dashboard-branches')
  localStorage.removeItem('dashboard-categories')
  localStorage.removeItem('dashboard-products')
  localStorage.removeItem('dashboard-tables')
  localStorage.removeItem('dashboard-subcategories')
  localStorage.removeItem('dashboard-sectors')
  localStorage.removeItem('dashboard-staff')
  localStorage.removeItem('dashboard-allergens')
  localStorage.removeItem('dashboard-promotions')
  localStorage.removeItem('dashboard-ingredients')
  localStorage.removeItem('dashboard-recipes')
  localStorage.removeItem('dashboard-waiter-assignments')
  localStorage.removeItem('dashboard-exclusions')
}
