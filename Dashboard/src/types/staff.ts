/**
 * C002 FIX: Support multi-branch staff assignments
 */
export interface BranchRole {
  branch_id: string
  role: string
}

export interface Staff {
  id: string
  // C002 FIX: Primary branch (for backward compatibility)
  branch_id: string
  role_id: string
  // C002 FIX: All branch roles (supports multiple assignments)
  branch_roles: BranchRole[]
  first_name: string
  last_name: string
  email: string
  phone: string
  dni: string
  hire_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateStaffData = Omit<Staff, 'id' | 'created_at' | 'updated_at' | 'branch_roles'> & {
  branch_roles?: BranchRole[]
}
export type UpdateStaffData = Partial<CreateStaffData>
