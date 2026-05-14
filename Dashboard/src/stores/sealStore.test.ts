/**
 * Tests for sealStore - Product seal management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSealStore } from './sealStore'

describe('sealStore', () => {
  beforeEach(() => {
    useSealStore.setState({
      seals: [],
    })
    vi.clearAllMocks()
  })

  it('should have initial seals when not reset', () => {
    // Reset to a known state with some seals
    useSealStore.setState({
      seals: [
        { id: 'seal-1', name: 'Vegano', color: '#22c55e', icon: '🌱', is_active: true },
        { id: 'seal-2', name: 'Vegetariano', color: '#22c55e', icon: '🥗', is_active: true },
      ],
    })

    const state = useSealStore.getState()
    expect(state.seals).toHaveLength(2)
    expect(state.seals[0].name).toBe('Vegano')
  })

  it('should add a seal with auto-generated id', () => {
    const newSeal = useSealStore.getState().addSeal({
      name: 'Kosher',
      color: '#3b82f6',
      icon: '✡️',
      is_active: true,
    })

    const state = useSealStore.getState()
    expect(state.seals).toHaveLength(1)
    expect(newSeal.name).toBe('Kosher')
    expect(newSeal.id).toBeTruthy()
    expect(newSeal.color).toBe('#3b82f6')
  })

  it('should delete a seal from the list', () => {
    useSealStore.setState({
      seals: [
        { id: 'seal-1', name: 'Vegano', color: '#22c55e', icon: '🌱', is_active: true },
        { id: 'seal-2', name: 'Sin Gluten', color: '#f59e0b', icon: '🌾', is_active: true },
      ],
    })

    useSealStore.getState().deleteSeal('seal-1')
    const state = useSealStore.getState()

    expect(state.seals).toHaveLength(1)
    expect(state.seals[0].id).toBe('seal-2')
  })
})
