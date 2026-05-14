import { PATTERNS, TABLE_DEFAULT_TIME, VALIDATION_LIMITS } from './constants'
import type {
  RestaurantFormData,
  BranchFormData,
  CategoryFormData,
  SubcategoryFormData,
  ProductFormData,
  AllergenFormData,
  BadgeFormData,
  SealFormData,
  PromotionFormData,
  PromotionTypeFormData,
  RestaurantTableFormData,
  RecipeFormData,
} from '../types'
import type { CreateStaffData } from '../types/staff'
import type { CreateRoleData } from '../types/role'

export type ValidationErrors<T> = Partial<Record<keyof T, string>>

export interface ValidationResult<T> {
  isValid: boolean
  errors: ValidationErrors<T>
}

// Use centralized validation limits
const {
  MIN_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_ADDRESS_LENGTH,
} = VALIDATION_LIMITS

/**
 * Validates that a value is a finite, non-NaN number
 * Handles edge cases like Infinity, -Infinity, NaN
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && Number.isFinite(value)
}

/**
 * Validates that a value is a positive number (> 0)
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0
}

/**
 * Validates that a value is a non-negative number (>= 0)
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isValidNumber(value) && value >= 0
}

// Phone validation: accepts formats like +54 11 1234-5678, (011) 4567-8901, etc.
function isValidPhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true // Empty is valid (optional field)
  // Remove all spaces, dashes, and parentheses for validation
  const cleaned = phone.replace(/[\s\-()]/g, '')
  // Must be digits, optionally starting with +
  return /^\+?\d{6,15}$/.test(cleaned)
}

// Restaurant validation
export function validateRestaurant(data: RestaurantFormData): ValidationResult<RestaurantFormData> {
  const errors: ValidationErrors<RestaurantFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  if (!data.slug.trim()) {
    errors.slug = 'El slug es requerido'
  } else if (!PATTERNS.SLUG.test(data.slug)) {
    errors.slug = 'Solo letras minusculas, numeros y guiones'
  }

  const trimmedDescription = data.description.trim()
  if (!trimmedDescription) {
    errors.description = 'La descripcion es requerida'
  } else if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `La descripcion no puede exceder ${MAX_DESCRIPTION_LENGTH} caracteres`
  }

  if (data.address && data.address.length > MAX_ADDRESS_LENGTH) {
    errors.address = `La direccion no puede exceder ${MAX_ADDRESS_LENGTH} caracteres`
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.phone = 'Telefono invalido (ej: +54 11 1234-5678)'
  }

  if (data.email && !PATTERNS.EMAIL.test(data.email)) {
    errors.email = 'Email invalido'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Branch validation
export function validateBranch(data: BranchFormData): ValidationResult<BranchFormData> {
  const errors: ValidationErrors<BranchFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  if (data.address && data.address.length > MAX_ADDRESS_LENGTH) {
    errors.address = `La direccion no puede exceder ${MAX_ADDRESS_LENGTH} caracteres`
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.phone = 'Telefono invalido (ej: +54 11 1234-5678)'
  }

  if (data.email && !PATTERNS.EMAIL.test(data.email)) {
    errors.email = 'Email invalido'
  }

  // Validate time format (HH:mm)
  if (!data.opening_time || !PATTERNS.TIME.test(data.opening_time)) {
    errors.opening_time = 'Horario de apertura inválido (formato HH:mm)'
  }
  if (!data.closing_time || !PATTERNS.TIME.test(data.closing_time)) {
    errors.closing_time = 'Horario de cierre inválido (formato HH:mm)'
  }

  // Validate times are different (allows overnight hours like 20:00 - 02:00)
  if (
    data.opening_time &&
    data.closing_time &&
    PATTERNS.TIME.test(data.opening_time) &&
    PATTERNS.TIME.test(data.closing_time)
  ) {
    if (data.opening_time === data.closing_time) {
      errors.closing_time = 'El horario de cierre debe ser diferente al de apertura'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Category validation options
interface CategoryValidationOptions {
  existingCategories?: Array<{ id: string; branch_id: string; name: string }>
  editingCategoryId?: string
}

// Category validation
export function validateCategory(
  data: CategoryFormData,
  options: CategoryValidationOptions = {}
): ValidationResult<CategoryFormData> {
  const errors: ValidationErrors<CategoryFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  } else if (data.branch_id && options.existingCategories) {
    // Check uniqueness: no other category with same name in same branch
    const duplicate = options.existingCategories.find(
      (c) =>
        c.branch_id === data.branch_id &&
        c.name.toLowerCase() === trimmedName.toLowerCase() &&
        c.id !== options.editingCategoryId
    )
    if (duplicate) {
      errors.name = `Ya existe una categoría "${trimmedName}" en esta sucursal`
    }
  }

  if (!data.branch_id) {
    errors.branch_id = 'La sucursal es requerida'
  }

  // Validate order is a non-negative number with limits
  if (!isNonNegativeNumber(data.order)) {
    errors.order = 'El orden debe ser un número mayor o igual a 0'
  } else if (data.order > 9999) {
    errors.order = 'El orden no puede exceder 9999'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Subcategory validation options
interface SubcategoryValidationOptions {
  existingSubcategories?: Array<{ id: string; category_id: string; name: string }>
  editingSubcategoryId?: string
}

// Subcategory validation
export function validateSubcategory(
  data: SubcategoryFormData,
  options: SubcategoryValidationOptions = {}
): ValidationResult<SubcategoryFormData> {
  const errors: ValidationErrors<SubcategoryFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  } else if (data.category_id && options.existingSubcategories) {
    // Check uniqueness: no other subcategory with same name in same category
    const duplicate = options.existingSubcategories.find(
      (s) =>
        s.category_id === data.category_id &&
        s.name.toLowerCase() === trimmedName.toLowerCase() &&
        s.id !== options.editingSubcategoryId
    )
    if (duplicate) {
      errors.name = `Ya existe una subcategoría "${trimmedName}" en esta categoría`
    }
  }

  if (!data.category_id) {
    errors.category_id = 'La categoria es requerida'
  }

  // Validate order is a non-negative number with limits
  if (!isNonNegativeNumber(data.order)) {
    errors.order = 'El orden debe ser un número mayor o igual a 0'
  } else if (data.order > 9999) {
    errors.order = 'El orden no puede exceder 9999'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Branch price errors type (keyed by branch_id)
export type BranchPriceErrors = Record<string, string>

// Product validation result with branch price errors
export interface ProductValidationResult extends ValidationResult<ProductFormData> {
  branchPriceErrors: BranchPriceErrors
}

// DASH-008: Product validation options for duplicate checking
interface ProductValidationOptions {
  existingProducts?: Array<{ id: string; subcategory_id: string; name: string }>
  editingProductId?: string
}

// Product validation
export function validateProduct(
  data: ProductFormData,
  options: ProductValidationOptions = {}
): ProductValidationResult {
  const errors: ValidationErrors<ProductFormData> = {}
  const branchPriceErrors: BranchPriceErrors = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  } else if (data.subcategory_id && options.existingProducts) {
    // DASH-008: Check uniqueness: no other product with same name in same subcategory
    const duplicate = options.existingProducts.find(
      (p) =>
        p.subcategory_id === data.subcategory_id &&
        p.name.toLowerCase() === trimmedName.toLowerCase() &&
        p.id !== options.editingProductId
    )
    if (duplicate) {
      errors.name = `Ya existe un producto "${trimmedName}" en esta subcategoría`
    }
  }

  const trimmedDescription = data.description.trim()
  if (!trimmedDescription) {
    errors.description = 'La descripcion es requerida'
  } else if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `La descripcion no puede exceder ${MAX_DESCRIPTION_LENGTH} caracteres`
  }

  // Price validation depends on mode
  if (data.use_branch_prices) {
    // Branch prices mode: validate individual branch prices
    const branchPrices = data.branch_prices ?? []
    const activeBranchPrices = branchPrices.filter(bp => bp.is_active)

    if (activeBranchPrices.length === 0) {
      errors.branch_prices = 'Debe seleccionar al menos una sucursal'
    }

    // Validate each active branch price
    activeBranchPrices.forEach(bp => {
      if (!isPositiveNumber(bp.price)) {
        branchPriceErrors[bp.branch_id] = 'El precio debe ser mayor a 0'
      }
    })
  } else {
    // Single price mode: validate base price
    if (!isPositiveNumber(data.price)) {
      errors.price = 'El precio debe ser un numero mayor a 0'
    }
  }

  if (!data.category_id) {
    errors.category_id = 'La categoria es requerida'
  }

  if (!data.subcategory_id) {
    errors.subcategory_id = 'La subcategoria es requerida'
  }

  return {
    isValid: Object.keys(errors).length === 0 && Object.keys(branchPriceErrors).length === 0,
    errors,
    branchPriceErrors,
  }
}

// Allergen validation
export function validateAllergen(data: AllergenFormData): ValidationResult<AllergenFormData> {
  const errors: ValidationErrors<AllergenFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Badge validation
export function validateBadge(data: BadgeFormData): ValidationResult<BadgeFormData> {
  const errors: ValidationErrors<BadgeFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  // Validate color format (hex color)
  if (data.color && !/^#[0-9A-F]{6}$/i.test(data.color)) {
    errors.color = 'El color debe ser un código hexadecimal válido (ej: #0078d4)'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Seal validation
export function validateSeal(data: SealFormData): ValidationResult<SealFormData> {
  const errors: ValidationErrors<SealFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  // Validate color format (hex color)
  if (data.color && !/^#[0-9A-F]{6}$/i.test(data.color)) {
    errors.color = 'El color debe ser un código hexadecimal válido (ej: #0078d4)'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Promotion Type validation
export function validatePromotionType(data: PromotionTypeFormData): ValidationResult<PromotionTypeFormData> {
  const errors: ValidationErrors<PromotionTypeFormData> = {}

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Promotion validation options
interface PromotionValidationOptions {
  isEditing?: boolean  // true when editing an existing promotion
}

// Helper to get local date string in YYYY-MM-DD format (consistent timezone)
function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to get local time string in HH:mm format (consistent timezone)
function getLocalTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Promotion validation
export function validatePromotion(
  data: PromotionFormData,
  options: PromotionValidationOptions = {}
): ValidationResult<PromotionFormData> {
  const errors: ValidationErrors<PromotionFormData> = {}
  const now = new Date()
  // Use local timezone consistently (not mixing UTC with local)
  const today = getLocalDateString(now)
  const currentTime = getLocalTimeString(now)

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  if (!isPositiveNumber(data.price)) {
    errors.price = 'El precio debe ser un numero mayor a 0'
  }

  if (!data.start_date) {
    errors.start_date = 'La fecha de inicio es requerida'
  } else if (!options.isEditing) {
    // Solo validar fecha futura al crear nueva promocion
    if (data.start_date < today) {
      errors.start_date = 'La fecha de inicio debe ser igual o posterior a hoy'
    } else if (data.start_date === today && data.start_time && data.start_time < currentTime) {
      errors.start_time = 'La hora de inicio debe ser posterior a la hora actual'
    }
  }

  if (!data.end_date) {
    errors.end_date = 'La fecha de fin es requerida'
  } else if (data.start_date && data.end_date < data.start_date) {
    errors.end_date = 'La fecha de fin debe ser igual o posterior a la de inicio'
  }

  // Al activar una promocion, la fecha de fin no puede ser anterior a hoy
  if (data.is_active && data.end_date && data.end_date < today) {
    errors.end_date = 'No se puede activar una promocion con fecha de fin anterior a hoy'
  }

  // Si es el mismo dia, validar que hora de fin sea posterior a hora de inicio
  if (data.start_date && data.end_date && data.start_date === data.end_date) {
    if (data.start_time && data.end_time && data.end_time <= data.start_time) {
      errors.end_time = 'La hora de fin debe ser posterior a la hora de inicio'
    }
  }

  if (!data.start_time) {
    errors.start_time = errors.start_time || 'La hora de inicio es requerida'
  }

  if (!data.end_time) {
    errors.end_time = errors.end_time || 'La hora de fin es requerida'
  }

  if (!data.promotion_type_id) {
    errors.promotion_type_id = 'El tipo de promocion es requerido'
  }

  if (!data.items || data.items.length === 0) {
    errors.items = 'Debes agregar al menos un producto al combo'
  } else {
    // Validate each item has quantity > 0
    const invalidItem = data.items.find(
      (item) => !isPositiveNumber(item.quantity)
    )
    if (invalidItem) {
      errors.items = 'Cada producto debe tener una cantidad mayor a 0'
    }
  }

  if (!data.branch_ids || data.branch_ids.length === 0) {
    errors.branch_ids = 'Debes seleccionar al menos una sucursal'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Table validation options
interface TableValidationOptions {
  existingTables?: Array<{ id: string; branch_id: string; number: number }>
  editingTableId?: string  // ID of the table being edited (to exclude from uniqueness check)
}

// Table validation
export function validateTable(
  data: RestaurantTableFormData,
  options: TableValidationOptions = {}
): ValidationResult<RestaurantTableFormData> {
  const errors: ValidationErrors<RestaurantTableFormData> = {}

  if (!data.branch_id) {
    errors.branch_id = 'La sucursal es requerida'
  }

  if (!isPositiveNumber(data.number)) {
    errors.number = 'El numero de mesa debe ser mayor a 0'
  } else if (data.branch_id && options.existingTables) {
    // Check uniqueness: no other table with same number in same branch
    const duplicate = options.existingTables.find(
      (t) =>
        t.branch_id === data.branch_id &&
        t.number === data.number &&
        t.id !== options.editingTableId
    )
    if (duplicate) {
      errors.number = `Ya existe la mesa #${data.number} en esta sucursal`
    }
  }

  if (!isPositiveNumber(data.capacity)) {
    errors.capacity = 'La capacidad debe ser al menos 1 comensal'
  } else if (data.capacity > 50) {
    errors.capacity = 'La capacidad no puede exceder 50 comensales'
  }

  const trimmedSector = data.sector.trim()
  if (!trimmedSector) {
    errors.sector = 'El sector es requerido'
  } else if (trimmedSector.length < MIN_NAME_LENGTH) {
    errors.sector = `El sector debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedSector.length > MAX_NAME_LENGTH) {
    errors.sector = `El sector no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  const validStatuses = ['libre', 'solicito_pedido', 'pedido_cumplido', 'cuenta_solicitada', 'ocupada']
  if (!validStatuses.includes(data.status)) {
    errors.status = 'El estado no es valido'
  }

  // Validate time format (HH:mm)
  if (!data.order_time || !PATTERNS.TIME.test(data.order_time)) {
    errors.order_time = 'Hora de pedido invalida (formato HH:mm)'
  }
  if (!data.close_time || !PATTERNS.TIME.test(data.close_time)) {
    errors.close_time = 'Hora de cierre invalida (formato HH:mm)'
  }

  // Time rules by status:
  // - libre: order_time=00:00, close_time=00:00
  // - ocupada: order_time=00:00, close_time=00:00
  // - solicito_pedido: order_time=HH:mm, close_time=00:00
  // - pedido_cumplido: order_time=HH:mm, close_time=00:00 (mantiene hora del pedido)
  // - cuenta_solicitada: order_time=HH:mm, close_time=HH:mm (close >= order)

  if (data.status === 'libre' || data.status === 'ocupada') {
    if (data.order_time !== TABLE_DEFAULT_TIME) {
      errors.order_time = 'Hora de pedido debe ser 00:00'
    }
    if (data.close_time !== TABLE_DEFAULT_TIME) {
      errors.close_time = 'Hora de cierre debe ser 00:00'
    }
  }

  if (data.status === 'solicito_pedido' || data.status === 'pedido_cumplido') {
    if (data.order_time === TABLE_DEFAULT_TIME) {
      errors.order_time = 'Hora de pedido es requerida'
    }
    if (data.close_time !== TABLE_DEFAULT_TIME) {
      errors.close_time = 'Hora de cierre debe ser 00:00'
    }
  }

  if (data.status === 'cuenta_solicitada') {
    if (data.order_time === TABLE_DEFAULT_TIME) {
      errors.order_time = 'Hora de pedido es requerida cuando cuenta solicitada'
    }
    if (data.close_time === TABLE_DEFAULT_TIME) {
      errors.close_time = 'Hora de cierre es requerida cuando cuenta solicitada'
    }
    // Validate that close_time >= order_time
    if (data.order_time && data.close_time &&
        data.order_time !== TABLE_DEFAULT_TIME && data.close_time !== TABLE_DEFAULT_TIME) {
      const [orderHour, orderMin] = data.order_time.split(':').map(Number)
      const [closeHour, closeMin] = data.close_time.split(':').map(Number)
      const orderMinutes = orderHour * 60 + orderMin
      const closeMinutes = closeHour * 60 + closeMin

      if (closeMinutes < orderMinutes) {
        errors.close_time = 'La hora de cierre no puede ser menor a la hora de pedido'
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// DASH-008: Staff validation options for duplicate checking
interface StaffValidationOptions {
  existingStaff?: Array<{ id: string; email: string; dni: string }>
  editingStaffId?: string
}

// Staff validation
export function validateStaff(
  data: CreateStaffData,
  options: StaffValidationOptions = {}
): ValidationResult<CreateStaffData> {
  const errors: ValidationErrors<CreateStaffData> = {}

  if (!data.branch_id) {
    errors.branch_id = 'La sucursal es requerida'
  }

  if (!data.role_id) {
    errors.role_id = 'El rol es requerido'
  }

  const trimmedFirstName = data.first_name.trim()
  if (!trimmedFirstName) {
    errors.first_name = 'El nombre es requerido'
  } else if (trimmedFirstName.length < MIN_NAME_LENGTH) {
    errors.first_name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedFirstName.length > MAX_NAME_LENGTH) {
    errors.first_name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  const trimmedLastName = data.last_name.trim()
  if (!trimmedLastName) {
    errors.last_name = 'El apellido es requerido'
  } else if (trimmedLastName.length < MIN_NAME_LENGTH) {
    errors.last_name = `El apellido debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedLastName.length > MAX_NAME_LENGTH) {
    errors.last_name = `El apellido no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  const trimmedEmail = data.email.trim()
  if (!trimmedEmail) {
    errors.email = 'El email es requerido'
  } else if (!PATTERNS.EMAIL.test(trimmedEmail)) {
    errors.email = 'Email invalido'
  } else if (options.existingStaff) {
    // DASH-008: Check uniqueness of email
    const duplicateEmail = options.existingStaff.find(
      (s) =>
        s.email.toLowerCase() === trimmedEmail.toLowerCase() &&
        s.id !== options.editingStaffId
    )
    if (duplicateEmail) {
      errors.email = 'Ya existe un empleado con este email'
    }
  }

  if (!data.phone.trim()) {
    errors.phone = 'El telefono es requerido'
  } else if (!isValidPhone(data.phone)) {
    errors.phone = 'Telefono invalido (ej: +54 11 1234-5678)'
  }

  const trimmedDni = data.dni.trim()
  if (!trimmedDni) {
    errors.dni = 'El DNI es requerido'
  } else if (!/^\d{7,9}$/.test(trimmedDni)) {
    errors.dni = 'DNI invalido (debe tener entre 7 y 9 digitos)'
  } else if (options.existingStaff) {
    // DASH-008: Check uniqueness of DNI
    const duplicateDni = options.existingStaff.find(
      (s) =>
        s.dni === trimmedDni &&
        s.id !== options.editingStaffId
    )
    if (duplicateDni) {
      errors.dni = 'Ya existe un empleado con este DNI'
    }
  }

  if (!data.hire_date) {
    errors.hire_date = 'La fecha de ingreso es requerida'
  } else {
    const hireDate = new Date(data.hire_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (isNaN(hireDate.getTime())) {
      errors.hire_date = 'Fecha de ingreso invalida'
    } else if (hireDate > today) {
      errors.hire_date = 'La fecha de ingreso no puede ser futura'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Role validation
export function validateRole(data: CreateRoleData): ValidationResult<CreateRoleData> {
  const errors: ValidationErrors<CreateRoleData> = {}

  const trimmedName = (data.name ?? '').trim()
  if (!trimmedName) {
    errors.name = 'El nombre del rol es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  const trimmedDescription = (data.description ?? '').trim()
  if (!trimmedDescription) {
    errors.description = 'La descripcion es requerida'
  } else if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `La descripcion no puede exceder ${MAX_DESCRIPTION_LENGTH} caracteres`
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Recipe validation
export function validateRecipe(data: RecipeFormData): ValidationResult<RecipeFormData> {
  const errors: ValidationErrors<RecipeFormData> = {}

  if (!data.branch_id) {
    errors.branch_id = 'La sucursal es requerida'
  }

  const trimmedName = data.name.trim()
  if (!trimmedName) {
    errors.name = 'El nombre es requerido'
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `El nombre debe tener al menos ${MIN_NAME_LENGTH} caracteres`
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres`
  }

  if (data.servings !== undefined && !isPositiveNumber(data.servings)) {
    errors.servings = 'Las porciones deben ser mayor a 0'
  }

  if (data.prep_time_minutes !== undefined && !isNonNegativeNumber(data.prep_time_minutes)) {
    errors.prep_time_minutes = 'El tiempo de preparación debe ser mayor o igual a 0'
  }

  if (data.cook_time_minutes !== undefined && !isNonNegativeNumber(data.cook_time_minutes)) {
    errors.cook_time_minutes = 'El tiempo de cocción debe ser mayor o igual a 0'
  }

  if (data.cost_cents !== undefined && !isNonNegativeNumber(data.cost_cents)) {
    errors.cost_cents = 'El costo por porción debe ser mayor o igual a 0'
  }

  // Validate ingredients have required fields
  if (data.ingredients && data.ingredients.length > 0) {
    const invalidIngredient = data.ingredients.find(
      (ing) => !ing.name?.trim() || !ing.quantity?.trim() || !ing.unit?.trim()
    )
    if (invalidIngredient) {
      errors.ingredients = 'Cada ingrediente debe tener nombre, cantidad y unidad'
    }
  }

  // Validate preparation steps have required fields
  if (data.preparation_steps && data.preparation_steps.length > 0) {
    const invalidStep = data.preparation_steps.find(
      (step) => !step.instruction?.trim()
    )
    if (invalidStep) {
      errors.preparation_steps = 'Cada paso de preparación debe tener una instrucción'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
