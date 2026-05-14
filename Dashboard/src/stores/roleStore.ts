import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role, CreateRoleData, UpdateRoleData } from '../types/role'

interface RoleState {
  roles: Role[]
  addRole: (data: CreateRoleData) => Role
  updateRole: (id: string, data: UpdateRoleData) => void
  deleteRole: (id: string) => void
  getRoleById: (id: string) => Role | undefined
}

// Predefined roles with descriptions
const PREDEFINED_ROLES: CreateRoleData[] = [
  {
    name: 'Cocinero',
    description: 'Responsable de la preparación de alimentos y platos',
    is_active: true,
  },
  {
    name: 'Mozo',
    description: 'Atiende a los clientes y toma pedidos',
    is_active: true,
  },
  {
    name: 'Administrativo',
    description: 'Maneja tareas administrativas y de oficina',
    is_active: true,
  },
  {
    name: 'Gerente',
    description: 'Supervisa operaciones y gestiona el personal',
    is_active: true,
  },
]

// Initialize predefined roles with IDs and timestamps
const initializePredefinedRoles = (): Role[] => {
  const now = new Date().toISOString()
  return PREDEFINED_ROLES.map((role, index) => ({
    ...role,
    id: `role-${index + 1}`,
    created_at: now,
    updated_at: now,
  }))
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set, get) => ({
      roles: initializePredefinedRoles(), // Always include predefined roles

      addRole: (data) => {
        const now = new Date().toISOString()
        const newRole: Role = {
          ...data,
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
        }
        set((state) => ({
          roles: [...state.roles, newRole],
        }))
        return newRole
      },

      updateRole: (id, data) => {
        set((state) => ({
          roles: state.roles.map((role) =>
            role.id === id
              ? { ...role, ...data, updated_at: new Date().toISOString() }
              : role
          ),
        }))
      },

      deleteRole: (id) => {
        set((state) => ({
          roles: state.roles.filter((role) => role.id !== id),
        }))
      },

      getRoleById: (id) => {
        return get().roles.find((role) => role.id === id)
      },
    }),
    {
      name: 'role-storage',
      version: 1,
    }
  )
)

// Selectors
export const selectRoles = (state: RoleState) => state.roles
export const selectActiveRoles = (state: RoleState) =>
  state.roles.filter((role) => role.is_active)
export const selectRoleById = (id: string) => (state: RoleState) =>
  state.roles.find((role) => role.id === id)
