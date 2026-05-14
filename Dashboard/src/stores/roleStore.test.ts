/**
 * Tests for roleStore - Staff role management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRoleStore } from './roleStore'

describe('roleStore', () => {
  beforeEach(() => {
    useRoleStore.setState({
      roles: [],
    })
    vi.clearAllMocks()
  })

  it('should hold roles when set via setState', () => {
    useRoleStore.setState({
      roles: [
        { id: 'role-1', name: 'Cocinero', description: 'Prepara alimentos', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'role-2', name: 'Mozo', description: 'Atiende clientes', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ],
    })

    const state = useRoleStore.getState()
    expect(state.roles).toHaveLength(2)
    expect(state.roles[0].name).toBe('Cocinero')
  })

  it('should add a role with auto-generated id', () => {
    const newRole = useRoleStore.getState().addRole({
      name: 'Sommelier',
      description: 'Especialista en vinos',
      is_active: true,
    })

    const state = useRoleStore.getState()
    expect(state.roles).toHaveLength(1)
    expect(newRole.name).toBe('Sommelier')
    expect(newRole.id).toBeTruthy()
    expect(newRole.description).toBe('Especialista en vinos')
  })

  it('should delete a role from the list', () => {
    useRoleStore.setState({
      roles: [
        { id: 'role-1', name: 'Cocinero', description: 'Prepara alimentos', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'role-2', name: 'Mozo', description: 'Atiende clientes', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ],
    })

    useRoleStore.getState().deleteRole('role-1')
    const state = useRoleStore.getState()

    expect(state.roles).toHaveLength(1)
    expect(state.roles[0].id).toBe('role-2')
  })
})
