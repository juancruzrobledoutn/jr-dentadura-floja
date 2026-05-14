import { useMemo, useCallback, useActionState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { HelpButton } from '../components/ui/HelpButton'
import { CascadePreviewList } from '../components/ui/CascadePreviewList'
import {
  usePromotionTypeStore,
  selectPromotionTypes,
} from '../stores/promotionTypeStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { deletePromotionTypeWithCascade, getPromotionTypePreview } from '../services/cascadeService'
import { toast } from '../stores/toastStore'
import { validatePromotionType } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreatePromotionType, canEditPromotionType, canDelete } from '../utils/permissions'
import { helpContent } from '../utils/helpContent'
import type { PromotionType, PromotionTypeFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: PromotionTypeFormData = {
  name: '',
  description: '',
  icon: '',
  is_active: true,
}

export function PromotionTypesPage() {
  // REACT 19: Document metadata
  const { t } = useTranslation()
  useDocumentTitle(t('pages.promotionTypes.title'))

  const promotionTypes = usePromotionTypeStore(selectPromotionTypes)
  const addPromotionType = usePromotionTypeStore((s) => s.addPromotionType)
  const updatePromotionType = usePromotionTypeStore((s) => s.updatePromotionType)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreatePromotionType(userRoles)
  const canEdit = canEditPromotionType(userRoles)
  const canDeletePromotionType = canDelete(userRoles)

  // SPRINT 13: Use custom hooks for modal and dialog state
  const modal = useFormModal<PromotionTypeFormData, PromotionType>(initialFormData)
  const deleteDialog = useConfirmDialog<PromotionType>()

  const sortedTypes = useMemo(
    () => [...promotionTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [promotionTypes]
  )

  const {
    paginatedItems: paginatedTypes,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedTypes)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<PromotionTypeFormData>, formData: FormData): Promise<FormState<PromotionTypeFormData>> => {
      const data: PromotionTypeFormData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        icon: formData.get('icon') as string,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validatePromotionType(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          updatePromotionType(modal.selectedItem.id, data)
          toast.success(t('pages.promotionTypes.typeUpdated'))
        } else {
          addPromotionType(data)
          toast.success(t('pages.promotionTypes.typeCreated'))
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        const message = handleError(error, 'PromotionTypesPage.submitAction')
        toast.error(`${t('pages.promotionTypes.errorSaving')}: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updatePromotionType, addPromotionType]
  )

  const [state, formAction, isPending] = useActionState<FormState<PromotionTypeFormData>, FormData>(
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

  const openEditModal = useCallback((promotionType: PromotionType) => {
    modal.openEdit(promotionType, {
      name: promotionType.name,
      description: promotionType.description || '',
      icon: promotionType.icon || '',
      is_active: promotionType.is_active ?? true,
    })
  }, [modal])

  // SPRINT 13: Simplified delete handler
  const handleDelete = useCallback(() => {
    if (!deleteDialog.item) return

    try {
      const result = deletePromotionTypeWithCascade(deleteDialog.item.id)

      if (!result.success) {
        toast.error(result.error || t('pages.promotionTypes.errorDeleting'))
        deleteDialog.close()
        return
      }

      toast.success(t('pages.promotionTypes.typeDeleted'))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'PromotionTypesPage.handleDelete')
      toast.error(`${t('pages.promotionTypes.errorDeleting')}: ${message}`)
    }
  }, [deleteDialog])

  const columns: TableColumn<PromotionType>[] = useMemo(
    () => [
      {
        key: 'icon',
        label: t('forms.labels.icon'),
        width: 'w-20',
        render: (item) => (
          <span className="text-2xl" role="img" aria-label={`Icono de ${item.name}`}>
            {item.icon || '-'}
          </span>
        ),
      },
      {
        key: 'name',
        label: t('common.name'),
        render: (item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.description && (
              <p className="text-xs text-[var(--text-muted)] truncate max-w-xs">
                {item.description}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'is_active',
        label: t('common.status'),
        width: 'w-24',
        render: (item) =>
          item.is_active !== false ? (
            <Badge variant="success">
              <span className="sr-only">Estado:</span> {t('common.active')}
            </Badge>
          ) : (
            <Badge variant="danger">
              <span className="sr-only">Estado:</span> {t('common.inactive')}
            </Badge>
          ),
      },
      {
        key: 'actions',
        label: t('common.actions'),
        width: 'w-28',
        render: (item) => (
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openEditModal(item)
                }}
                aria-label={`Editar ${item.name}`}
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
            {canDeletePromotionType && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteDialog.open(item)
                }}
                className="text-[var(--danger-icon)] hover:text-[var(--danger-text)] hover:bg-[var(--danger-border)]/10"
                aria-label={`Eliminar ${item.name}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [openEditModal, deleteDialog, canEdit, canDeletePromotionType]
  )

  return (
    <PageContainer
      title={t('pages.promotionTypes.title')}
      description={t('pages.promotionTypes.description')}
      helpContent={helpContent.promotionTypes}
      actions={
        canCreate ? (
          <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
            Nuevo Tipo
          </Button>
        ) : undefined
      }
    >
      <Card padding="none">
        <Table
          data={paginatedTypes}
          columns={columns}
          emptyMessage={t('pages.promotionTypes.noTypes')}
          ariaLabel={t('pages.promotionTypes.title')}
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
        title={modal.selectedItem ? t('pages.promotionTypes.editType') : t('pages.promotionTypes.newType')}
        footer={
          <>
            <Button variant="ghost" onClick={modal.close}>
              Cancelar
            </Button>
            <Button type="submit" form="promotion-type-form" isLoading={isPending}>
              {modal.selectedItem ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="promotion-type-form" action={formAction} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpButton
              title={t('pages.promotionTypes.formTitle')}
              size="sm"
              content={
                <div className="space-y-3">
                  <p>
                    <strong>Completa los siguientes campos</strong> para crear o editar un tipo de promocion:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>
                      <strong>Nombre:</strong> Nombre del tipo de promocion (ej: Happy Hour, 2x1, Combo Familiar). Es obligatorio.
                    </li>
                    <li>
                      <strong>Descripcion:</strong> Breve explicacion del tipo de promocion.
                    </li>
                    <li>
                      <strong>Icono:</strong> Un emoji representativo (ej: 🍺, 🎉, 💰). Se mostrara junto al nombre.
                    </li>
                    <li>
                      <strong>Tipo activo:</strong> Activa o desactiva la disponibilidad del tipo para crear nuevas promociones.
                    </li>
                  </ul>
                  <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                    <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                    <p className="text-sm mt-1">
                      Los tipos de promocion te ayudan a organizar y filtrar tus ofertas. Por ejemplo: Happy Hour para descuentos por horario, 2x1 para ofertas de cantidad.
                    </p>
                  </div>
                </div>
              }
            />
            <span className="text-sm text-[var(--text-tertiary)]">{t('common.formHelp')}</span>
          </div>

          <Input
            label={t('common.name')}
            name="name"
            value={modal.formData.name}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Ej: Happy Hour, 2x1, Combo Familiar"
            error={state.errors?.name}
          />

          <Input
            label={t('common.description')}
            name="description"
            value={modal.formData.description}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Descripcion del tipo de promocion"
          />

          <Input
            label={t('pages.promotionTypes.iconEmoji')}
            name="icon"
            value={modal.formData.icon}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, icon: e.target.value }))
            }
            placeholder="Ej: 🍺, 🎉, 💰"
          />

          <Toggle
            label={t('pages.promotionTypes.activeType')}
            name="is_active"
            checked={modal.formData.is_active}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
            }
          />
        </form>
      </Modal>

      {/* SPRINT 13: Delete confirmation using useConfirmDialog hook */}
      {/* DASH-006: Show cascade preview with affected items */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title={t('pages.promotionTypes.deleteType')}
        message={`¿Estas seguro de eliminar "${deleteDialog.item?.name}"?`}
        confirmLabel={t('common.delete')}
      >
        {deleteDialog.item && (() => {
          const preview = getPromotionTypePreview(deleteDialog.item.id)
          return preview && preview.totalItems > 0 ? (
            <CascadePreviewList preview={preview} />
          ) : (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {t('pages.promotionTypes.noPromotionsUsingType')}
            </p>
          )
        })()}
      </ConfirmDialog>
    </PageContainer>
  )
}

export default PromotionTypesPage
