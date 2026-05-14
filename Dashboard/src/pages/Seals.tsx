import { useMemo, useCallback, useActionState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Shield } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal } from '../hooks/useFormModal'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { usePagination } from '../hooks/usePagination'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge as UIBadge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { useSealStore, selectSeals } from '../stores/sealStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateSeal } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateSeal, canEditSeal, canDelete } from '../utils/permissions'
import type { ProductSeal, SealFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: SealFormData = {
  name: '',
  color: '#f97316',
  icon: '',
  is_active: true,
}

export default function SealsPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.seals.title'))

  const seals = useSealStore(selectSeals)
  const addSeal = useSealStore((s) => s.addSeal)
  const updateSeal = useSealStore((s) => s.updateSeal)
  const deleteSeal = useSealStore((s) => s.deleteSeal)

  const products = useProductStore(selectProducts)
  const removeSealFromProducts = useProductStore((s) => s.removeSealFromProducts)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateSeal(userRoles)
  const canEdit = canEditSeal(userRoles)
  const canDeleteSeal = canDelete(userRoles)

  // SPRINT 13: Use custom hooks for modal and dialog state
  const modal = useFormModal<SealFormData, ProductSeal>(initialFormData)
  const deleteDialog = useConfirmDialog<ProductSeal>()

  const sortedSeals = useMemo(
    () => [...seals].sort((a, b) => a.name.localeCompare(b.name)),
    [seals]
  )

  const {
    paginatedItems: paginatedSeals,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedSeals)

  const getProductCount = useCallback(
    (sealName: string) => {
      return products.filter((p) => p.seal === sealName).length
    },
    [products]
  )

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<SealFormData>, formData: FormData): Promise<FormState<SealFormData>> => {
      const data: SealFormData = {
        name: formData.get('name') as string,
        color: formData.get('color') as string,
        icon: formData.get('icon') as string,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateSeal(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          updateSeal(modal.selectedItem.id, data)
          toast.success(t('toasts.updateSuccess', { entity: t('pages.seals.title') }))
        } else {
          addSeal(data)
          toast.success(t('toasts.createSuccess', { entity: t('pages.seals.title') }))
        }
        return { isSuccess: true, message: t('toasts.savedSuccessfully') }
      } catch (error) {
        const message = handleError(error, 'SealsPage.submitAction')
        toast.error(t('toasts.saveError', { entity: t('pages.seals.title').toLowerCase(), message }))
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateSeal, addSeal]
  )

  const [state, formAction, isPending] = useActionState<FormState<SealFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 13: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // SPRINT 13: Simplified modal handlers using custom hook
  const openCreateModal = useCallback(() => {
    modal.openCreate(initialFormData)
  }, [modal])

  const openEditModal = useCallback((seal: ProductSeal) => {
    modal.openEdit(seal, {
      name: seal.name,
      color: seal.color || '#f97316',
      icon: seal.icon || '',
      is_active: seal.is_active ?? true,
    })
  }, [modal])

  // SPRINT 13: Simplified delete handler
  const handleDelete = useCallback(() => {
    if (!deleteDialog.item) return

    try {
      const productCount = getProductCount(deleteDialog.item.name)

      // Remove seal from products if needed
      if (removeSealFromProducts && productCount > 0) {
        removeSealFromProducts(deleteDialog.item.name)
      }

      // Delete seal
      deleteSeal(deleteDialog.item.id)

      if (productCount > 0) {
        toast.warning(
          `Este sello estaba vinculado a ${productCount} producto(s). Se elimino la referencia.`
        )
      }

      toast.success(t('toasts.deleteSuccess', { entity: t('pages.seals.title') }))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'SealsPage.handleDelete')
      toast.error(t('toasts.deleteError', { entity: t('pages.seals.title').toLowerCase() }) + `: ${message}`)
    }
  }, [deleteDialog, getProductCount, deleteSeal, removeSealFromProducts])

  const columns: TableColumn<ProductSeal>[] = useMemo(
    () => [
      {
        key: 'preview',
        label: 'Preview',
        render: (seal) => (
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--success-icon)]" />
            <span
              className="text-xs px-2 py-1 rounded font-semibold flex items-center gap-1"
              style={{
                backgroundColor: `${seal.color}33`,
                color: seal.color,
              }}
            >
              {seal.icon && <span>{seal.icon}</span>}
              {seal.name}
            </span>
          </div>
        ),
      },
      {
        key: 'name',
        label: t('common.name'),
        sortable: true,
      },
      {
        key: 'icon',
        label: t('pages.badges.icon'),
        render: (seal) => (
          <span className="text-2xl">{seal.icon || '-'}</span>
        ),
      },
      {
        key: 'color',
        label: t('pages.badges.color'),
        render: (seal) => (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border border-[var(--border-default)]"
              style={{ backgroundColor: seal.color }}
            />
            <span className="text-sm text-[var(--text-tertiary)] font-mono">{seal.color}</span>
          </div>
        ),
      },
      {
        key: 'is_active',
        label: t('common.status'),
        render: (seal) => (
          <UIBadge variant={seal.is_active ? 'success' : 'danger'}>
            {seal.is_active ? t('status.active') : t('status.inactive')}
          </UIBadge>
        ),
      },
      {
        key: 'actions',
        label: '',
        render: (seal) => {
          const productCount = getProductCount(seal.name)
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(seal)}
                  aria-label={`Editar ${seal.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {canDeleteSeal && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDialog.open(seal)}
                  aria-label={`Eliminar ${seal.name}`}
                  disabled={productCount > 0}
                  title={
                    productCount > 0
                      ? `No se puede eliminar. ${productCount} producto(s) usan este sello.`
                      : undefined
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [getProductCount, openEditModal, deleteDialog, canEdit, canDeleteSeal]
  )

  return (
    <>
      <title>Sellos - Dashboard</title>
      <meta name="description" content="Gestión de sellos para características especiales de productos" />

      <PageContainer
        title={t('pages.seals.title')}
        actions={
          canCreate ? (
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              {t('pages.seals.newSeal')}
            </Button>
          ) : undefined
        }
      >
        <Card>
          <Table
            columns={columns}
            data={paginatedSeals}
            emptyMessage={t('pages.seals.noSeals')}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </Card>

        {/* SPRINT 13: Modal using useFormModal hook */}
        <Modal
          isOpen={modal.isOpen}
          onClose={modal.close}
          title={modal.selectedItem ? t('pages.seals.editSeal') : t('pages.seals.newSeal')}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={modal.close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="seal-form" isLoading={isPending}>
                {modal.selectedItem ? t('common.save') : t('common.create')}
              </Button>
            </>
          }
        >
          <form id="seal-form" action={formAction} className="space-y-4">
            <Input
              label={t('common.name')}
              name="name"
              placeholder="Ej: Vegano, Sin Gluten, Orgánico"
              value={modal.formData.name}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={state.errors?.name}
              required
            />

            <Input
              label={t('pages.badges.icon')}
              name="icon"
              placeholder="Ej: 🌱, 🥗, 🍃"
              value={modal.formData.icon}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, icon: e.target.value }))
              }
              error={state.errors?.icon}
            />

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                {t('pages.badges.color')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="color"
                  value={modal.formData.color}
                  onChange={(e) =>
                    modal.setFormData((prev) => ({ ...prev, color: e.target.value }))
                  }
                  className="h-10 w-20 rounded border border-[var(--border-default)] bg-[var(--bg-tertiary)] cursor-pointer"
                />
                <Input
                  name="color_text"
                  placeholder="#f97316"
                  value={modal.formData.color}
                  onChange={(e) =>
                    modal.setFormData((prev) => ({ ...prev, color: e.target.value }))
                  }
                  error={state.errors?.color}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {t('pages.seals.colorHint')}
              </p>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                {t('pages.badges.preview')}
              </label>
              <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)]">
                {modal.formData.name ? (
                  <span
                    className="inline-block text-xs px-2 py-1 rounded font-semibold"
                    style={{
                      backgroundColor: `${modal.formData.color}33`,
                      color: modal.formData.color,
                    }}
                  >
                    {modal.formData.icon && <span className="mr-1">{modal.formData.icon}</span>}
                    {modal.formData.name}
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">
                    {t('pages.badges.previewHint')}
                  </span>
                )}
              </div>
            </div>

            <Toggle
              label={t('common.active')}
              name="is_active"
              checked={modal.formData.is_active}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
              }
            />
          </form>
        </Modal>

        {/* SPRINT 13: Delete confirmation using useConfirmDialog hook */}
        <ConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={handleDelete}
          title={t('pages.seals.deleteSeal')}
          message={`${t('modals.confirmDelete')} "${deleteDialog.item?.name}"?`}
          confirmLabel={t('common.delete')}
        />
      </PageContainer>
    </>
  )
}
