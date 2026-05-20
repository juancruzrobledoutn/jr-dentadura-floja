import { describe, it, expect } from 'vitest'
import { helpContent, definedKeys } from '../utils/helpContent'
import type { DashboardPageKey } from '../utils/helpContent'

// The 16 baseline keys that must always be present (as of change #1)
const BASELINE_KEYS = [
  'dashboard',
  'restaurant',
  'branches',
  'categories',
  'subcategories',
  'products',
  'prices',
  'allergens',
  'badges',
  'promotionTypes',
  'promotions',
  'tables',
  'sales',
  'historyBranches',
  'historyCustomers',
  'settings',
] as const satisfies readonly DashboardPageKey[]

// change #2 (half-done pages — implemented in helpsystem-finish-modals-with-pending-entries):
const CHANGE_2_KEYS = [
  // 'badges' is already in BASELINE_KEYS — do NOT duplicate here
  'customizations',
  'delivery',
  'ingredients',
  'recipes',
  'reservations',
  'seals',
  'suppliers',
  'kitchen',
] as const satisfies readonly DashboardPageKey[]

// change #3 (read-only pages — implemented in helpsystem-read-only-operations-pages):
const CHANGE_3_KEYS = [
  'orders',
  'inventory',
  'cashRegister',
  'productExclusions',
] as const satisfies readonly DashboardPageKey[]

// change #4 (reports / compliance pages — implemented in helpsystem-reports-and-fiscal-pages):
const CHANGE_4_KEYS = [
  'reports',
  'fiscal',
  'auditLog',
  'tips',
] as const satisfies readonly DashboardPageKey[]

// change #5 (crm / layout pages — implemented in helpsystem-customer-and-layout-pages):
const CHANGE_5_KEYS = [
  'crm',
  'floorPlan',
  'scheduling',
] as const satisfies readonly DashboardPageKey[]

// change #6 (staff / roles refactor — implemented in helpsystem-refactor-staff-and-roles):
const CHANGE_6_KEYS = [
  'staff',
  'roles',
] as const satisfies readonly DashboardPageKey[]

describe('helpContent baseline coverage', () => {
  it.each(BASELINE_KEYS)('has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(BASELINE_KEYS)('exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })

  it('definedKeys matches Object.keys(helpContent)', () => {
    expect(new Set(Object.keys(helpContent))).toEqual(new Set(definedKeys))
  })
})

describe('helpContent change #2 coverage', () => {
  it.each(CHANGE_2_KEYS)('change #2 — has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(CHANGE_2_KEYS)('change #2 — exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })
})

describe('helpContent change #3 coverage', () => {
  it.each(CHANGE_3_KEYS)('change #3 — has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(CHANGE_3_KEYS)('change #3 — exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })
})

describe('helpContent change #4 coverage', () => {
  it.each(CHANGE_4_KEYS)('change #4 — has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(CHANGE_4_KEYS)('change #4 — exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })
})

describe('helpContent change #5 coverage', () => {
  it.each(CHANGE_5_KEYS)('change #5 - has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(CHANGE_5_KEYS)('change #5 - exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })
})

describe('helpContent change #6 coverage', () => {
  it.each(CHANGE_6_KEYS)('change #6 - has help content for %s', (key) => {
    expect(helpContent[key]).toBeDefined()
    expect(helpContent[key]).not.toBeNull()
  })

  it.each(CHANGE_6_KEYS)('change #6 - exposes %s in definedKeys', (key) => {
    expect(definedKeys.has(key)).toBe(true)
  })
})
