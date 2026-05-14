/**
 * SPRINT 7: Validation utilities test suite
 *
 * Comprehensive tests for all validation functions covering:
 * - Edge cases (empty, null, undefined, extreme values)
 * - Valid inputs
 * - Invalid inputs
 * - Boundary conditions
 */

import { describe, it, expect } from 'vitest'
import {
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  validateRestaurant,
  validateBranch,
  validateCategory,
  validateProduct,
  validatePromotion,
  validateStaff,
  validateRole,
} from './validation'
import type {
  RestaurantFormData,
  BranchFormData,
  CategoryFormData,
  ProductFormData,
  PromotionFormData,
} from '../types'
import type { CreateStaffData } from '../types/staff'
import type { CreateRoleData } from '../types/role'

describe('Number Validation Functions', () => {
  describe('isValidNumber', () => {
    it('should return true for valid finite numbers', () => {
      expect(isValidNumber(0)).toBe(true)
      expect(isValidNumber(1)).toBe(true)
      expect(isValidNumber(-1)).toBe(true)
      expect(isValidNumber(3.14)).toBe(true)
      expect(isValidNumber(-999.99)).toBe(true)
      expect(isValidNumber(Number.MAX_SAFE_INTEGER)).toBe(true)
      expect(isValidNumber(Number.MIN_SAFE_INTEGER)).toBe(true)
    })

    it('should return false for NaN', () => {
      expect(isValidNumber(NaN)).toBe(false)
      expect(isValidNumber(Number.NaN)).toBe(false)
    })

    it('should return false for Infinity', () => {
      expect(isValidNumber(Infinity)).toBe(false)
      expect(isValidNumber(-Infinity)).toBe(false)
      expect(isValidNumber(Number.POSITIVE_INFINITY)).toBe(false)
      expect(isValidNumber(Number.NEGATIVE_INFINITY)).toBe(false)
    })

    it('should return false for non-numbers', () => {
      expect(isValidNumber('123')).toBe(false)
      expect(isValidNumber('0')).toBe(false)
      expect(isValidNumber(null)).toBe(false)
      expect(isValidNumber(undefined)).toBe(false)
      expect(isValidNumber(true)).toBe(false)
      expect(isValidNumber({})).toBe(false)
      expect(isValidNumber([])).toBe(false)
    })
  })

  describe('isPositiveNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isPositiveNumber(1)).toBe(true)
      expect(isPositiveNumber(0.1)).toBe(true)
      expect(isPositiveNumber(999.99)).toBe(true)
      expect(isPositiveNumber(Number.MAX_SAFE_INTEGER)).toBe(true)
    })

    it('should return false for zero', () => {
      expect(isPositiveNumber(0)).toBe(false)
      expect(isPositiveNumber(-0)).toBe(false)
    })

    it('should return false for negative numbers', () => {
      expect(isPositiveNumber(-1)).toBe(false)
      expect(isPositiveNumber(-0.1)).toBe(false)
      expect(isPositiveNumber(Number.MIN_SAFE_INTEGER)).toBe(false)
    })

    it('should return false for invalid numbers', () => {
      expect(isPositiveNumber(NaN)).toBe(false)
      expect(isPositiveNumber(Infinity)).toBe(false)
      expect(isPositiveNumber('1')).toBe(false)
    })
  })

  describe('isNonNegativeNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isNonNegativeNumber(1)).toBe(true)
      expect(isNonNegativeNumber(0.1)).toBe(true)
      expect(isNonNegativeNumber(999.99)).toBe(true)
    })

    it('should return true for zero', () => {
      expect(isNonNegativeNumber(0)).toBe(true)
      expect(isNonNegativeNumber(-0)).toBe(true)
    })

    it('should return false for negative numbers', () => {
      expect(isNonNegativeNumber(-1)).toBe(false)
      expect(isNonNegativeNumber(-0.1)).toBe(false)
    })

    it('should return false for invalid numbers', () => {
      expect(isNonNegativeNumber(NaN)).toBe(false)
      expect(isNonNegativeNumber(Infinity)).toBe(false)
    })
  })
})

