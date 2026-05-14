/**
 * Tests for badgeStore - Product badge management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBadgeStore } from './badgeStore'

describe('badgeStore', () => {
  beforeEach(() => {
    useBadgeStore.setState({
      badges: [],
    })
    vi.clearAllMocks()
  })

  it('should hold badges when set via setState', () => {
    useBadgeStore.setState({
      badges: [
        { id: 'badge-1', name: 'Nuevo', color: '#22c55e', is_active: true },
        { id: 'badge-2', name: 'Popular', color: '#f97316', is_active: true },
      ],
    })

    const state = useBadgeStore.getState()
    expect(state.badges).toHaveLength(2)
    expect(state.badges[0].name).toBe('Nuevo')
  })

  it('should add a badge with auto-generated id', () => {
    const newBadge = useBadgeStore.getState().addBadge({
      name: 'Limitado',
      color: '#ef4444',
      is_active: true,
    })

    const state = useBadgeStore.getState()
    expect(state.badges).toHaveLength(1)
    expect(newBadge.name).toBe('Limitado')
    expect(newBadge.id).toBeTruthy()
    expect(newBadge.color).toBe('#ef4444')
  })

  it('should delete a badge from the list', () => {
    useBadgeStore.setState({
      badges: [
        { id: 'badge-1', name: 'Nuevo', color: '#22c55e', is_active: true },
        { id: 'badge-2', name: 'Popular', color: '#f97316', is_active: true },
      ],
    })

    useBadgeStore.getState().deleteBadge('badge-1')
    const state = useBadgeStore.getState()

    expect(state.badges).toHaveLength(1)
    expect(state.badges[0].id).toBe('badge-2')
  })
})
