/**
 * SPRINT 10: Tests for form utility functions
 */

import { describe, it, expect } from 'vitest'
import {
  extractFormFields,
  extractCheckboxValues,
  extractNumericField,
  extractBooleanField,
  createFormData,
  formatFormErrors,
  hasFormErrors,
} from './form'

describe('extractFormFields', () => {
  it('should extract specified fields from FormData', () => {
    const formData = new FormData()
    formData.append('name', 'John Doe')
    formData.append('email', 'john@example.com')
    formData.append('age', '30')

    interface TestData {
      name: string
      email: string
      age: string
    }

    const result = extractFormFields<TestData>(formData, ['name', 'email'])

    expect(result.name).toBe('John Doe')
    expect(result.email).toBe('john@example.com')
    expect(result.age).toBeUndefined()
  })

  it('should skip null values', () => {
    const formData = new FormData()
    formData.append('name', 'John Doe')
    // email is not appended

    interface TestData {
      name: string
      email: string
    }

    const result = extractFormFields<TestData>(formData, ['name', 'email'])

    expect(result.name).toBe('John Doe')
    expect(result.email).toBeUndefined()
  })

  it('should handle empty FormData', () => {
    const formData = new FormData()

    interface TestData {
      name: string
      email: string
    }

    const result = extractFormFields<TestData>(formData, ['name', 'email'])

    expect(Object.keys(result)).toHaveLength(0)
  })
})

describe('extractCheckboxValues', () => {
  it('should extract multiple checkbox values', () => {
    const formData = new FormData()
    formData.append('allergenIds', 'alg-1')
    formData.append('allergenIds', 'alg-2')
    formData.append('allergenIds', 'alg-3')

    const result = extractCheckboxValues(formData, 'allergenIds')

    expect(result).toEqual(['alg-1', 'alg-2', 'alg-3'])
  })

  it('should return empty array when no values', () => {
    const formData = new FormData()

    const result = extractCheckboxValues(formData, 'allergenIds')

    expect(result).toEqual([])
  })

  it('should handle single checkbox value', () => {
    const formData = new FormData()
    formData.append('allergenIds', 'alg-1')

    const result = extractCheckboxValues(formData, 'allergenIds')

    expect(result).toEqual(['alg-1'])
  })
})

describe('extractNumericField', () => {
  it('should extract and parse numeric value', () => {
    const formData = new FormData()
    formData.append('price', '1500')

    const result = extractNumericField(formData, 'price')

    expect(result).toBe(1500)
  })

  it('should parse float values', () => {
    const formData = new FormData()
    formData.append('price', '1500.50')

    const result = extractNumericField(formData, 'price')

    expect(result).toBe(1500.5)
  })

  it('should return default value for null', () => {
    const formData = new FormData()

    const result = extractNumericField(formData, 'price', 0)

    expect(result).toBe(0)
  })

  it('should return default value for empty string', () => {
    const formData = new FormData()
    formData.append('price', '')

    const result = extractNumericField(formData, 'price', 100)

    expect(result).toBe(100)
  })

  it('should return default value for invalid number', () => {
    const formData = new FormData()
    formData.append('price', 'invalid')

    const result = extractNumericField(formData, 'price', 0)

    expect(result).toBe(0)
  })

  it('should handle negative numbers', () => {
    const formData = new FormData()
    formData.append('price', '-50')

    const result = extractNumericField(formData, 'price')

    expect(result).toBe(-50)
  })

  it('should use 0 as default when not specified', () => {
    const formData = new FormData()

    const result = extractNumericField(formData, 'price')

    expect(result).toBe(0)
  })
})

