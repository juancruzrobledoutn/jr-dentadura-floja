/**
 * @deprecated VERCEL-APP-FIX (bundle-barrel-imports): Avoid importing from this barrel file.
 * Import pages directly from their source files for better tree-shaking.
 * Example: import { DashboardPage } from './Dashboard'
 * 
 * NOTE: App.tsx already uses lazy(() => import('./pages/X')) which bypasses this barrel.
 * This deprecation helps prevent future misuse.
 */

export { DashboardPage } from './Dashboard'
export { RestaurantPage } from './Restaurant'
export { BranchesPage } from './Branches'
export { TablesPage } from './Tables'
export { default as StaffPage } from './Staff'
export { OrdersPage } from './Orders'
export { CategoriesPage } from './Categories'
export { SubcategoriesPage } from './Subcategories'
export { ProductsPage } from './Products'
export { PricesPage } from './Prices'
export { AllergensPage } from './Allergens'
export { PromotionTypesPage } from './PromotionTypes'
export { PromotionsPage } from './Promotions'
export { SettingsPage } from './Settings'
export { SalesPage } from './Sales'
export { HistoryBranchesPage } from './HistoryBranches'
export { HistoryCustomersPage } from './HistoryCustomers'
