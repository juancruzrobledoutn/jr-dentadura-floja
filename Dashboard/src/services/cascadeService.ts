/**
 * Cascade Delete Service
 * Centralizes all cascade delete operations to ensure data integrity
 * and provide transactional-like behavior for related entity cleanup.
 *
 * A005 FIX: Now implements snapshot/restore pattern for atomic operations
 *
 * Uses dependency injection pattern for store access to enable:
 * - Better testability (mock stores in tests)
 * - Loose coupling (service doesn't directly depend on store implementations)
 * - Flexibility (can work with different store implementations)
 */

import type { Branch, Category, Subcategory, Product, Allergen, PromotionType, Promotion, RestaurantTable, OrderHistory, Staff } from '../types'
import { logWarning, logError } from '../utils/logger'

/**
 * A005 FIX: Snapshot interface for storing state before cascade operations
 */
interface CascadeSnapshot {
  branches?: Branch[]
  categories?: Category[]
  subcategories?: Subcategory[]
  products?: Product[]
  tables?: RestaurantTable[]
  promotions?: Promotion[]
  staff?: Staff[]
  orderHistory?: OrderHistory[]
}

/**
 * Store interfaces for dependency injection
 * These define the minimal contract needed by the cascade service
 * A005 FIX: Added optional setters for rollback support
 */
export interface BranchStoreActions {
  branches: Branch[]
  deleteBranch: (id: string) => void
  setBranches?: (branches: Branch[]) => void // A005 FIX: Optional setter for rollback
}

export interface CategoryStoreActions {
  categories: Category[]
  getByBranch: (branchId: string) => Category[]
  deleteByBranch: (branchId: string) => void
  deleteCategory: (id: string) => void
  setCategories?: (categories: Category[]) => void // A005 FIX
}

export interface SubcategoryStoreActions {
  subcategories: Subcategory[]
  getByCategory: (categoryId: string) => Subcategory[]
  deleteByCategories: (categoryIds: string[]) => void
  deleteByCategory: (categoryId: string) => void
  deleteSubcategory: (id: string) => void
  setSubcategories?: (subcategories: Subcategory[]) => void // A005 FIX
}

export interface ProductStoreActions {
  products: Product[]
  getByCategory: (categoryId: string) => Product[]
  getBySubcategory: (subcategoryId: string) => Product[]
  deleteByCategories: (categoryIds: string[]) => void
  deleteByCategory: (categoryId: string) => void
  deleteBySubcategory: (subcategoryId: string) => void
  deleteProduct: (id: string) => void
  removeAllergenFromProducts: (allergenId: string) => void
  removeBranchFromProductPrices: (branchId: string) => void
  setProducts?: (products: Product[]) => void // A005 FIX
}

export interface PromotionStoreActions {
  promotions: Promotion[]
  removeProductFromPromotions: (productId: string) => void
  removeBranchFromPromotions: (branchId: string) => void
  clearPromotionType: (promotionTypeId: string) => void
  setPromotions?: (promotions: Promotion[]) => void // A005 FIX
}

export interface TableStoreActions {
  tables: RestaurantTable[]
  getByBranch: (branchId: string) => RestaurantTable[]
  deleteByBranch: (branchId: string) => void
  setTables?: (tables: RestaurantTable[]) => void // A005 FIX
}

export interface OrderHistoryStoreActions {
  orderHistory: OrderHistory[]
  deleteByBranch: (branchId: string) => void
  setOrderHistory?: (orderHistory: OrderHistory[]) => void // A005 FIX
}

export interface PromotionTypeStoreActions {
  promotionTypes: PromotionType[]
  deletePromotionType: (id: string) => void
}

export interface AllergenStoreActions {
  allergens: Allergen[]
  deleteAllergen: (id: string) => void
}

/**
 * A005 FIX: Capture snapshot before cascade delete for rollback
 */
function captureSnapshotForBranch(stores: {
  branch: BranchStoreActions
  category: CategoryStoreActions
  subcategory: SubcategoryStoreActions
  product: ProductStoreActions
  promotion: PromotionStoreActions
  table: TableStoreActions
  orderHistory: OrderHistoryStoreActions
}): CascadeSnapshot {
  return {
    branches: [...stores.branch.branches],
    categories: [...stores.category.categories],
    subcategories: [...stores.subcategory.subcategories],
    products: [...stores.product.products],
    tables: [...stores.table.tables],
    promotions: [...stores.promotion.promotions],
    orderHistory: [...stores.orderHistory.orderHistory],
  }
}

