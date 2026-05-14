/**
 * DEF-HIGH-01 FIX: Hook for handling admin CRUD WebSocket events
 * Automatically refreshes stores when entities are created/updated/deleted
 *
 * AUDIT FIX: Uses useRef pattern to prevent listener accumulation.
 * The handler is stored in a ref and updated each render, but the
 * subscription only happens once (empty deps array).
 */

import { useEffect, useRef } from 'react'
import { dashboardWS, type WSEvent, type AdminEntityType } from '../services/websocket'
import { useCategoryStore } from '../stores/categoryStore'
import { useSubcategoryStore } from '../stores/subcategoryStore'
import { useProductStore } from '../stores/productStore'
import { useTableStore } from '../stores/tableStore'
import { useStaffStore } from '../stores/staffStore'
import { useAllergenStore } from '../stores/allergenStore'
import { usePromotionStore } from '../stores/promotionStore'
import { useBranchStore } from '../stores/branchStore'

interface UseAdminWebSocketOptions {
  /** Show toast notifications for changes (reserved for future use) */
  // LOW-03 FIX: Prefixed with underscore as this is reserved for future implementation
  _showNotifications?: boolean
  /** Callback when entity is deleted */
  onEntityDeleted?: (entityType: AdminEntityType, entityId: number) => void
}

/**
 * Hook for admin WebSocket connection — listens to ENTITY_CREATED/UPDATED/DELETED
 * and CASCADE_DELETE events, refreshing or pruning the matching Zustand stores.
 *
 * @param options.onEntityDeleted - Optional callback for entity-deleted / cascade-delete events.
 *   IMPORTANT: must be wrapped in `useCallback` to keep the reference stable across renders.
 *   The effect that updates the event-handler ref has `onEntityDeleted` in its dependency
 *   array; passing a new function on every render forces that effect to re-run needlessly.
 *   The WS subscription itself stays stable (empty deps), so this is purely a perf concern,
 *   but a non-memoized callback also breaks React Compiler's memoization assumptions.
 */
export function useAdminWebSocket(options: UseAdminWebSocketOptions = {}) {
  const { onEntityDeleted } = options

  // Get fetch functions from stores
  const fetchCategories = useCategoryStore((s) => s.fetchCategories)
  const fetchSubcategories = useSubcategoryStore((s) => s.fetchSubcategories)
  const fetchProducts = useProductStore((s) => s.fetchProducts)
  const fetchTables = useTableStore((s) => s.fetchTables)
  const fetchStaff = useStaffStore((s) => s.fetchStaff)
  const fetchAllergens = useAllergenStore((s) => s.fetchAllergens)
  const fetchPromotions = usePromotionStore((s) => s.fetchPromotions)
  const fetchBranches = useBranchStore((s) => s.fetchBranches)

  // Get delete functions from stores for optimistic updates
  const deleteCategory = useCategoryStore((s) => s.deleteCategory)
  const deleteSubcategory = useSubcategoryStore((s) => s.deleteSubcategory)
  const deleteProduct = useProductStore((s) => s.deleteProduct)
  const deleteTable = useTableStore((s) => s.deleteTable)
  const deleteStaff = useStaffStore((s) => s.deleteStaff)
  const deleteAllergen = useAllergenStore((s) => s.deleteAllergen)
  const deletePromotion = usePromotionStore((s) => s.deletePromotion)
  const deleteBranch = useBranchStore((s) => s.deleteBranch)

  // AUDIT FIX: Use ref for handler to prevent listener accumulation
  // This allows us to update the handler logic without re-subscribing
  const handleAdminEventRef = useRef<(event: WSEvent) => void>(() => {})

  // AUDIT FIX S0.6 (C17): Update ref inside useEffect to avoid side effect during render.
  // Previously this assignment happened during render which violates React's purity rules
  // and can fire twice in StrictMode.
  useEffect(() => {
    handleAdminEventRef.current = (event: WSEvent) => {
    const { type, entity } = event

    // Only handle admin CRUD events
    if (!['ENTITY_CREATED', 'ENTITY_UPDATED', 'ENTITY_DELETED', 'CASCADE_DELETE'].includes(type)) {
      return
    }

    const entityType = entity?.entity_type
    const entityId = entity?.entity_id

    if (!entityType) return

    // Helper to refresh a store based on entity type
    const refreshStore = (eType: AdminEntityType) => {
      switch (eType) {
        case 'branch':
          fetchBranches()
          break
        case 'category':
          fetchCategories()
          break
        case 'subcategory':
          fetchSubcategories()
          break
        case 'product':
          fetchProducts()
          break
        case 'table':
          fetchTables()
          break
        case 'staff':
          fetchStaff()
          break
        case 'allergen':
          fetchAllergens()
          break
        case 'promotion':
          fetchPromotions()
          break
      }
    }

    // Helper to remove an entity from local store
    const removeFromStore = (eType: AdminEntityType, eId: number) => {
      const stringId = String(eId)

      switch (eType) {
        case 'branch':
          deleteBranch(stringId)
          break
        case 'category':
          deleteCategory(stringId)
          break
        case 'subcategory':
          deleteSubcategory(stringId)
          break
        case 'product':
          deleteProduct(stringId)
          break
        case 'table':
          deleteTable(stringId)
          break
        case 'staff':
          deleteStaff(stringId)
          break
        case 'allergen':
          deleteAllergen(stringId)
          break
        case 'promotion':
          deletePromotion(stringId)
          break
      }
    }

    // Handle based on event type
    switch (type) {
      case 'ENTITY_CREATED':
      case 'ENTITY_UPDATED':
        // Refresh the affected store
        refreshStore(entityType)
        break

      case 'ENTITY_DELETED':
        // Optimistically remove from local store
        // MED-01 FIX: Check for number type instead of truthy (entityId could be 0)
        if (typeof entityId === 'number') {
          removeFromStore(entityType, entityId)
          onEntityDeleted?.(entityType, entityId)
        }
        break

      case 'CASCADE_DELETE':
        // Handle cascade delete - remove all affected entities
        // MED-01 FIX: Check for number type instead of truthy
        if (typeof entityId === 'number') {
          removeFromStore(entityType, entityId)
          onEntityDeleted?.(entityType, entityId)
        }

        // Also remove all affected child entities
        if (entity?.affected_entities) {
          for (const affected of entity.affected_entities) {
            removeFromStore(affected.type, affected.id)
          }
        }
        break
    }
    }
  }, [
    fetchCategories, fetchSubcategories, fetchProducts, fetchTables,
    fetchStaff, fetchAllergens, fetchPromotions, fetchBranches,
    deleteCategory, deleteSubcategory, deleteProduct, deleteTable,
    deleteStaff, deleteAllergen, deletePromotion, deleteBranch,
    onEntityDeleted,
  ])

  // AUDIT FIX: Subscribe only ONCE with stable callback that delegates to ref
  // Empty deps ensures we subscribe once and unsubscribe on unmount
  useEffect(() => {
    const unsubscribe = dashboardWS.on('*', (event) => {
      handleAdminEventRef.current(event)
    })

    // WS-31-MED-05 FIX: HMR cleanup guard for development
    // Ensures listener is removed during hot module replacement
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubscribe()
      })
    }

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