describe('extractBooleanField', () => {
  it('should return true for "on" value', () => {
    const formData = new FormData()
    formData.append('is_active', 'on')

    const result = extractBooleanField(formData, 'is_active')

    expect(result).toBe(true)
  })

  it('should return true for "true" value', () => {
    const formData = new FormData()
    formData.append('is_active', 'true')

    const result = extractBooleanField(formData, 'is_active')

    expect(result).toBe(true)
  })

  it('should return false for unchecked checkbox', () => {
    const formData = new FormData()
    // Unchecked checkboxes are not appended to FormData

    const result = extractBooleanField(formData, 'is_active')

    expect(result).toBe(false)
  })

  it('should return false for other values', () => {
    const formData = new FormData()
    formData.append('is_active', 'false')

    const result = extractBooleanField(formData, 'is_active')

    expect(result).toBe(false)
  })
})

describe('createFormData', () => {
  it('should create FormData from object', () => {
    const data = {
      name: 'Test Category',
      active: true,
      order: 1,
    }

    const formData = createFormData(data)

    expect(formData.get('name')).toBe('Test Category')
    expect(formData.get('active')).toBe('true')
    expect(formData.get('order')).toBe('1')
  })

  it('should handle array values', () => {
    const data = {
      name: 'Product',
      allergenIds: ['alg-1', 'alg-2', 'alg-3'],
    }

    const formData = createFormData(data)

    expect(formData.get('name')).toBe('Product')
    expect(formData.getAll('allergenIds')).toEqual(['alg-1', 'alg-2', 'alg-3'])
  })

  it('should skip null values', () => {
    const data = {
      name: 'Test',
      description: null,
      active: true,
    }

    const formData = createFormData(data)

    expect(formData.get('name')).toBe('Test')
    expect(formData.get('description')).toBeNull()
    expect(formData.get('active')).toBe('true')
  })

  it('should skip undefined values', () => {
    const data = {
      name: 'Test',
      description: undefined,
      active: true,
    }

    const formData = createFormData(data)

    expect(formData.get('name')).toBe('Test')
    expect(formData.get('description')).toBeNull()
    expect(formData.get('active')).toBe('true')
  })

  it('should convert numbers to strings', () => {
    const data = {
      price: 1500,
      quantity: 10,
    }

    const formData = createFormData(data)

    expect(formData.get('price')).toBe('1500')
    expect(formData.get('quantity')).toBe('10')
  })

  it('should handle empty arrays', () => {
    const data = {
      name: 'Product',
      allergenIds: [],
    }

    const formData = createFormData(data)

    expect(formData.get('name')).toBe('Product')
    expect(formData.getAll('allergenIds')).toEqual([])
  })
})

describe('formatFormErrors', () => {
  it('should format errors as comma-separated string', () => {
    const errors = {
      name: 'Name is required',
      email: 'Invalid email',
      age: 'Must be a number',
    }

    const result = formatFormErrors(errors)

    expect(result).toBe('Name is required, Invalid email, Must be a number')
  })

  it('should skip undefined errors', () => {
    const errors = {
      name: 'Name is required',
      email: undefined,
      age: 'Must be a number',
    }

    const result = formatFormErrors(errors)

    expect(result).toBe('Name is required, Must be a number')
  })

  it('should return empty string for no errors', () => {
    const errors = {}

    const result = formatFormErrors(errors)

    expect(result).toBe('')
  })

  it('should handle single error', () => {
    const errors = {
      name: 'Name is required',
    }

    const result = formatFormErrors(errors)

    expect(result).toBe('Name is required')
  })
})

describe('hasFormErrors', () => {
  it('should return true when errors exist', () => {
    const errors = {
      name: 'Name is required',
      email: 'Invalid email',
    }

    const result = hasFormErrors(errors)

    expect(result).toBe(true)
  })

  it('should return false when no errors', () => {
    const errors = {}

    const result = hasFormErrors(errors)

    expect(result).toBe(false)
  })

  it('should return true even with undefined values', () => {
    const errors = {
      name: undefined,
      email: 'Invalid email',
    }

    const result = hasFormErrors(errors)

    expect(result).toBe(true)
  })
})
