import { useEffect } from 'react'
import { useStaffStore } from '../stores/staffStore'
import { useRoleStore } from '../stores/roleStore'

/**
 * Hook to sync staff role_ids with actual role IDs from roleStore
 * This runs once on app initialization to replace placeholder role IDs
 */
export function useInitializeStaffRoles() {
  const staff = useStaffStore((state) => state.staff)
  const updateStaff = useStaffStore((state) => state.updateStaff)
  const roles = useRoleStore((state) => state.roles)

  useEffect(() => {
    // Only run if we have roles and staff with placeholder IDs
    if (roles.length === 0 || staff.length === 0) return

    // Check if any staff has placeholder role IDs (role-Cocinero, role-Mozo, etc.)
    const needsSync = staff.some((s) => s.role_id.startsWith('role-'))

    if (needsSync) {
      // Create a map of role names to IDs
      const roleNameToId = new Map<string, string>()
      roles.forEach((role) => {
        roleNameToId.set(role.name, role.id)
      })

      // Update each staff member with the correct role ID
      staff.forEach((staffMember) => {
        if (staffMember.role_id.startsWith('role-')) {
          // Extract role name from placeholder (e.g., "role-Cocinero" -> "Cocinero")
          const roleName = staffMember.role_id.replace('role-', '')
          const correctRoleId = roleNameToId.get(roleName)

          if (correctRoleId) {
            updateStaff(staffMember.id, { role_id: correctRoleId })
          }
        }
      })
    }
  }, [roles, staff, updateStaff])
}
