import { useState, useMemo, useCallback, useActionState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Filter } from 'lucide-react'
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
import { Select } from '../components/ui/Select'
import { ImageUpload } from '../components/ui/ImageUpload'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { HelpButton } from '../components/ui/HelpButton'
import { CascadePreviewList } from '../components/ui/CascadePreviewList'
import { useCategoryStore, selectCategories } from '../stores/categoryStore'
import {
  useSubcategoryStore,
  selectSubcategories,
} from '../stores/subcategoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { deleteSubcategoryWithCascade, getSubcategoryPreview } from '../services/cascadeService'
import {
  useBranchStore,
  selectSelectedBranchId,
  selectBranchById,
} from '../stores/branchStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateSubcategory } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateSubcategory, canEditSubcategory, canDelete } from '../utils/permissions'
import { HOME_CATEGORY_NAME } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
import type { Subcategory, SubcategoryFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: SubcategoryFormData = {
  name: '',
  category_id: '',
  image: '',
  order: 0,
  is_active: true,
}

export function SubcategoriesPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.subcategories.title'))

  const navigate = useNavigate()

  // Use selectors for stable references
  const categories = useCategoryStore(selectCategories)
  const fetchCategories = useCategoryStore((s) => s.fetchCategories)
  const subcategories = useSubcategoryStore(selectSubcategories)
  const fetchSubcategories = useSubcategoryStore((s) => s.fetchSubcategories)
  const createSubcategoryAsync = useSubcategoryStore((s) => s.createSubcategoryAsync)
  const updateSubcategoryAsync = useSubcategoryStore((s) => s.updateSubcategoryAsync)
  const deleteSubcategoryAsync = useSubcategoryStore((s) => s.deleteSubcategoryAsync)
  const getByCategory = useSubcategoryStore((s) => s.getByCategory)

  const products = useProductStore(selectProducts)

  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const selectedBranch = useBranchStore(selectBranchById(selectedBranchId))

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateSubcategory(userRoles)
  const canEdit = canEditSubcategory(userRoles)
  const canDeleteSubcategory = canDelete(userRoles)

  // SPRINT 12: Use custom hooks for modal and dialog state
  const modal = useFormModal<SubcategoryFormData, Subcategory>(initialFormData)
  const deleteDialog = useConfirmDialog<Subcategory>()
  const [filterCategory, setFilterCategory] = useState<string>('')

  // Fetch data from backend when branch changes
  useEffect(() => {
    if (selectedBranchId) {
      const branchId = parseInt(selectedBranchId, 10)
      if (!isNaN(branchId)) {
        fetchCategories(branchId)
      }
    }
  }, [selectedBranchId, fetchCategories])

  // Fetch subcategories when categories change
  useEffect(() => {
    const categoryIds = categories
      .filter(c => c.branch_id === selectedBranchId)
      .map(c => parseInt(c.id, 10))
      .filter(id => !isNaN(id))

    // Fetch subcategories for each category
    categoryIds.forEach(categoryId => {
      fetchSubcategories(categoryId)
    })
  }, [categories, selectedBranchId, fetchSubcategories])

  // Filtrar categorias por sucursal seleccionada
  const branchCategories = useMemo(() => {
    if (!selectedBranchId) return []
    return categories.filter(
      (c) => c.branch_id === selectedBranchId && c.name !== HOME_CATEGORY_NAME
    )
  }, [categories, selectedBranchId])

  // Memoized derived data (Home categories already filtered by name in branchCategories)
  const selectableCategories = useMemo(
    () => branchCategories,
    [branchCategories]
  )

  const categoryOptions = useMemo(
    () => selectableCategories.map((c) => ({ value: c.id, label: c.name })),
    [selectableCategories]
  )

  const categoryMap = useMemo(
    () => new Map(branchCategories.map((c) => [c.id, c.name])),
    [branchCategories]
  )

  // Pre-calculate product counts per subcategory for O(1) lookup
  const productCountMap = useMemo(() => {
    const counts = new Map<string, number>()
    products.forEach((p) => {
      counts.set(p.subcategory_id, (counts.get(p.subcategory_id) || 0) + 1)
    })
    return counts
  }, [products])

  // Obtener IDs de categorias de esta sucursal
  const branchCategoryIds = useMemo(
    () => new Set(branchCategories.map((c) => c.id)),
    [branchCategories]
  )

  const filteredSubcategories = useMemo(() => {
    // Filtrar por sucursal primero
    let result = subcategories.filter((s) => branchCategoryIds.has(s.category_id))
    if (filterCategory) {
      result = result.filter((s) => s.category_id === filterCategory)
    }
    return result.sort((a, b) => {
      if (a.category_id !== b.category_id) {
        return a.category_id.localeCompare(b.category_id)
      }
      return a.order - b.order
    })
  }, [subcategories, branchCategoryIds, filterCategory])

  const {
    paginatedItems: paginatedSubcategories,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredSubcategories)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<SubcategoryFormData>, formData: FormData): Promise<FormState<SubcategoryFormData>> => {
      const data: SubcategoryFormData = {
        category_id: formData.get('category_id') as string,
        name: formData.get('name') as string,
        image: formData.get('image') as string,
        order: parseInt(formData.get('order') as string, 10) || 0,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateSubcategory(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          await updateSubcategoryAsync(modal.selectedItem.id, data)
          toast.success(t('toasts.updateSuccessFem', { entity: t('pages.subcategories.title') }))
        } else {
          await createSubcategoryAsync(data)
          toast.success(t('toasts.createSuccessFem', { entity: t('pages.subcategories.title') }))
        }
        return { isSuccess: true, message: t('toasts.savedSuccessfully') }
      } catch (error) {
        const message = handleError(error, 'SubcategoriesPage.submitAction')
        toast.error(t('toasts.saveError', { entity: t('pages.subcategories.title').toLowerCase(), message }))
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateSubcategoryAsync, createSubcategoryAsync]
  )

  const [state, formAction, isPending] = useActionState<FormState<SubcategoryFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 12: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // SPRINT 12: Simplified modal handlers using custom hook
  const openCreateModal = useCallback(() => {
    if (!selectedBranchId) {
      toast.error(t('common.selectBranchFirst'))
      return
    }
    if (selectableCategories.length === 0) {
      toast.error(t('pages.categories.noCategories'))
      return
    }
    const categoryId = filterCategory || selectableCategories[0]?.id || ''
    const categorySubcats = getByCategory(categoryId)
    const orders = categorySubcats.map((s) => s.order).filter((o) => typeof o === 'number' && !isNaN(o))
    modal.openCreate({
      ...initialFormData,
      category_id: categoryId,
      order: (orders.length > 0 ? Math.max(...orders) : 0) + 1,
    })
  }, [filterCategory, selectableCategories, getByCategory, selectedBranchId, modal])

  const openEditModal = useCallback((subcategory: Subcategory) => {
    modal.openEdit(subcategory, {
      name: subcategory.name,
      category_id: subcategory.category_id,
      image: subcategory.image,
      order: subcategory.order,
      is_active: subcategory.is_active ?? true,
    })
  }, [modal])

  // SPRINT 12: Simplified delete handler - now async with backend
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      // First cascade delete locally (products)
      const result = deleteSubcategoryWithCascade(deleteDialog.item.id)

      if (!result.success) {
        toast.error(result.error || t('toasts.deleteError', { entity: t('pages.subcategories.title').toLowerCase() }))
        deleteDialog.close()
        return
      }

      // Then delete from backend
      await deleteSubcategoryAsync(deleteDialog.item.id)

      toast.success(t('toasts.deleteSuccessFem', { entity: t('pages.subcategories.title') }))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'SubcategoriesPage.handleDelete')
      toast.error(t('toasts.deleteError', { entity: t('pages.subcategories.title').toLowerCase() }) + `: ${message}`)
    }
  }, [deleteDialog, deleteSubcategoryAsync])

  const columns: TableColumn<Subcategory>[] = useMemo(
    () => [
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
        key: 'category_id',
        label: t('pages.subcategories.category'),
        render: (item) => (
          <Badge variant="info">{categoryMap.get(item.category_id) || t('pages.subcategories.category')}</Badge>
        ),
      },
      {
        key: 'order',
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
        key: 'products',
        label: t('pages.products.title'),
        width: 'w-28',
        render: (item) => {
          const count = productCountMap.get(item.id) || 0
          return <span className="text-[var(--text-muted)]">{count} {t('pages.subcategories.productsCount')}</span>
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
            {canDeleteSubcategory && (
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
    [categoryMap, productCountMap, openEditModal, deleteDialog, canEdit, canDeleteSubcategory]
  )

  // Si no hay sucursal seleccionada, mostrar mensaje
  if (!selectedBranchId) {
    return (
      <PageContainer
        title={t('pages.subcategories.title')}
        description={t('pages.subcategories.selectBranch')}
        helpContent={helpContent.subcategories}
      >
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">
            {t('pages.subcategories.selectBranch')}
          </p>
          <Button onClick={() => navigate('/')}>{t('common.goToDashboard')}</Button>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={`${t('pages.subcategories.title')} - ${selectedBranch?.name || ''}`}
      description={`${t('pages.subcategories.description')} ${selectedBranch?.name || ''}`}
      helpContent={helpContent.subcategories}
      actions={
        canCreate ? (
          <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
            {t('pages.subcategories.newSubcategory')}
          </Button>
        ) : undefined
      }
    >
      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
          <Select
            options={[
              { value: '', label: t('common.all') + ' ' + t('pages.categories.title').toLowerCase() },
              ...categoryOptions,
            ]}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-64"
            aria-label="Filtrar por categoria"
          />
          {filterCategory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterCategory('')}
            >
              {t('pages.subcategories.clearFilter')}
            </Button>
          )}
        </div>
      </Card>

      <Card padding="none">
        <Table
          data={paginatedSubcategories}
          columns={columns}
          emptyMessage={t('pages.subcategories.noSubcategories')}
          ariaLabel="Lista de subcategorias"
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* SPRINT 12: Modal using useFormModal hook */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.selectedItem ? t('pages.subcategories.editSubcategory') : t('pages.subcategories.newSubcategory')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={modal.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="subcategory-form" isLoading={isPending}>
              {modal.selectedItem ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="subcategory-form" action={formAction} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpButton
              title={t('pages.subcategories.formTitle')}
              size="sm"
              content={
                <div className="space-y-3">
                  <p>
                    <strong>Completa los siguientes campos</strong> para crear o editar una subcategoria:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>
                      <strong>Categoria:</strong> Selecciona la categoria padre a la que pertenece esta subcategoria.
                    </li>
                    <li>
                      <strong>Nombre:</strong> Nombre descriptivo de la subcategoria (ej: Hamburguesas, Pastas, Cervezas). Es obligatorio.
                    </li>
                    <li>
                      <strong>Imagen:</strong> Sube una imagen representativa de la subcategoria.
                    </li>
                    <li>
                      <strong>Orden:</strong> Numero que define la posicion de la subcategoria dentro de su categoria. Menor numero = aparece primero.
                    </li>
                    <li>
                      <strong>Subcategoria activa:</strong> Activa o desactiva la visibilidad en el menu publico.
                    </li>
                  </ul>
                  <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                    <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                    <p className="text-sm mt-1">
                      Las subcategorias ayudan a organizar mejor los productos. Por ejemplo: Bebidas &gt; Cervezas, Bebidas &gt; Jugos.
                    </p>
                  </div>
                </div>
              }
            />
            <span className="text-sm text-[var(--text-tertiary)]">{t('common.formHelp')}</span>
          </div>

          {/* Hidden input for category_id */}
          <input type="hidden" name="category_id" value={modal.formData.category_id} />

          <Select
            label={t('pages.subcategories.category')}
            options={categoryOptions}
            value={modal.formData.category_id}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, category_id: e.target.value }))
            }
            placeholder={t('pages.subcategories.selectCategory')}
            error={state.errors?.category_id}
          />

          <Input
            label={t('common.name')}
            name="name"
            value={modal.formData.name}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Ej: Hamburguesas, Pastas, Cervezas"
            error={state.errors?.name}
          />

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
            label={t('pages.subcategories.activeToggle')}
            name="is_active"
            checked={modal.formData.is_active}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
            }
          />
        </form>
      </Modal>

      {/* SPRINT 12: Delete confirmation using useConfirmDialog hook */}
      {/* DASH-006: Show cascade preview with affected items */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title={t('pages.subcategories.deleteSubcategory')}
        message={`${t('modals.confirmDelete')} "${deleteDialog.item?.name}"?`}
        confirmLabel={t('common.delete')}
      >
        {deleteDialog.item && (() => {
          const preview = getSubcategoryPreview(deleteDialog.item.id)
          return preview && preview.totalItems > 0 ? (
            <CascadePreviewList preview={preview} />
          ) : null
        })()}
      </ConfirmDialog>
    </PageContainer>
  )
}

export default SubcategoriesPage
