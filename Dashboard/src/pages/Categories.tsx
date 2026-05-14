import { useMemo, useCallback, useActionState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
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
import { ImageUpload } from '../components/ui/ImageUpload'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { HelpButton } from '../components/ui/HelpButton'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { CascadePreviewList } from '../components/ui/CascadePreviewList'
import {
  useCategoryStore,
  selectCategories,
} from '../stores/categoryStore'
import {
  useBranchStore,
  selectSelectedBranchId,
  selectBranchById,
} from '../stores/branchStore'
import { useSubcategoryStore } from '../stores/subcategoryStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { deleteCategoryWithCascade, getCategoryPreview } from '../services/cascadeService'
import { toast } from '../stores/toastStore'
import { validateCategory } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateCategory, canEditCategory, canDelete } from '../utils/permissions'
import { HOME_CATEGORY_NAME } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
import type { Category, CategoryFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: CategoryFormData = {
  name: '',
  icon: '',
  image: '',
  order: 0,
  branch_id: '',
  is_active: true,
}

export function CategoriesPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.categories.title'))

  const navigate = useNavigate()
  const categories = useCategoryStore(selectCategories)
  const fetchCategories = useCategoryStore((s) => s.fetchCategories)
  const createCategoryAsync = useCategoryStore((s) => s.createCategoryAsync)
  const updateCategoryAsync = useCategoryStore((s) => s.updateCategoryAsync)
  const deleteCategoryAsync = useCategoryStore((s) => s.deleteCategoryAsync)
  // HIGH-08 FIX: Use loading state to show skeleton while fetching
  const isLoading = useCategoryStore((s) => s.isLoading)

  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const selectedBranch = useBranchStore(selectBranchById(selectedBranchId))

  const getByCategory = useSubcategoryStore((s) => s.getByCategory)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateCategory(userRoles)
  const canEdit = canEditCategory(userRoles)
  const canDeleteCategory = canDelete(userRoles)

  // SPRINT 11: Use custom hooks for modal and dialog state
  const modal = useFormModal<CategoryFormData, Category>(initialFormData)
  const deleteDialog = useConfirmDialog<Category>()

  // Fetch categories from backend when branch changes
  useEffect(() => {
    if (selectedBranchId) {
      const branchId = parseInt(selectedBranchId, 10)
      if (!isNaN(branchId)) {
        fetchCategories(branchId)
      }
    }
  }, [selectedBranchId, fetchCategories])

  // Filtrar categorías por sucursal seleccionada
  const branchCategories = useMemo(() => {
    if (!selectedBranchId) return []
    return categories.filter(
      (c) => c.branch_id === selectedBranchId && c.name !== HOME_CATEGORY_NAME
    )
  }, [categories, selectedBranchId])

  const sortedCategories = useMemo(
    () => [...branchCategories].sort((a, b) => a.order - b.order),
    [branchCategories]
  )

  const {
    paginatedItems: paginatedCategories,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedCategories)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<CategoryFormData>, formData: FormData): Promise<FormState<CategoryFormData>> => {
      const data: CategoryFormData = {
        branch_id: formData.get('branch_id') as string,
        name: formData.get('name') as string,
        icon: formData.get('icon') as string,
        image: formData.get('image') as string,
        order: parseInt(formData.get('order') as string, 10) || 0,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateCategory(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          await updateCategoryAsync(modal.selectedItem.id, data)
          toast.success(t('toasts.updateSuccessFem', { entity: t('pages.categories.title') }))
        } else {
          await createCategoryAsync(data)
          toast.success(t('toasts.createSuccessFem', { entity: t('pages.categories.title') }))
        }
        return { isSuccess: true, message: t('toasts.savedSuccessfully') }
      } catch (error) {
        const message = handleError(error, 'CategoriesPage.submitAction')
        toast.error(t('toasts.saveError', { entity: t('pages.categories.title').toLowerCase(), message }))
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateCategoryAsync, createCategoryAsync]
  )

  const [state, formAction, isPending] = useActionState<FormState<CategoryFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 11: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // SPRINT 11: Simplified modal handlers using custom hook
  const openCreateModal = useCallback(() => {
    if (!selectedBranchId) {
      toast.error(t('common.selectBranchFirst'))
      return
    }
    const orders = branchCategories.map((c) => c.order).filter((o) => typeof o === 'number' && !isNaN(o))
    modal.openCreate({
      ...initialFormData,
      branch_id: selectedBranchId,
      order: (orders.length > 0 ? Math.max(...orders) : 0) + 1,
    })
  }, [branchCategories, selectedBranchId, modal])

  const openEditModal = useCallback(
    (category: Category) => {
      modal.openEdit(category, {
        name: category.name,
        icon: category.icon || '',
        image: category.image || '',
        order: category.order,
        branch_id: category.branch_id,
        is_active: category.is_active ?? true,
      })
    },
    [modal]
  )

  // SPRINT 11: Simplified delete handler - now async with backend
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      // First cascade delete locally (subcategories, products)
      const result = deleteCategoryWithCascade(deleteDialog.item.id)

      if (!result.success) {
        toast.error(result.error || t('toasts.deleteError', { entity: t('pages.categories.title').toLowerCase() }))
        deleteDialog.close()
        return
      }

      // Then delete from backend
      await deleteCategoryAsync(deleteDialog.item.id)

      toast.success(t('toasts.deleteSuccessFem', { entity: t('pages.categories.title') }))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'CategoriesPage.handleDelete')
      toast.error(t('toasts.deleteError', { entity: t('pages.categories.title').toLowerCase() }) + `: ${message}`)
    }
  }, [deleteDialog, deleteCategoryAsync])

  const columns: TableColumn<Category>[] = useMemo(
    () => [
      {
        key: 'order',
        label: '',
        width: 'w-10',
        render: () => (
          <GripVertical
            className="w-4 h-4 text-[var(--text-muted)] cursor-grab"
            aria-hidden="true"
          />
        ),
      },
      {
        key: 'image',
        label: t('common.image'),
        width: 'w-20',
        render: (item) =>
          item.image ? (
            <img
              src={item.image}
              alt={`Imagen de ${item.name}`}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)]"
              aria-label={t('common.noImage')}
            >
              -
            </div>
          ),
      },
      {
        key: 'name',
        label: t('common.name'),
        render: (item) => <span className="font-medium">{item.name}</span>,
      },
      {
        key: 'orderDisplay',
        label: t('common.order'),
        width: 'w-20',
        render: (item) => item.order,
      },
      {
        key: 'is_active',
        label: t('common.status'),
        width: 'w-24',
        render: (item) =>
          item.is_active !== false ? (
            <Badge variant="success">
              <span className="sr-only">{t('common.status')}:</span> {t('common.active')}
            </Badge>
          ) : (
            <Badge variant="danger">
              <span className="sr-only">{t('common.status')}:</span> {t('common.inactive')}
            </Badge>
          ),
      },
      {
        key: 'subcategories',
        label: t('pages.subcategories.title'),
        width: 'w-32',
        render: (item) => {
          const count = getByCategory(item.id).length
          return <span className="text-[var(--text-muted)]">{count} {t('pages.categories.subcategoriesCount')}</span>
        },
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
            {canDeleteCategory && (
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
    [getByCategory, openEditModal, deleteDialog, canEdit, canDeleteCategory]
  )

  // Si no hay sucursal seleccionada, mostrar mensaje
  if (!selectedBranchId) {
    return (
      <PageContainer
        title={t('pages.categories.title')}
        description={t('pages.categories.selectBranch')}
        helpContent={helpContent.categories}
      >
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">
            {t('pages.categories.selectBranchFromDashboard')}
          </p>
          <Button onClick={() => navigate('/')}>{t('common.goToDashboard')}</Button>
        </Card>
      </PageContainer>
    )
  }

  return (
    <>
      {/* REACT 19 IMPROVEMENT: Document metadata */}
      <title>{selectedBranch ? `Categorías - ${selectedBranch.name}` : 'Categorías - Dashboard'}</title>
      <meta name="description" content={`Administración de categorías de ${selectedBranch?.name || 'la sucursal'}`} />

      <PageContainer
        title={`${t('pages.categories.title')} - ${selectedBranch?.name || ''}`}
        description={`${t('pages.categories.description')} ${selectedBranch?.name || ''}`}
        helpContent={helpContent.categories}
        actions={
          canCreate ? (
            <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              {t('pages.categories.newCategory')}
            </Button>
          ) : undefined
        }
      >
        <Card padding="none">
          {/* HIGH-08 FIX: Show loading skeleton while fetching categories */}
          {isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : (
            <Table
              data={paginatedCategories}
              columns={columns}
              emptyMessage={t('pages.categories.noCategories')}
              ariaLabel={`Categorias de ${selectedBranch?.name || 'sucursal'}`}
            />
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </Card>

        {/* SPRINT 11: Modal using useFormModal hook */}
        <Modal
          isOpen={modal.isOpen}
          onClose={modal.close}
          title={modal.selectedItem ? t('pages.categories.editCategory') : t('pages.categories.newCategory')}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={modal.close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="category-form" isLoading={isPending}>
                {modal.selectedItem ? t('common.save') : t('common.create')}
              </Button>
            </>
          }
        >
          <form id="category-form" action={formAction} className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <HelpButton
                title={t('pages.categories.formTitle')}
                size="sm"
                content={
                  <div className="space-y-3">
                    <p>
                      <strong>Completa los siguientes campos</strong> para crear o editar una categoria:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>
                        <strong>Nombre:</strong> Nombre descriptivo de la categoria (ej: Comidas, Bebidas, Postres). Es obligatorio.
                      </li>
                      <li>
                        <strong>Icono:</strong> Un emoji o codigo de icono para representar visualmente la categoria (ej: 🍔, 🍺).
                      </li>
                      <li>
                        <strong>Imagen:</strong> Sube una imagen representativa de la categoria. Se mostrara en el menu.
                      </li>
                      <li>
                        <strong>Orden:</strong> Numero que define la posicion de la categoria en el menu. Menor numero = aparece primero.
                      </li>
                      <li>
                        <strong>Categoria activa:</strong> Activa o desactiva la visibilidad de la categoria en el menu publico.
                      </li>
                    </ul>
                    <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                      <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                      <p className="text-sm mt-1">
                        Las categorias inactivas no se mostraran en el menu publico pero se mantendran en el sistema con todos sus productos.
                      </p>
                    </div>
                  </div>
                }
              />
              <span className="text-sm text-[var(--text-tertiary)]">{t('common.formHelp')}</span>
            </div>

            <input type="hidden" name="branch_id" value={modal.formData.branch_id} />

            <Input
              label={t('common.name')}
              name="name"
              value={modal.formData.name}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={t('pages.categories.namePlaceholder')}
              error={state.errors?.name}
            />

            <Input
              label={t('pages.categories.iconLabel')}
              name="icon"
              value={modal.formData.icon}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, icon: e.target.value }))
              }
              placeholder={t('pages.categories.iconPlaceholder')}
            />

            <input type="hidden" name="image" value={modal.formData.image} />
            <ImageUpload
              label={t('common.image')}
              value={modal.formData.image}
              onChange={(url) =>
                modal.setFormData((prev) => ({ ...prev, image: url }))
              }
            />

            <Input
              label={t('common.order')}
              name="order"
              type="number"
              value={modal.formData.order}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, order: parseInt(e.target.value, 10) || 0 }))
              }
              min={0}
            />

            <Toggle
              label={t('pages.categories.activeToggle')}
              name="is_active"
              checked={modal.formData.is_active}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
              }
            />
          </form>
        </Modal>

        {/* SPRINT 11: Delete confirmation using useConfirmDialog hook */}
        {/* DASH-006: Show cascade preview with affected items */}
        <ConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={handleDelete}
          title={t('pages.categories.deleteCategory')}
          message={`${t('modals.confirmDelete')} "${deleteDialog.item?.name}"?`}
          confirmLabel={t('common.delete')}
        >
          {deleteDialog.item && (() => {
            const preview = getCategoryPreview(deleteDialog.item.id)
            return preview && preview.totalItems > 0 ? (
              <CascadePreviewList preview={preview} />
            ) : null
          })()}
        </ConfirmDialog>
      </PageContainer>
    </>
  )
}

export default CategoriesPage
