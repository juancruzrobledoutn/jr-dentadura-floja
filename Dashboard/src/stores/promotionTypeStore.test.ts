/**
 * Tests for promotionTypeStore - Promotion type management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromotionTypeStore } from './promotionTypeStore'

describe('promotionTypeStore', () => {
  beforeEach(() => {
    usePromotionTypeStore.setState({
      promotionTypes: [],
    })
    vi.clearAllMocks()
  })

  it('should hold promotion types when set via setState', () => {
    usePromotionTypeStore.setState({
      promotionTypes: [
        { id: 'pt-1', name: 'Happy Hour', description: 'Descuentos especiales', icon: '🍺', is_active: true, created_at: '2024-01-01' },
        { id: 'pt-2', name: '2x1', description: 'Dos por uno', icon: '🎉', is_active: true, created_at: '2024-01-01' },
      ],
    })

    const state = usePromotionTypeStore.getState()
    expect(state.promotionTypes).toHaveLength(2)
    expect(state.promotionTypes[0].name).toBe('Happy Hour')
  })

  it('should add a promotion type with auto-generated id', () => {
    const newType = usePromotionTypeStore.getState().addPromotionType({
      name: 'Combo Estudiante',
      description: 'Descuento para estudiantes',
      icon: '🎓',
      is_active: true,
    })

    const state = usePromotionTypeStore.getState()
    expect(state.promotionTypes).toHaveLength(1)
    expect(newType.name).toBe('Combo Estudiante')
    expect(newType.id).toBeTruthy()
    expect(newType.icon).toBe('🎓')
  })

  it('should delete a promotion type from the list', () => {
    usePromotionTypeStore.setState({
      promotionTypes: [
        { id: 'pt-1', name: 'Happy Hour', description: 'Descuentos', icon: '🍺', is_active: true, created_at: '2024-01-01' },
        { id: 'pt-2', name: '2x1', description: 'Dos por uno', icon: '🎉', is_active: true, created_at: '2024-01-01' },
      ],
    })

    usePromotionTypeStore.getState().deletePromotionType('pt-1')
    const state = usePromotionTypeStore.getState()

    expect(state.promotionTypes).toHaveLength(1)
    expect(state.promotionTypes[0].id).toBe('pt-2')
  })
})
