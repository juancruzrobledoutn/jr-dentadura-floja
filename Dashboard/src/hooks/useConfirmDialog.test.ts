/**
 * SPRINT 10: Tests for useConfirmDialog hook
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConfirmDialog } from './useConfirmDialog'

interface TestItem {
  id: string
  name: string
}

describe('useConfirmDialog', () => {
  it('should initialize with closed state', () => {
    const { result } = renderHook(() => useConfirmDialog<TestItem>())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })

  it('should open dialog with item', () => {
    const { result } = renderHook(() => useConfirmDialog<TestItem>())

    const testItem: TestItem = {
      id: '1',
      name: 'Test Item',
    }

    act(() => {
      result.current.open(testItem)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(testItem)
  })

  it('should close dialog and reset after timeout', async () => {
    const { result } = renderHook(() => useConfirmDialog<TestItem>())

    const testItem: TestItem = {
      id: '1',
      name: 'Test Item',
    }

    act(() => {
      result.current.open(testItem)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(testItem)

    act(() => {
      result.current.close()
    })

    // Dialog closes immediately
    expect(result.current.isOpen).toBe(false)

    // Wait for reset timeout (200ms)
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Item should be reset after timeout
    expect(result.current.item).toBeNull()
  })

  it('should handle multiple open/close cycles', () => {
    const { result } = renderHook(() => useConfirmDialog<TestItem>())

    const item1: TestItem = { id: '1', name: 'Item 1' }
    const item2: TestItem = { id: '2', name: 'Item 2' }

    // First cycle
    act(() => {
      result.current.open(item1)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(item1)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)

    // Second cycle
    act(() => {
      result.current.open(item2)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(item2)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('should handle opening with different items', () => {
    const { result } = renderHook(() => useConfirmDialog<TestItem>())

    const item1: TestItem = { id: '1', name: 'Item 1' }
    act(() => {
      result.current.open(item1)
    })
    expect(result.current.item).toEqual(item1)

    const item2: TestItem = { id: '2', name: 'Item 2' }
    act(() => {
      result.current.open(item2)
    })
    expect(result.current.item).toEqual(item2)
    expect(result.current.isOpen).toBe(true)
  })

  it('should work with different item types', () => {
    interface ComplexItem {
      id: string
      name: string
      metadata: {
        created: string
        updated: string
      }
    }

    const { result } = renderHook(() => useConfirmDialog<ComplexItem>())

    const complexItem: ComplexItem = {
      id: '1',
      name: 'Complex Item',
      metadata: {
        created: '2024-01-01',
        updated: '2024-01-02',
      },
    }

    act(() => {
      result.current.open(complexItem)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(complexItem)
    expect(result.current.item?.metadata.created).toBe('2024-01-01')
  })
})
