/**
 * Tests for customizationStore - Product customization options management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCustomizationStore } from './customizationStore'

vi.mock('../services/api', () => ({
  customizationAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setProductLinks: vi.fn(),
  },
}))

vi.mock('../utils/logger', () => ({
  handleError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'Error desconocido'
  ),
}))

import { customizationAPI } from '../services/api'

describe('customizationStore', () => {
  beforeEach(() => {
    useCustomizationStore.setState({
      options: [],
      isLoading: false,
      isSaving: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch customization options and populate state', async () => {
    const apiOptions = [
      { id: 1, name: 'Sin cebolla', type: 'removal', price_delta_cents: 0, is_active: true, product_ids: [] },
      { id: 2, name: 'Extra queso', type: 'addition', price_delta_cents: 200, is_active: true, product_ids: [1, 2] },
    ]
    vi.mocked(customizationAPI.list).mockResolvedValueOnce(apiOptions)

    await useCustomizationStore.getState().fetchOptions()
    const state = useCustomizationStore.getState()

    expect(state.options).toHaveLength(2)
    expect(state.options[0].name).toBe('Sin cebolla')
    expect(state.options[1].price_delta_cents).toBe(200)
    expect(state.isLoading).toBe(false)
  })

  it('should create an option and add to state', async () => {
    const created = { id: 3, name: 'Sin sal', type: 'removal', price_delta_cents: 0, is_active: true, product_ids: [] }
    vi.mocked(customizationAPI.create).mockResolvedValueOnce(created)

    const result = await useCustomizationStore.getState().createOption({
      name: 'Sin sal',
      type: 'removal',
      price_delta_cents: 0,
    })

    const state = useCustomizationStore.getState()
    expect(state.options).toHaveLength(1)
    expect(result.name).toBe('Sin sal')
    expect(state.isSaving).toBe(false)
  })

  it('should set product links and update option in state', async () => {
    useCustomizationStore.setState({
      options: [
        { id: 1, name: 'Sin cebolla', type: 'removal', price_delta_cents: 0, is_active: true, product_ids: [] },
      ],
    })

    const updated = { id: 1, name: 'Sin cebolla', type: 'removal', price_delta_cents: 0, is_active: true, product_ids: [10, 20] }
    vi.mocked(customizationAPI.setProductLinks).mockResolvedValueOnce(updated)

    await useCustomizationStore.getState().setProductLinks(1, [10, 20])
    const state = useCustomizationStore.getState()

    expect(state.options[0].product_ids).toEqual([10, 20])
    expect(state.isSaving).toBe(false)
  })
})
