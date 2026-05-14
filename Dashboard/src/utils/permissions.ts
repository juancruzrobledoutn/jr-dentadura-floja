/**
 * Role-based permission utilities for Dashboard.
 *
 * Permission rules:
 * - ADMIN: Full access to all operations including delete (soft delete)
 * - MANAGER: Can create/edit staff, tables, allergens, promotions, badges, seals, promotion types
 *            CANNOT create/edit/delete categories, subcategories, products, branches, or roles
 * - KITCHEN: Read-only access, cannot create/edit/delete anything
 * - WAITER: Read-only access, cannot create/edit/delete anything
 */

export type Role = 'ADMIN' | 'MANAGER' | 'KITCHEN' | 'WAITER'

/**
 * Check if user has ADMIN role
 */
export function isAdmin(roles: string[]): boolean {
  return roles.includes('ADMIN')
}

/**
 * Check if user has MANAGER role
 */
export function isManager(roles: string[]): boolean {
  return roles.includes('MANAGER')
}

/**
 * Check if user has ADMIN or MANAGER role
 */
export function isAdminOrManager(roles: string[]): boolean {
  return roles.includes('ADMIN') || roles.includes('MANAGER')
}

// =============================================================================
// Delete Permissions - ADMIN only
// =============================================================================

/**
 * Only ADMIN can delete any entity (soft delete)
 */
export function canDelete(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Branch Permissions - ADMIN only for create
// =============================================================================

/**
 * Only ADMIN can create branches
 */
export function canCreateBranch(roles: string[]): boolean {
  return isAdmin(roles)
}

/**
 * ADMIN and MANAGER can edit branches
 */
export function canEditBranch(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * Only ADMIN can delete branches
 */
export function canDeleteBranch(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Category Permissions - ADMIN only
// =============================================================================

/**
 * Only ADMIN can create categories
 */
export function canCreateCategory(roles: string[]): boolean {
  return isAdmin(roles)
}

/**
 * Only ADMIN can edit categories
 */
export function canEditCategory(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Subcategory Permissions - ADMIN only
// =============================================================================

/**
 * Only ADMIN can create subcategories
 */
export function canCreateSubcategory(roles: string[]): boolean {
  return isAdmin(roles)
}

/**
 * Only ADMIN can edit subcategories
 */
export function canEditSubcategory(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Product Permissions - ADMIN only
// =============================================================================

/**
 * Only ADMIN can create products
 */
export function canCreateProduct(roles: string[]): boolean {
  return isAdmin(roles)
}

/**
 * Only ADMIN can edit products
 */
export function canEditProduct(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Staff Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create staff
 */
export function canCreateStaff(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit staff
 */
export function canEditStaff(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Table Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create tables
 */
export function canCreateTable(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit tables
 */
export function canEditTable(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Allergen Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create allergens
 */
export function canCreateAllergen(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit allergens
 */
export function canEditAllergen(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Promotion Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create promotions
 */
export function canCreatePromotion(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit promotions
 */
export function canEditPromotion(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Badge Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create badges
 */
export function canCreateBadge(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit badges
 */
export function canEditBadge(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Seal Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create seals
 */
export function canCreateSeal(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit seals
 */
export function canEditSeal(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Promotion Type Permissions
// =============================================================================

/**
 * ADMIN and MANAGER can create promotion types
 */
export function canCreatePromotionType(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * ADMIN and MANAGER can edit promotion types
 */
export function canEditPromotionType(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Role Permissions (system roles)
// =============================================================================

/**
 * Only ADMIN can manage system roles
 */
export function canCreateRole(roles: string[]): boolean {
  return isAdmin(roles)
}

/**
 * Only ADMIN can edit system roles
 */
export function canEditRole(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Restaurant/Tenant Permissions
// =============================================================================

/**
 * Only ADMIN can edit restaurant settings
 */
export function canEditRestaurant(roles: string[]): boolean {
  return isAdmin(roles)
}

// =============================================================================
// Page Access Permissions
// =============================================================================

/**
 * Check if user can access the Branches management page
 * Only ADMIN can fully manage branches (create/delete)
 * MANAGER can view and edit
 */
export function canAccessBranchesPage(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * Check if user can access any CRUD page
 * KITCHEN and WAITER have limited access
 */
export function canAccessCrudPage(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

/**
 * Check if user can access Kitchen page (everyone can see it for read)
 */
export function canAccessKitchenPage(roles: string[]): boolean {
  return roles.length > 0 // Any authenticated user
}

/**
 * Check if user has any management permissions
 */
export function hasManagementAccess(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// =============================================================================
// Recipe Permissions - KITCHEN, MANAGER, ADMIN can manage recipes
// =============================================================================

/**
 * Check if user has KITCHEN role
 */
export function isKitchen(roles: string[]): boolean {
  return roles.includes('KITCHEN')
}

/**
 * KITCHEN, MANAGER, and ADMIN can create recipes
 */
export function canCreateRecipe(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles) || isKitchen(roles)
}

/**
 * KITCHEN, MANAGER, and ADMIN can edit recipes
 */
export function canEditRecipe(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles) || isKitchen(roles)
}

/**
 * KITCHEN, MANAGER, and ADMIN can delete recipes
 */
export function canDeleteRecipe(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles) || isKitchen(roles)
}

/**
 * KITCHEN, MANAGER, and ADMIN can access the Recipes page
 */
export function canAccessRecipesPage(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles) || isKitchen(roles)
}
