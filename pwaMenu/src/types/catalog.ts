// ============================================
// Category & Subcategory Types
// ============================================

export interface Category {
  id: string
  name: string
  icon?: string
  image?: string
  order: number
  branch_id: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface Subcategory {
  id: string
  name: string
  category_id: string
  image?: string
  order: number
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface CategoryFormData {
  name: string
  icon?: string
  image?: string
  order: number
  branch_id: string
  is_active: boolean
}

export interface SubcategoryFormData {
  name: string
  category_id: string
  image?: string
  order: number
  is_active: boolean
}

// ============================================
// Allergen Types
// ============================================

export interface Allergen {
  id: string
  name: string
  icon?: string
  description?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface AllergenFormData {
  name: string
  icon?: string
  description?: string
  is_active: boolean
}

// ============================================
// Product Types
// ============================================

// Branch price for products (per-branch pricing)
export interface BranchPrice {
  branch_id: string
  price: number
  is_active: boolean  // true = product is sold at this branch
}

export interface Product {
  id: string
  name: string
  description: string
  price: number                    // Base price (used when use_branch_prices is false)
  branch_prices?: BranchPrice[]    // Per-branch pricing (optional, defaults to [])
  use_branch_prices: boolean       // Toggle for per-branch pricing mode
  image?: string                   // Optional image URL
  category_id: string
  subcategory_id: string
  featured: boolean
  popular: boolean
  badge?: string
  allergen_ids?: string[]          // Optional, defaults to []
  is_available?: boolean           // false = product is sold out (Agotado)
  is_active?: boolean
  stock?: number
  created_at?: string
  updated_at?: string
}

export interface ProductFormData {
  name: string
  description: string
  price: number                    // Base price
  branch_prices: BranchPrice[]     // Per-branch pricing
  use_branch_prices: boolean       // Toggle for per-branch pricing mode
  image?: string                   // Optional image URL
  category_id: string
  subcategory_id: string
  featured: boolean
  popular: boolean
  badge?: string
  allergen_ids: string[]
  is_active: boolean
  stock?: number
}
