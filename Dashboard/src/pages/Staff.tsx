import { useState, useMemo, useCallback, useActionState, useDeferredValue, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal } from '../hooks/useFormModal'
import { usePagination } from '../hooks/usePagination'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { useStaffStore } from '../stores/staffStore'
import { useRoleStore, selectRoles } from '../stores/roleStore'
import { useBranchStore, selectSelectedBranchId, selectBranches } from '../stores/branchStore'
import { useAuthStore, selectUserRoles, selectUserBranchIds } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateStaff } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateStaff, canEditStaff, canDelete, isAdmin } from '../utils/permissions'
import type { Staff, CreateStaffData } from '../types/staff'
import type { FormState } from '../types/form'

// Backend role values that map to frontend display
const BACKEND_ROLES = [
  { id: 'WAITER', name: 'WAITER' },
  { id: 'KITCHEN', name: 'KITCHEN' },
  { id: 'MANAGER', name: 'MANAGER' },
  { id: 'ADMIN', name: 'ADMIN' },
]

// REACT 19 IMPROVEMENT: Use useActionState for form handling
export default function StaffPage() {
  // REACT 19: Document metadata
  const { t } = useTranslation()
  useDocumentTitle(t('pages.staff.title'))
  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const allBranches = useBranchStore(selectBranches)
  const selectedBranch = useBranchStore((state) =>
    selectedBranchId ? state.branches.find((b) => b.id === selectedBranchId) : undefined
  )
  const staff = useStaffStore(
    useShallow((state) =>
      selectedBranchId
        ? state.staff.filter((s) =>
          // Check if staff has a role in the selected branch (using branch_roles array)
          s.branch_roles?.some((br) => br.branch_id === selectedBranchId) ||
          // Fallback to primary branch_id for backward compatibility
          s.branch_id === selectedBranchId
        )
        : []
    )
  )
  const createStaffAsync = useStaffStore((state) => state.createStaffAsync)
  const updateStaffAsync = useStaffStore((state) => state.updateStaffAsync)
  const deleteStaffAsync = useStaffStore((state) => state.deleteStaffAsync)
  const fetchStaff = useStaffStore((state) => state.fetchStaff)
  const roles = useRoleStore(selectRoles)

  // Fetch staff when component mounts or branch changes
  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const userBranchIds = useAuthStore(selectUserBranchIds)
  const userIsAdmin = isAdmin(userRoles)
  const canCreate = canCreateStaff(userRoles)
  const canEdit = canEditStaff(userRoles)
  const canDeleteStaff = canDelete(userRoles)

  // Filter branches available for the current user
  // ADMIN can see all branches, MANAGER only sees their assigned branches
  const availableBranches = useMemo(() => {
    if (userIsAdmin) {
      return allBranches.filter((b) => b.is_active)
    }
    // MANAGER: only branches they have access to
    return allBranches.filter(
      (b) => b.is_active && userBranchIds.includes(Number(b.id))
    )
  }, [allBranches, userIsAdmin, userBranchIds])

  // Filter roles available for the current user
  // ADMIN can assign any role, MANAGER cannot assign ADMIN role
  const availableRoles = useMemo(() => {
    if (userIsAdmin) {
      return BACKEND_ROLES
    }
    // MANAGER: cannot assign ADMIN role
    return BACKEND_ROLES.filter((r) => r.id !== 'ADMIN')
  }, [userIsAdmin])

  const [searchTerm, setSearchTerm] = useState('')
  // DASH-HIGH-05 FIX: Use useDeferredValue for debounced search
  const deferredSearchTerm = useDeferredValue(searchTerm)

  // SPRINT 14: Use custom hook for modal state
  const modal = useFormModal<CreateStaffData, Staff>({
    branch_id: selectedBranchId || '',
    role_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    dni: '',
    hire_date: new Date().toISOString().split('T')[0],
    is_active: true,
  })

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<CreateStaffData>, formData: FormData): Promise<FormState<CreateStaffData>> => {
      const data: CreateStaffData = {
        branch_id: formData.get('branch_id') as string,
        role_id: formData.get('role_id') as string,
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        dni: formData.get('dni') as string,
        hire_date: formData.get('hire_date') as string,
        is_active: formData.get('is_active') === 'on',
      }

      // DASH-008: Pass existing staff for duplicate validation
      const validation = validateStaff(data, {
        existingStaff: staff,
        editingStaffId: modal.selectedItem?.id,
      })
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          await updateStaffAsync(modal.selectedItem.id, data)
          toast.success(t('pages.staff.employeeUpdated'))
        } else {
          await createStaffAsync(data)
          toast.success(t('pages.staff.employeeCreated'))
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        const message = handleError(error, 'StaffPage.submitAction')
        toast.error(`${t('pages.staff.errorSaving')}: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateStaffAsync, createStaffAsync, staff]
  )

  const [state, formAction, isPending] = useActionState<FormState<CreateStaffData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 14: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // DASH-HIGH-05 FIX: Filter staff based on deferred search term for better performance
  const filteredStaff = useMemo(() => {
    return staff.filter(
      (s) =>
        s.first_name.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        s.last_name.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        s.email.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        s.dni.includes(deferredSearchTerm)
    )
  }, [staff, deferredSearchTerm])

  // DASH-009: Add pagination
  const {
    paginatedItems: paginatedStaff,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredStaff)

  // Get role display name
  // Backend returns role as string (WAITER, MANAGER, KITCHEN, ADMIN)
  const getRoleName = (roleId: string) => {
    const backendRole = BACKEND_ROLES.find((r) => r.id === roleId)
    if (backendRole) {
      return t(`pages.staff.roleLabels.${backendRole.name}`)
    }
    // Fallback to roleStore lookup for legacy IDs
    const role = roles.find((r) => r.id === roleId)
    return role?.name || roleId || t('pages.staff.noRole')
  }

  // SPRINT 14: Simplified modal handlers using custom hook
  const handleOpenModal = (staffMember?: Staff) => {
    if (staffMember) {
      modal.openEdit(staffMember, {
        branch_id: staffMember.branch_id,
        role_id: staffMember.role_id,
        first_name: staffMember.first_name,
        last_name: staffMember.last_name,
        email: staffMember.email,
        phone: staffMember.phone,
        dni: staffMember.dni,
        hire_date: staffMember.hire_date,
        is_active: staffMember.is_active,
      })
    } else {
      modal.openCreate({
        branch_id: selectedBranchId || '',
        role_id: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        dni: '',
        hire_date: new Date().toISOString().split('T')[0],
        is_active: true,
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm(t('pages.staff.confirmDelete'))) {
      try {
        await deleteStaffAsync(id)
        toast.success(t('pages.staff.employeeDeleted'))
      } catch (error) {
        const message = handleError(error, 'StaffPage.handleDelete')
        toast.error(`${t('pages.staff.errorDeleting')}: ${message}`)
      }
    }
  }

  if (!selectedBranchId) {
    return (
      <div className="space-y-6">
        <div>
          <h1
            className="text-3xl font-bold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Personal
          </h1>
          <p className="mt-2 text-[var(--text-tertiary)]">
            {t('pages.staff.description')}
          </p>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-[var(--text-muted)] text-lg">{t('pages.staff.selectBranchToContinue')}</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {t('pages.staff.title')} - {selectedBranch?.name}
        </h1>
        <p className="mt-2 text-[var(--text-tertiary)]">
          {t('pages.staff.descriptionBranch')}
        </p>
      </div>

      {/* Actions Bar */}
      <Card padding="sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder={t('pages.staff.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {canCreate && (
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
              Nuevo Empleado
            </Button>
          )}
        </div>
      </Card>

      {/* Staff Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--bg-tertiary)]">
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('common.name')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('pages.staff.role')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('common.email')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('common.phone')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('pages.staff.dni')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('pages.staff.hireDate')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('common.status')}</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-[var(--text-primary)]">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <p className="text-[var(--text-muted)] text-lg">{t('pages.staff.noStaffFound')}</p>
                    {searchTerm && (
                      <p className="text-[var(--text-muted)] text-sm mt-2">
                        {t('pages.staff.tryAnotherSearch')}
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedStaff.map((staffMember) => (
                  <tr
                    key={staffMember.id}
                    className="border-b border-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {staffMember.first_name} {staffMember.last_name}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-[var(--text-tertiary)]">{getRoleName(staffMember.role_id)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-[var(--text-tertiary)]">{staffMember.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-[var(--text-tertiary)]">{staffMember.phone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-[var(--text-tertiary)]">{staffMember.dni}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-[var(--text-tertiary)]">
                        {new Date(staffMember.hire_date).toLocaleDateString('es-AR')}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={staffMember.is_active ? 'success' : 'default'}>
                        {staffMember.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenModal(staffMember)}
                            leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                          >
                            Editar
                          </Button>
                        )}
                        {canDeleteStaff && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(staffMember.id)}
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            className="text-[var(--danger-border)] hover:text-[var(--danger-text)]"
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* DASH-009: Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* SPRINT 14: Modal using useFormModal hook */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.selectedItem ? t('pages.staff.editStaff') : t('pages.staff.newStaff')}
      >
        <form action={formAction} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Nombre *
              </label>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                value={modal.formData.first_name}
                onChange={(e) => modal.setFormData({ ...modal.formData, first_name: e.target.value })}
                placeholder="Juan"
                error={state.errors?.first_name}
              />
            </div>

            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Apellido *
              </label>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                value={modal.formData.last_name}
                onChange={(e) => modal.setFormData({ ...modal.formData, last_name: e.target.value })}
                placeholder="Pérez"
                error={state.errors?.last_name}
              />
            </div>
          </div>

          {/* Branch selector - ADMIN can change branch, MANAGER uses current branch */}
          <div>
            <label htmlFor="branch_id" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Sucursal *
            </label>
            <select
              id="branch_id"
              name="branch_id"
              value={modal.formData.branch_id}
              onChange={(e) => modal.setFormData({ ...modal.formData, branch_id: e.target.value })}
              className={`w-full px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent transition-colors ${state.errors?.branch_id ? 'border-[var(--danger-border)]' : 'border-[var(--text-muted)]'}`}
              disabled={!userIsAdmin && availableBranches.length === 1}
            >
              <option value="">{t('pages.staff.selectBranch')}</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {state.errors?.branch_id && (
              <p className="mt-1 text-sm text-[var(--danger-border)]">{state.errors.branch_id}</p>
            )}
            {!userIsAdmin && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('pages.staff.onlyYourBranches')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="role_id" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Rol *
            </label>
            <select
              id="role_id"
              name="role_id"
              value={modal.formData.role_id}
              onChange={(e) => modal.setFormData({ ...modal.formData, role_id: e.target.value })}
              className={`w-full px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent transition-colors ${state.errors?.role_id ? 'border-[var(--danger-border)]' : 'border-[var(--text-muted)]'}`}
            >
              <option value="">{t('pages.staff.selectRole')}</option>
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {state.errors?.role_id && (
              <p className="mt-1 text-sm text-[var(--danger-border)]">{state.errors.role_id}</p>
            )}
            {!userIsAdmin && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('pages.staff.onlyAdminCanAssignAdmin')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Email *
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={modal.formData.email}
              onChange={(e) => modal.setFormData({ ...modal.formData, email: e.target.value })}
              placeholder="juan.perez@example.com"
              error={state.errors?.email}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Teléfono *
              </label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={modal.formData.phone}
                onChange={(e) => modal.setFormData({ ...modal.formData, phone: e.target.value })}
                placeholder="+54 9 11 1234-5678"
                error={state.errors?.phone}
              />
            </div>

            <div>
              <label htmlFor="dni" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                DNI *
              </label>
              <Input
                id="dni"
                name="dni"
                type="text"
                value={modal.formData.dni}
                onChange={(e) => modal.setFormData({ ...modal.formData, dni: e.target.value })}
                placeholder="12345678"
                error={state.errors?.dni}
              />
            </div>
          </div>

          <div>
            <label htmlFor="hire_date" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Fecha de Ingreso *
            </label>
            <Input
              id="hire_date"
              name="hire_date"
              type="date"
              value={modal.formData.hire_date}
              onChange={(e) => modal.setFormData({ ...modal.formData, hire_date: e.target.value })}
              error={state.errors?.hire_date}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              checked={modal.formData.is_active}
              onChange={(e) => modal.setFormData({ ...modal.formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--text-muted)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-2 focus:ring-[var(--primary-500)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-[var(--text-secondary)]">
              Empleado activo
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" className="flex-1" isLoading={isPending}>
              {modal.selectedItem ? t('pages.staff.update') : t('common.create')}
            </Button>
            <Button type="button" variant="ghost" onClick={modal.close} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