describe('Restaurant Validation', () => {
  const validRestaurant: RestaurantFormData = {
    name: 'Buen Sabor',
    slug: 'buen-sabor',
    description: 'Restaurante de comida casera',
    theme_color: '#0078d4',
    address: 'Calle Falsa 123',
    phone: '+54 11 1234-5678',
    email: 'info@buensabor.com',
  }

  it('should validate a valid restaurant', () => {
    const result = validateRestaurant(validRestaurant)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  describe('name field', () => {
    it('should fail when name is empty', () => {
      const result = validateRestaurant({ ...validRestaurant, name: '' })
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toBe('El nombre es requerido')
    })

    it('should fail when name is only whitespace', () => {
      const result = validateRestaurant({ ...validRestaurant, name: '   ' })
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toBe('El nombre es requerido')
    })

    it('should fail when name is too short', () => {
      const result = validateRestaurant({ ...validRestaurant, name: 'A' })
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toContain('al menos')
    })

    it('should fail when name is too long', () => {
      const result = validateRestaurant({ ...validRestaurant, name: 'A'.repeat(101) })
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toContain('no puede exceder')
    })

    it('should trim whitespace from name', () => {
      const result = validateRestaurant({ ...validRestaurant, name: '  Buen Sabor  ' })
      expect(result.isValid).toBe(true)
    })
  })

  describe('slug field', () => {
    it('should fail when slug is empty', () => {
      const result = validateRestaurant({ ...validRestaurant, slug: '' })
      expect(result.isValid).toBe(false)
      expect(result.errors.slug).toBe('El slug es requerido')
    })

    it('should accept valid slug formats', () => {
      const validSlugs = ['buen-sabor', 'restaurant-123', 'mi-restaurant', 'a']
      validSlugs.forEach(slug => {
        const result = validateRestaurant({ ...validRestaurant, slug })
        expect(result.isValid).toBe(true)
      })
    })

    it('should reject invalid slug formats', () => {
      // Pattern /^[a-z0-9-]+$/ allows lowercase letters, numbers, and hyphens
      const invalidSlugs = [
        'Buen-Sabor',      // uppercase
        'buen sabor',      // spaces
        'buen_sabor',      // underscores
        'buen.sabor',      // dots
      ]
      invalidSlugs.forEach(slug => {
        const result = validateRestaurant({ ...validRestaurant, slug })
        expect(result.isValid).toBe(false)
        expect(result.errors.slug).toContain('letras minusculas')
      })
    })
  })

  describe('description field', () => {
    it('should fail when description is empty', () => {
      const result = validateRestaurant({ ...validRestaurant, description: '' })
      expect(result.isValid).toBe(false)
      expect(result.errors.description).toBe('La descripcion es requerida')
    })

    it('should fail when description is too long', () => {
      const result = validateRestaurant({ ...validRestaurant, description: 'A'.repeat(501) })
      expect(result.isValid).toBe(false)
      expect(result.errors.description).toContain('no puede exceder')
    })
  })

  describe('phone field', () => {
    it('should accept valid phone formats', () => {
      const validPhones = [
        '+54 11 1234-5678',
        '(011) 4567-8901',
        '11-1234-5678',
        '+541112345678',
        '1234567890',
        '',  // empty is valid (optional)
      ]
      validPhones.forEach(phone => {
        const result = validateRestaurant({ ...validRestaurant, phone })
        expect(result.isValid).toBe(true)
      })
    })

    it('should reject invalid phone formats', () => {
      const invalidPhones = [
        '123',           // too short
        'abc123',        // letters
        '++54111234',    // double plus
      ]
      invalidPhones.forEach(phone => {
        const result = validateRestaurant({ ...validRestaurant, phone })
        expect(result.isValid).toBe(false)
        expect(result.errors.phone).toContain('invalido')
      })
    })
  })

  describe('email field', () => {
    it('should accept valid email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co',
        'user+tag@example.com',
        '',  // empty is valid (optional)
      ]
      validEmails.forEach(email => {
        const result = validateRestaurant({ ...validRestaurant, email })
        expect(result.isValid).toBe(true)
      })
    })

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@domain.com',
        'user@domain',
        'user @domain.com',
      ]
      invalidEmails.forEach(email => {
        const result = validateRestaurant({ ...validRestaurant, email })
        expect(result.isValid).toBe(false)
        expect(result.errors.email).toBe('Email invalido')
      })
    })
  })
})