/**
 * A005 FIX: Restore snapshot on error during cascade delete
 */
function restoreSnapshotForBranch(
  snapshot: CascadeSnapshot,
  stores: {
    branch: BranchStoreActions
    category: CategoryStoreActions
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
    table: TableStoreActions
    orderHistory: OrderHistoryStoreActions
  }
): void {
  if (snapshot.branches && stores.branch.setBranches) {
    stores.branch.setBranches(snapshot.branches)
  }
  if (snapshot.categories && stores.category.setCategories) {
    stores.category.setCategories(snapshot.categories)
  }
  if (snapshot.subcategories && stores.subcategory.setSubcategories) {
    stores.subcategory.setSubcategories(snapshot.subcategories)
  }
  if (snapshot.products && stores.product.setProducts) {
    stores.product.setProducts(snapshot.products)
  }
  if (snapshot.tables && stores.table.setTables) {
    stores.table.setTables(snapshot.tables)
  }
  if (snapshot.promotions && stores.promotion.setPromotions) {
    stores.promotion.setPromotions(snapshot.promotions)
  }
  if (snapshot.orderHistory && stores.orderHistory.setOrderHistory) {
    stores.orderHistory.setOrderHistory(snapshot.orderHistory)
  }
}

/**
 * Result of a cascade delete operation
 */
export interface CascadeDeleteResult {
  success: boolean
  deletedCounts: {
    categories?: number
    subcategories?: number
    products?: number
    promotions?: number
    tables?: number
    orderHistory?: number
  }
  error?: string
}

/**
 * DASH-006: Preview of items affected by cascade delete
 * Shows specific item names/details before confirming deletion
 */
export interface CascadePreviewItem {
  type: 'category' | 'subcategory' | 'product' | 'table' | 'promotion' | 'orderHistory'
  id: string
  name: string
}

export interface CascadePreview {
  categories: CascadePreviewItem[]
  subcategories: CascadePreviewItem[]
  products: CascadePreviewItem[]
  tables: CascadePreviewItem[]
  promotions: CascadePreviewItem[]
  orderHistoryCount: number
  totalItems: number
}

/**
 * Validates that an entity exists before attempting cascade delete
 */
function validateExists<T extends { id: string }>(
  items: T[],
  id: string,
  entityName: string
): T | null {
  const item = items.find((i) => i.id === id)
  if (!item) {
    // SPRINT 8: Use centralized logger instead of console.warn
    logWarning(`${entityName} with id ${id} not found for cascade delete`, 'cascadeService')
    return null
  }
  return item
}

/**
 * Cascade delete a branch and all related data
 * Order: promotions cleanup → products → subcategories → categories → tables → orderHistory → branch
 */
