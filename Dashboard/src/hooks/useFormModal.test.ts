/**
 * SPRINT 10: Tests for useFormModal hook
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFormModal } from './useFormModal'

interface TestFormData {
  name: string
  email: string
  age: number
}

const initialFormData: TestFormData = {
  name: '',
  email: '',
  age: 0,
}

describe('useFormModal', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    expect(result.current.isOpen).toBe(false)
    expect(result.current.formData).toEqual(initialFormData)
    expect(result.current.selectedItem).toBeNull()
  })

  it('should open modal for create mode', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    act(() => {
      result.current.openCreate()
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.formData).toEqual(initialFormData)
    expect(result.current.selectedItem).toBeNull()
  })

  it('should open modal for edit mode with item data', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    const testItem = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    }

    act(() => {
      result.current.openEdit(testItem)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.formData).toEqual(testItem)
    expect(result.current.selectedItem).toEqual(testItem)
  })

  it('should update form data', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    act(() => {
      result.current.openCreate()
    })

    const newData: TestFormData = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      age: 25,
    }

    act(() => {
      result.current.setFormData(newData)
    })

    expect(result.current.formData).toEqual(newData)
  })

  it('should close modal and reset after timeout', async () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    const testItem = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    }

    act(() => {
      result.current.openEdit(testItem)
    })

    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })

    // Modal closes immediately
    expect(result.current.isOpen).toBe(false)

    // Wait for reset timeout (200ms)
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Data should be reset after timeout
    expect(result.current.formData).toEqual(initialFormData)
    expect(result.current.selectedItem).toBeNull()
  })

  it('should reset form data without closing', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    const testData: TestFormData = {
      name: 'Test Name',
      email: 'test@example.com',
      age: 20,
    }

    act(() => {
      result.current.setFormData(testData)
    })

    expect(result.current.formData).toEqual(testData)

    act(() => {
      result.current.reset()
    })

    expect(result.current.formData).toEqual(initialFormData)
  })

  it('should handle multiple open/close cycles', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    // First cycle - create
    act(() => {
      result.current.openCreate()
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedItem).toBeNull()

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)

    // Second cycle - edit
    const testItem = { id: '2', name: 'Test', email: 'test@test.com', age: 25 }
    act(() => {
      result.current.openEdit(testItem)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedItem).toEqual(testItem)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('should preserve modal state when updating form data', () => {
    const { result } = renderHook(() => useFormModal(initialFormData))

    act(() => {
      result.current.openCreate()
    })

    const step1Data: TestFormData = { name: 'Step 1', email: '', age: 0 }
    act(() => {
      result.current.setFormData(step1Data)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.formData.name).toBe('Step 1')

    const step2Data: TestFormData = { ...step1Data, email: 'step2@example.com' }
    act(() => {
      result.current.setFormData(step2Data)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.formData.email).toBe('step2@example.com')
  })
})