describe('Branch Validation', () => {
  const validBranch: BranchFormData = {
    name: 'Sucursal Centro',
    address: 'Av. Principal 456',
    phone: '+54 11 9876-5432',
    email: 'centro@buensabor.com',
    opening_time: '08:00',
    closing_time: '22:00',
    is_active: true,
    order: 1,
  }

  it('should validate a valid branch', () => {
    const result = validateBranch(validBranch)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when name is empty', () => {
    const result = validateBranch({ ...validBranch, name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre es requerido')
  })

  it('should fail when opening time is empty', () => {
    const result = validateBranch({ ...validBranch, opening_time: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.opening_time).toContain('apertura')
  })

  it('should fail when closing time equals opening time', () => {
    const result = validateBranch({
      ...validBranch,
      opening_time: '10:00',
      closing_time: '10:00'
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.closing_time).toContain('diferente')
  })
})

describe('Category Validation', () => {
  const validCategory: CategoryFormData = {
    name: 'Bebidas',
    order: 1,
    branch_id: 'branch-1',
    is_active: true,
  }

  it('should validate a valid category', () => {
    const result = validateCategory(validCategory)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when name is empty', () => {
    const result = validateCategory({ ...validCategory, name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre es requerido')
  })

  it('should fail when name is too short', () => {
    const result = validateCategory({ ...validCategory, name: 'A' })
    expect(result.isValid).toBe(false)
  })

  it('should fail when name is too long', () => {
    const result = validateCategory({ ...validCategory, name: 'A'.repeat(101) })
    expect(result.isValid).toBe(false)
  })
})

describe('Product Validation', () => {
  const validProduct: ProductFormData = {
    name: 'Cerveza Artesanal',
    description: 'Cerveza elaborada localmente',
    price: 500,
    branch_prices: [],
    use_branch_prices: false,
    category_id: 'cat-1',
    subcategory_id: 'subcat-1',
    featured: false,
    popular: false,
    allergen_ids: ['alg-1'],
    is_active: true,
  }

  it('should validate a valid product', () => {
    const result = validateProduct(validProduct)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when name is empty', () => {
    const result = validateProduct({ ...validProduct, name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre es requerido')
  })

  it('should fail when category is not selected', () => {
    const result = validateProduct({ ...validProduct, category_id: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.category_id).toBe('La categoria es requerida')
  })

  it('should fail when subcategory is not selected', () => {
    const result = validateProduct({ ...validProduct, subcategory_id: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.subcategory_id).toBe('La subcategoria es requerida')
  })
})

describe('Promotion Validation', () => {
  // Use future dates to avoid date validation issues
  const validPromotion: PromotionFormData = {
    name: 'Happy Hour',
    description: 'Descuento en bebidas',
    price: 1500,
    image: '',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
    start_time: '18:00',
    end_time: '20:00',
    promotion_type_id: 'type-1',
    branch_ids: ['branch-1'],
    items: [{ product_id: 'prod-1', quantity: 1 }],
    is_active: true,
  }

  it('should validate a valid promotion', () => {
    const result = validatePromotion(validPromotion)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when name is empty', () => {
    const result = validatePromotion({ ...validPromotion, name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre es requerido')
  })

  it('should fail when end date is before start date', () => {
    const result = validatePromotion({
      ...validPromotion,
      start_date: '2027-12-31',
      end_date: '2027-01-01',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.end_date).toContain('posterior')
  })

  it('should fail when no branches are selected', () => {
    const result = validatePromotion({ ...validPromotion, branch_ids: [] })
    expect(result.isValid).toBe(false)
    expect(result.errors.branch_ids).toContain('sucursal')
  })

  it('should fail when no items are selected', () => {
    const result = validatePromotion({ ...validPromotion, items: [] })
    expect(result.isValid).toBe(false)
    expect(result.errors.items).toContain('producto')
  })
})

describe('Staff Validation', () => {
  const validStaff: CreateStaffData = {
    branch_id: 'branch-1',
    role_id: 'role-1',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@buensabor.com',
    phone: '+54 11 1234-5678',
    dni: '12345678',
    hire_date: '2024-01-15',
    is_active: true,
  }

  it('should validate valid staff data', () => {
    const result = validateStaff(validStaff)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when first_name is empty', () => {
    const result = validateStaff({ ...validStaff, first_name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.first_name).toBe('El nombre es requerido')
  })

  it('should fail when last_name is empty', () => {
    const result = validateStaff({ ...validStaff, last_name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.last_name).toBe('El apellido es requerido')
  })

  it('should fail when email is invalid', () => {
    const result = validateStaff({ ...validStaff, email: 'invalid-email' })
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBe('Email invalido')
  })

  it('should fail when dni is invalid', () => {
    const result = validateStaff({ ...validStaff, dni: '123' })
    expect(result.isValid).toBe(false)
    expect(result.errors.dni).toContain('invalido')
  })

  it('should fail when branch_id is missing', () => {
    const result = validateStaff({ ...validStaff, branch_id: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.branch_id).toBe('La sucursal es requerida')
  })

  it('should fail when role_id is missing', () => {
    const result = validateStaff({ ...validStaff, role_id: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.role_id).toBe('El rol es requerido')
  })
})

describe('Role Validation', () => {
  const validRole: CreateRoleData = {
    name: 'Administrador',
    description: 'Rol con acceso completo al sistema',
    is_active: true,
  }

  it('should validate valid role data', () => {
    const result = validateRole(validRole)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should fail when name is empty', () => {
    const result = validateRole({ ...validRole, name: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre del rol es requerido')
  })

  it('should fail when description is empty', () => {
    const result = validateRole({ ...validRole, description: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.description).toBe('La descripcion es requerida')
  })

  it('should fail when name is too short', () => {
    const result = validateRole({ ...validRole, name: 'A' })
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toContain('al menos')
  })

  it('should fail when description is too long', () => {
    const result = validateRole({ ...validRole, description: 'x'.repeat(501) })
    expect(result.isValid).toBe(false)
    expect(result.errors.description).toContain('exceder')
  })
})