export function cascadeDeleteBranch(
  branchId: string,
  stores: {
    branch: BranchStoreActions
    category: CategoryStoreActions
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
    table: TableStoreActions
    orderHistory: OrderHistoryStoreActions
  }
): CascadeDeleteResult {
  const { branch: branchStore, category: categoryStore, subcategory: subcategoryStore, product: productStore, promotion: promotionStore, table: tableStore, orderHistory: orderHistoryStore } = stores

  // Validate branch exists
  const branch = validateExists(branchStore.branches, branchId, 'Branch')
  if (!branch) {
    return { success: false, deletedCounts: {}, error: 'Branch not found' }
  }

  // A005 FIX: Capture snapshot before operations
  const snapshot = captureSnapshotForBranch(stores)

  try {
    // Get all categories for this branch
    const branchCategories = categoryStore.getByBranch(branchId)
    const categoryIds = branchCategories.map((c) => c.id)

    // Count subcategories BEFORE deletion
    let subcategoriesCount = 0
    categoryIds.forEach((catId) => {
      subcategoriesCount += subcategoryStore.getByCategory(catId).length
    })

    // Count products BEFORE deletion
    const productsToDelete: string[] = []
    categoryIds.forEach((catId) => {
      const products = productStore.getByCategory(catId)
      productsToDelete.push(...products.map((p) => p.id))
    })

    // Count tables BEFORE deletion
    const tablesCount = tableStore.getByBranch(branchId).length

    // Count order history BEFORE deletion
    const orderHistoryCount = orderHistoryStore.orderHistory.filter((h) => h.branch_id === branchId).length

    // 1. Clean products from promotions (removes empty promotions automatically)
    productsToDelete.forEach((productId) => {
      promotionStore.removeProductFromPromotions(productId)
    })

    // 2. Remove branch from remaining promotions
    promotionStore.removeBranchFromPromotions(branchId)

    // 3. Delete products by categories
    if (categoryIds.length > 0) {
      productStore.deleteByCategories(categoryIds)
    }

    // 4. Delete subcategories by categories
    if (categoryIds.length > 0) {
      subcategoryStore.deleteByCategories(categoryIds)
    }

    // 5. Delete categories
    categoryStore.deleteByBranch(branchId)

    // 6. Remove branch from product prices (for products in OTHER branches)
    productStore.removeBranchFromProductPrices(branchId)

    // 7. Delete tables
    tableStore.deleteByBranch(branchId)

    // 8. Delete order history
    orderHistoryStore.deleteByBranch(branchId)

    // 9. Finally delete the branch
    branchStore.deleteBranch(branchId)

    return {
      success: true,
      deletedCounts: {
        categories: branchCategories.length,
        subcategories: subcategoriesCount,
        products: productsToDelete.length,
        tables: tablesCount,
        orderHistory: orderHistoryCount,
      },
    }
  } catch (error) {
    // A005 FIX: Restore snapshot on error
    logError('Cascade delete branch failed, restoring snapshot', 'cascadeService')
    restoreSnapshotForBranch(snapshot, stores)
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

/**
 * Cascade delete a category and all related data
 * Order: promotions cleanup → products → subcategories → category
 */
export function cascadeDeleteCategory(
  categoryId: string,
  stores: {
    category: CategoryStoreActions
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
  }
): CascadeDeleteResult {
  const { category: categoryStore, subcategory: subcategoryStore, product: productStore, promotion: promotionStore } = stores

  // Validate category exists
  const categories = categoryStore.categories
  const category = validateExists(categories, categoryId, 'Category')
  if (!category) {
    return { success: false, deletedCounts: {}, error: 'Category not found' }
  }

  try {
    // Get products in this category to clean up promotions
    const products = productStore.getByCategory(categoryId)

    // Count subcategories BEFORE deletion
    const subcategoriesCount = subcategoryStore.getByCategory(categoryId).length

    // 1. Clean products from promotions
    products.forEach((product) => {
      promotionStore.removeProductFromPromotions(product.id)
    })

    // 2. Delete products
    productStore.deleteByCategory(categoryId)

    // 3. Delete subcategories
    subcategoryStore.deleteByCategory(categoryId)

    // 4. Delete category
    categoryStore.deleteCategory(categoryId)

    return {
      success: true,
      deletedCounts: {
        products: products.length,
        subcategories: subcategoriesCount,
      },
    }
  } catch (error) {
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

/**
 * Cascade delete a subcategory and all related products
 * Order: promotions cleanup → products → subcategory
 */
export function cascadeDeleteSubcategory(
  subcategoryId: string,
  stores: {
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
  }
): CascadeDeleteResult {
  const { subcategory: subcategoryStore, product: productStore, promotion: promotionStore } = stores

  // Validate subcategory exists
  const subcategories = subcategoryStore.subcategories
  const subcategory = validateExists(subcategories, subcategoryId, 'Subcategory')
  if (!subcategory) {
    return { success: false, deletedCounts: {}, error: 'Subcategory not found' }
  }

  try {
    // Get products in this subcategory
    const products = productStore.getBySubcategory(subcategoryId)

    // 1. Clean products from promotions
    products.forEach((product) => {
      promotionStore.removeProductFromPromotions(product.id)
    })

    // 2. Delete products
    productStore.deleteBySubcategory(subcategoryId)

    // 3. Delete subcategory
    subcategoryStore.deleteSubcategory(subcategoryId)

    return {
      success: true,
      deletedCounts: {
        products: products.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

/**
 * Delete a product and clean up promotions
 * Order: promotions cleanup → product
 */
export function cascadeDeleteProduct(
  productId: string,
  stores: {
    product: ProductStoreActions
    promotion: PromotionStoreActions
  }
): CascadeDeleteResult {
  const { product: productStore, promotion: promotionStore } = stores

  // Validate product exists
  const products = productStore.products
  const product = validateExists(products, productId, 'Product')
  if (!product) {
    return { success: false, deletedCounts: {}, error: 'Product not found' }
  }

  try {
    // 1. Clean product from promotions (removes empty promotions automatically)
    promotionStore.removeProductFromPromotions(productId)

    // 2. Delete product
    productStore.deleteProduct(productId)

    return {
      success: true,
      deletedCounts: {
        products: 1,
      },
    }
  } catch (error) {
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

/**
 * Delete an allergen and clean up product references
 * Order: product cleanup → allergen
 */
export function cascadeDeleteAllergen(
  allergenId: string,
  stores: {
    allergen: AllergenStoreActions
    product: ProductStoreActions
  }
): CascadeDeleteResult {
  const { allergen: allergenStore, product: productStore } = stores

  // Validate allergen exists
  const allergens = allergenStore.allergens
  const allergen = validateExists(allergens, allergenId, 'Allergen')
  if (!allergen) {
    return { success: false, deletedCounts: {}, error: 'Allergen not found' }
  }

  try {
    // 1. Remove allergen from all products
    productStore.removeAllergenFromProducts(allergenId)

    // 2. Delete allergen
    allergenStore.deleteAllergen(allergenId)

    return {
      success: true,
      deletedCounts: {},
    }
  } catch (error) {
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

/**
 * Delete a promotion type and all related promotions
 * Order: promotions → promotion type
 */
export function cascadeDeletePromotionType(
  promotionTypeId: string,
  stores: {
    promotionType: PromotionTypeStoreActions
    promotion: PromotionStoreActions
  }
): CascadeDeleteResult {
  const { promotionType: promotionTypeStore, promotion: promotionStore } = stores

  // Validate promotion type exists
  const promotionTypes = promotionTypeStore.promotionTypes
  const promotionType = validateExists(promotionTypes, promotionTypeId, 'PromotionType')
  if (!promotionType) {
    return { success: false, deletedCounts: {}, error: 'Promotion type not found' }
  }

  try {
    // Count promotions that will be deleted
    const promotionsToDelete = promotionStore.promotions.filter(
      (p) => p.promotion_type_id === promotionTypeId
    ).length

    // 1. Delete all promotions with this type
    promotionStore.clearPromotionType(promotionTypeId)

    // 2. Delete promotion type
    promotionTypeStore.deletePromotionType(promotionTypeId)

    return {
      success: true,
      deletedCounts: {
        promotions: promotionsToDelete,
      },
    }
  } catch (error) {
    return {
      success: false,
      deletedCounts: {},
      error: error instanceof Error ? error.message : 'Unknown error during cascade delete',
    }
  }
}

// ============================================================================
// DASH-006: Preview functions to show what will be deleted
// ============================================================================

/**
 * Get preview of what will be deleted when deleting a category
 */
export function getCategoryDeletePreview(
  categoryId: string,
  stores: {
    category: CategoryStoreActions
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
  }
): CascadePreview | null {
  const { category: categoryStore, subcategory: subcategoryStore, product: productStore, promotion: promotionStore } = stores

  const category = categoryStore.categories.find((c) => c.id === categoryId)
  if (!category) return null

  const subcategories = subcategoryStore.getByCategory(categoryId)
  const products = productStore.getByCategory(categoryId)

  // C003 FIX: Find promotions affected by these products using items[] not product_ids
  const productIds = new Set(products.map((p) => p.id))
  const affectedPromotions = promotionStore.promotions.filter((promo) =>
    promo.items.some((item) => productIds.has(item.product_id))
  )

  return {
    categories: [],
    subcategories: subcategories.map((s) => ({ type: 'subcategory' as const, id: s.id, name: s.name })),
    products: products.map((p) => ({ type: 'product' as const, id: p.id, name: p.name })),
    tables: [],
    promotions: affectedPromotions.map((p) => ({ type: 'promotion' as const, id: p.id, name: p.name })),
    orderHistoryCount: 0,
    totalItems: subcategories.length + products.length + affectedPromotions.length,
  }
}

/**
 * Get preview of what will be deleted when deleting a subcategory
 */
export function getSubcategoryDeletePreview(
  subcategoryId: string,
  stores: {
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
  }
): CascadePreview | null {
  const { subcategory: subcategoryStore, product: productStore, promotion: promotionStore } = stores

  const subcategory = subcategoryStore.subcategories.find((s) => s.id === subcategoryId)
  if (!subcategory) return null

  const products = productStore.getBySubcategory(subcategoryId)

  // C003 FIX: Find promotions affected by these products using items[] not product_ids
  const productIds = new Set(products.map((p) => p.id))
  const affectedPromotions = promotionStore.promotions.filter((promo) =>
    promo.items.some((item) => productIds.has(item.product_id))
  )

  return {
    categories: [],
    subcategories: [],
    products: products.map((p) => ({ type: 'product' as const, id: p.id, name: p.name })),
    tables: [],
    promotions: affectedPromotions.map((p) => ({ type: 'promotion' as const, id: p.id, name: p.name })),
    orderHistoryCount: 0,
    totalItems: products.length + affectedPromotions.length,
  }
}

/**
 * Get preview of what will be deleted when deleting a branch
 */
export function getBranchDeletePreview(
  branchId: string,
  stores: {
    branch: BranchStoreActions
    category: CategoryStoreActions
    subcategory: SubcategoryStoreActions
    product: ProductStoreActions
    promotion: PromotionStoreActions
    table: TableStoreActions
    orderHistory: OrderHistoryStoreActions
  }
): CascadePreview | null {
  const { branch: branchStore, category: categoryStore, subcategory: subcategoryStore, product: productStore, table: tableStore, orderHistory: orderHistoryStore } = stores

  const branch = branchStore.branches.find((b) => b.id === branchId)
  if (!branch) return null

  const categories = categoryStore.getByBranch(branchId)
  const categoryIds = categories.map((c) => c.id)

  // Get all subcategories for these categories
  const subcategories: { id: string; name: string }[] = []
  categoryIds.forEach((catId) => {
    subcategoryStore.getByCategory(catId).forEach((s) => {
      subcategories.push({ id: s.id, name: s.name })
    })
  })

  // Get all products for these categories
  const products: { id: string; name: string }[] = []
  categoryIds.forEach((catId) => {
    productStore.getByCategory(catId).forEach((p) => {
      products.push({ id: p.id, name: p.name })
    })
  })

  const tables = tableStore.getByBranch(branchId)
  const orderHistoryCount = orderHistoryStore.orderHistory.filter((h) => h.branch_id === branchId).length

  return {
    categories: categories.map((c) => ({ type: 'category' as const, id: c.id, name: c.name })),
    subcategories: subcategories.map((s) => ({ type: 'subcategory' as const, id: s.id, name: s.name })),
    products: products.map((p) => ({ type: 'product' as const, id: p.id, name: p.name })),
    tables: tables.map((t) => ({ type: 'table' as const, id: t.id, name: t.label })),
    promotions: [],
    orderHistoryCount,
    totalItems: categories.length + subcategories.length + products.length + tables.length + orderHistoryCount,
  }
}

/**
 * Get preview of what will be deleted when deleting a promotion type
 */
export function getPromotionTypeDeletePreview(
  promotionTypeId: string,
  stores: {
    promotionType: PromotionTypeStoreActions
    promotion: PromotionStoreActions
  }
): CascadePreview | null {
  const { promotionType: promotionTypeStore, promotion: promotionStore } = stores

  const promotionType = promotionTypeStore.promotionTypes.find((pt) => pt.id === promotionTypeId)
  if (!promotionType) return null

  const promotions = promotionStore.promotions.filter((p) => p.promotion_type_id === promotionTypeId)

  return {
    categories: [],
    subcategories: [],
    products: [],
    tables: [],
    promotions: promotions.map((p) => ({ type: 'promotion' as const, id: p.id, name: p.name })),
    orderHistoryCount: 0,
    totalItems: promotions.length,
  }
}

/**
 * Get preview of products affected when deleting an allergen
 */
export function getAllergenDeletePreview(
  allergenId: string,
  stores: {
    allergen: AllergenStoreActions
    product: ProductStoreActions
  }
): CascadePreview | null {
  const { allergen: allergenStore, product: productStore } = stores

  const allergen = allergenStore.allergens.find((a) => a.id === allergenId)
  if (!allergen) return null

  // Find products that have this allergen
  const affectedProducts = productStore.products.filter((p) =>
    p.allergen_ids.includes(allergenId)
  )

  return {
    categories: [],
    subcategories: [],
    products: affectedProducts.map((p) => ({ type: 'product' as const, id: p.id, name: p.name })),
    tables: [],
    promotions: [],
    orderHistoryCount: 0,
    totalItems: affectedProducts.length,
  }
}

// ============================================================================
// Convenience functions that use the actual Zustand stores
// These provide backward compatibility and easy usage in components
// ============================================================================

import { useBranchStore } from '../stores/branchStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useSubcategoryStore } from '../stores/subcategoryStore'
import { useProductStore } from '../stores/productStore'
import { usePromotionStore } from '../stores/promotionStore'
import { useTableStore } from '../stores/tableStore'
import { useOrderHistoryStore } from '../stores/orderHistoryStore'
import { usePromotionTypeStore } from '../stores/promotionTypeStore'
import { useAllergenStore } from '../stores/allergenStore'

/**
 * Helper to get all store states for cascade operations
 */
function getStoreStates() {
  return {
    branch: useBranchStore.getState(),
    category: useCategoryStore.getState(),
    subcategory: useSubcategoryStore.getState(),
    product: useProductStore.getState(),
    promotion: usePromotionStore.getState(),
    table: useTableStore.getState(),
    orderHistory: useOrderHistoryStore.getState(),
    promotionType: usePromotionTypeStore.getState(),
    allergen: useAllergenStore.getState(),
  }
}

/** Convenience wrapper for cascadeDeleteBranch using actual stores */
export function deleteBranchWithCascade(branchId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeleteBranch(branchId, stores)
}

/** Convenience wrapper for cascadeDeleteCategory using actual stores */
export function deleteCategoryWithCascade(categoryId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeleteCategory(categoryId, stores)
}

/** Convenience wrapper for cascadeDeleteSubcategory using actual stores */
export function deleteSubcategoryWithCascade(subcategoryId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeleteSubcategory(subcategoryId, stores)
}

/** Convenience wrapper for cascadeDeleteProduct using actual stores */
export function deleteProductWithCascade(productId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeleteProduct(productId, stores)
}

/** Convenience wrapper for cascadeDeleteAllergen using actual stores */
export function deleteAllergenWithCascade(allergenId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeleteAllergen(allergenId, stores)
}

/** Convenience wrapper for cascadeDeletePromotionType using actual stores */
export function deletePromotionTypeWithCascade(promotionTypeId: string): CascadeDeleteResult {
  const stores = getStoreStates()
  return cascadeDeletePromotionType(promotionTypeId, stores)
}

// ============================================================================
// DASH-006: Convenience wrappers for preview functions
// ============================================================================

/** Get preview of items affected when deleting a category */
export function getCategoryPreview(categoryId: string): CascadePreview | null {
  const stores = getStoreStates()
  return getCategoryDeletePreview(categoryId, stores)
}

/** Get preview of items affected when deleting a subcategory */
export function getSubcategoryPreview(subcategoryId: string): CascadePreview | null {
  const stores = getStoreStates()
  return getSubcategoryDeletePreview(subcategoryId, stores)
}

/** Get preview of items affected when deleting a branch */
export function getBranchPreview(branchId: string): CascadePreview | null {
  const stores = getStoreStates()
  return getBranchDeletePreview(branchId, stores)
}

/** Get preview of items affected when deleting a promotion type */
export function getPromotionTypePreview(promotionTypeId: string): CascadePreview | null {
  const stores = getStoreStates()
  return getPromotionTypeDeletePreview(promotionTypeId, stores)
}

/** Get preview of products affected when deleting an allergen */
export function getAllergenPreview(allergenId: string): CascadePreview | null {
  const stores = getStoreStates()
  return getAllergenDeletePreview(allergenId, stores)
}
