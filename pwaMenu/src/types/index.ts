// ============================================
// Type Exports - Organized by Domain
// ============================================
// This file re-exports all types from domain-specific modules
// for backwards compatibility with existing imports.

// Catalog (Categories, Products, Allergens)
export type {
  Category,
  Subcategory,
  CategoryFormData,
  SubcategoryFormData,
  Allergen,
  AllergenFormData,
  BranchPrice,
  Product,
  ProductFormData,
} from './catalog'

// PWA Session (Diners, Cart, Orders, Payments, Round Confirmation)
export type {
  Diner,
  CartItem,
  AddToCartInput,
  TableSession,
  SessionStatus,
  OrderStatus,
  OrderRecord,
  OrderState,
  PaymentMethod,
  SplitMethod,
  PaymentShare,
  TablePayment,
  Order,
  DinerReadyStatus,
  RoundConfirmationStatus,
  RoundConfirmation,
} from './session'

// UI Components
export type {
  TableColumn,
  Toast,
} from './ui'
