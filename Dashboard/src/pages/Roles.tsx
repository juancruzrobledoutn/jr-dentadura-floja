import { useState, useMemo, useCallback, useActionState, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal } from '../hooks/useFormModal'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { useRoleStore, selectRoles } from '../stores/roleStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateRole } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateRole, canEditRole, canDelete } from '../utils/permissions'
import type { Role, CreateRoleData } from '../types/role'
import type { FormState } from '../types/form'

// REACT 19 IMPROVEMENT: Use useActionState for form handling
export default function Roles() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.roles.title'))
  const roles = useRoleStore(selectRoles)
  const addRole = useRoleStore((state) => state.addRole)
  const updateRole = useRoleStore((state) => state.updateRole)
  const deleteRole = useRoleStore((state) => state.deleteRole)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateRole(userRoles)
  const canEdit = canEditRole(userRoles)
  const canDeleteRole = canDelete(userRoles)

  const [searchTerm, setSearchTerm] = useState('')
  // DASH-HIGH-05 FIX: Use useDeferredValue for debounced search
  const deferredSearchTerm = useDeferredValue(searchTerm)

  // SPRINT 14: Use custom hook for modal state
  const modal = useFormModal<CreateRoleData, Role>({
    name: '',
    description: '',
    is_active: true,
  })

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<CreateRoleData>, formData: FormData): Promise<FormState<CreateRoleData>> => {
      const data: CreateRoleData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateRole(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          updateRole(modal.selectedItem.id, data)
          toast.success(t('toasts.updateSuccess', { entity: t('pages.roles.title') }))
        } else {
          addRole(data)
          toast.success(t('toasts.createSuccess', { entity: t('pages.roles.title') }))
        }
        return { isSuccess: true, message: t('toasts.savedSuccessfully') }
      } catch (error) {
        const message = handleError(error, 'RolesPage.submitAction')
        toast.error(t('toasts.saveError', { entity: t('pages.roles.title').toLowerCase(), message }))
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateRole, addRole]
  )

  const [state, formAction, isPending] = useActionState<FormState<CreateRoleData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 14: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // DASH-HIGH-05 FIX: Filter roles based on deferred search term for better performance
  const filteredRoles = useMemo(() => {
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        role.description.toLowerCase().includes(deferredSearchTerm.toLowerCase())
    )
  }, [roles, deferredSearchTerm])

  // SPRINT 14: Simplified modal handlers using custom hook
  const handleOpenModal = (role?: Role) => {
    if (role) {
      modal.openEdit(role, {
        name: role.name,
        description: role.description,
        is_active: role.is_active,
      })
    } else {
      modal.openCreate({
        name: '',
        description: '',
        is_active: true,
      })
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este rol?')) {
      deleteRole(id)
      toast.success(t('toasts.deleteSuccess', { entity: t('pages.roles.title') }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {t('pages.roles.title')}
        </h1>
        <p className="mt-2 text-[var(--text-tertiary)]">
          {t('pages.roles.description')}
        </p>
      </div>

      {/* Actions Bar */}
      <Card padding="sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder={t('common.search') + '...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {canCreate && (
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
              {t('pages.roles.newRole')}
            </Button>
          )}
        </div>
      </Card>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRoles.map((role) => (
          <Card key={role.id} padding="md">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3
                    className="text-lg font-semibold text-[var(--text-primary)]"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {role.name}
                  </h3>
                </div>
                <Badge variant={role.is_active ? 'success' : 'default'}>
                  {role.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </div>

              {/* Description */}
              <p className="text-sm text-[var(--text-tertiary)] mb-4 flex-1">{role.description}</p>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--bg-tertiary)]">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenModal(role)}
                    leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                    className="flex-1"
                  >
                    {t('common.edit')}
                  </Button>
                )}
                {canDeleteRole && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(role.id)}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    className="flex-1 text-[var(--danger-border)] hover:text-[var(--danger-text)]"
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredRoles.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <p className="text-[var(--text-muted)] text-lg">{t('pages.roles.noRoles')}</p>
            {searchTerm && (
              <p className="text-[var(--text-muted)] text-sm mt-2">
                Intenta con otro término de búsqueda
              </p>
            )}
          </div>
        </Card>
      )}

      {/* SPRINT 14: Modal using useFormModal hook */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.selectedItem ? t('pages.roles.editRole') : t('pages.roles.newRole')}
      >
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t('common.name')} *
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              value={modal.formData.name}
              onChange={(e) => modal.setFormData({ ...modal.formData, name: e.target.value })}
              placeholder="Ej: Cocinero, Mozo, Gerente..."
              error={state.errors?.name}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
            >
              {t('common.description')} *
            </label>
            <textarea
              id="description"
              name="description"
              value={modal.formData.description}
              onChange={(e) => modal.setFormData({ ...modal.formData, description: e.target.value })}
              placeholder="Describe las responsabilidades de este rol..."
              rows={3}
              className={`w-full px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent transition-colors ${state.errors?.description ? 'border-[var(--danger-border)]' : 'border-[var(--text-muted)]'}`}
            />
            {state.errors?.description && (
              <p className="mt-1 text-sm text-[var(--danger-border)]">{state.errors.description}</p>
            )}
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
              {t('pages.roles.roleActive')}
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" className="flex-1" isLoading={isPending}>
              {modal.selectedItem ? t('common.save') : t('common.create')}
            </Button>
            <Button type="button" variant="ghost" onClick={modal.close} className="flex-1">
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
