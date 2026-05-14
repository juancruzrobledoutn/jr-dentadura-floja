import { useMemo, useCallback, useActionState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, MapPin, ExternalLink } from 'lucide-react'
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
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { CascadePreviewList } from '../components/ui/CascadePreviewList'
import { useBranchStore, selectBranches, selectBranchLoading } from '../stores/branchStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useRestaurantStore, selectRestaurant } from '../stores/restaurantStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { getBranchPreview } from '../services/cascadeService'
import { toast } from '../stores/toastStore'
import { validateBranch } from '../utils/validation'
import { canCreateBranch, canEditBranch, canDelete } from '../utils/permissions'
import { HOME_CATEGORY_NAME, BRANCH_DEFAULT_OPENING_TIME, BRANCH_DEFAULT_CLOSING_TIME } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
// MED-09 FIX: Use centralized logger instead of console.log
import { logDebug, logger } from '../utils/logger'
import type { Branch, BranchFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: BranchFormData = {
  name: '',
  address: '',
  phone: '',
  email: '',
  image: '',
  opening_time: BRANCH_DEFAULT_OPENING_TIME,
  closing_time: BRANCH_DEFAULT_CLOSING_TIME,
  is_active: true,
  order: 0,
}

export function BranchesPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.branches.title'))

  const navigate = useNavigate()
  const restaurant = useRestaurantStore(selectRestaurant)
  const branches = useBranchStore(selectBranches)
  // HIGH-08 FIX: Use loading state to show skeleton while fetching
  const isLoadingBranches = useBranchStore(selectBranchLoading)
  const createBranchAsync = useBranchStore((s) => s.createBranchAsync)
  const updateBranchAsync = useBranchStore((s) => s.updateBranchAsync)
  const deleteBranchAsync = useBranchStore((s) => s.deleteBranchAsync)
  const selectBranch = useBranchStore((s) => s.selectBranch)

  const getByBranch = useCategoryStore((s) => s.getByBranch)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateBranch(userRoles)
  const canEdit = canEditBranch(userRoles)
  const canDeleteBranch = canDelete(userRoles)

  // SPRINT 12: Use custom hooks for modal and dialog state
  const modal = useFormModal<BranchFormData, Branch>(initialFormData)
  const deleteDialog = useConfirmDialog<Branch>()

  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.order - b.order),
    [branches]
  )

  const {
    paginatedItems: paginatedBranches,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedBranches)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<BranchFormData>, formData: FormData): Promise<FormState<BranchFormData>> => {
      const data: BranchFormData = {
        name: formData.get('name') as string,
        address: formData.get('address') as string,
        phone: formData.get('phone') as string,
        email: formData.get('email') as string,
        image: formData.get('image') as string,
        opening_time: formData.get('opening_time') as string,
        closing_time: formData.get('closing_time') as string,
        is_active: formData.get('is_active') === 'on',
        order: parseInt(formData.get('order') as string, 10) || 0,
      }

      const validation = validateBranch(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        // MED-09 FIX: Use centralized logger instead of console.log
        logDebug('Creating/updating branch', 'BranchesPage', { selectedItem: modal.selectedItem, restaurant, data })
        if (modal.selectedItem) {
          await updateBranchAsync(modal.selectedItem.id, data)
          toast.success(t('toasts.updateSuccessFem', { entity: t('pages.branches.title') }))
        } else {
          if (!restaurant) {
            toast.error(t('pages.branches.createRestaurantFirst'))
            return { isSuccess: false, message: 'No hay restaurante' }
          }
          await createBranchAsync({ ...data, restaurant_id: restaurant.id })
          toast.success(t('toasts.createSuccessFem', { entity: t('pages.branches.title') }))
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        // Show detailed error for debugging
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
        // MED-09 FIX: Use centralized logger instead of console.error
        logger.error('BranchesPage.submitAction', errorMessage, error)
        toast.error(`Error al guardar la sucursal: ${errorMessage}`)
        return { isSuccess: false, message: `Error: ${errorMessage}` }
      }
    },
    [modal.selectedItem, updateBranchAsync, createBranchAsync, restaurant]
  )

  const [state, formAction, isPending] = useActionState<FormState<BranchFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // Track previous isPending to detect when submission completes
  const wasPendingRef = useRef(false)

  // SPRINT 12: Close modal when submission completes successfully
  // This detects the transition: isPending true -> false with isSuccess true
  useEffect(() => {
    if (wasPendingRef.current && !isPending && state.isSuccess && modal.isOpen) {
      modal.close()
    }
    wasPendingRef.current = isPending
  }, [isPending, state.isSuccess, modal.isOpen, modal])

  // SPRINT 12: Simplified modal handlers using custom hook
  const openCreateModal = useCallback(() => {
    const orders = branches.map((b) => b.order).filter((o) => typeof o === 'number' && !isNaN(o))
    modal.openCreate({
      order: (orders.length > 0 ? Math.max(...orders) : 0) + 1,
    })
  }, [branches, modal])

  const openEditModal = useCallback((branch: Branch) => {
    modal.openEdit(branch, {
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      image: branch.image || '',
      opening_time: branch.opening_time ?? BRANCH_DEFAULT_OPENING_TIME,
      closing_time: branch.closing_time ?? BRANCH_DEFAULT_CLOSING_TIME,
      is_active: branch.is_active ?? true,
      order: branch.order,
    })
  }, [modal])

  const handleViewMenu = useCallback(
    (branch: Branch) => {
      selectBranch(branch.id)
      navigate('/categories')
    },
    [selectBranch, navigate]
  )

  // SPRINT 12: Simplified delete handler - now async for backend integration
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      await deleteBranchAsync(deleteDialog.item.id)
      toast.success(t('toasts.deleteSuccessFem', { entity: t('pages.branches.title') }))
      deleteDialog.close()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      // MED-09 FIX: Use centralized logger instead of console.error
      logger.error('BranchesPage.handleDelete', errorMessage, error)
      toast.error(`Error al eliminar la sucursal: ${errorMessage}`)
      deleteDialog.close()
    }
  }, [deleteDialog, deleteBranchAsync])

  const columns: TableColumn<Branch>[] = useMemo(
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
              aria-label="Sin imagen"
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
        key: 'address',
        label: t('common.address'),
        render: (item) => (
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <MapPin className="w-4 h-4" aria-hidden="true" />
            {item.address || '-'}
          </div>
        ),
      },
      {
        key: 'hours',
        label: t('pages.branches.schedule'),
        width: 'w-32',
        render: (item) => (
          <span className="text-sm text-[var(--text-tertiary)]">
            {item.opening_time || BRANCH_DEFAULT_OPENING_TIME} - {item.closing_time || BRANCH_DEFAULT_CLOSING_TIME}
          </span>
        ),
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
        key: 'categories',
        label: t('pages.categories.title'),
        width: 'w-28',
        render: (item) => {
          const count = getByBranch(item.id).filter((c) => c.name !== HOME_CATEGORY_NAME).length
          return <span className="text-[var(--text-muted)]">{count} {t('pages.categories.subcategoriesCount')}</span>
        },
      },
      {
        key: 'actions',
        label: t('common.actions'),
        width: 'w-36',
        render: (item) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleViewMenu(item)
              }}
              aria-label={`Ver menu de ${item.name}`}
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </Button>
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
            {canDeleteBranch && (
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
    [getByBranch, handleViewMenu, openEditModal, deleteDialog, canEdit, canDeleteBranch]
  )

  return (
    <>
      {/* REACT 19 IMPROVEMENT: Document metadata */}
      <title>Sucursales - Dashboard</title>
      <meta name="description" content="Administración de sucursales del restaurante" />

      <PageContainer
        title={t('pages.branches.title')}
        description={t('pages.branches.description')}
        helpContent={helpContent.branches}
        actions={
          canCreate ? (
            <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              {t('pages.branches.newBranch')}
            </Button>
          ) : undefined
        }
      >
        <Card padding="none">
          {/* HIGH-08 FIX: Show loading skeleton while fetching branches */}
          {isLoadingBranches ? (
            <TableSkeleton rows={5} columns={7} />
          ) : (
            <Table
              data={paginatedBranches}
              columns={columns}
              emptyMessage={t('pages.branches.noBranches')}
              ariaLabel="Lista de sucursales"
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

        {/* SPRINT 12: Modal using useFormModal hook */}
        <Modal
          isOpen={modal.isOpen}
          onClose={modal.close}
          title={modal.selectedItem ? t('pages.branches.editBranch') : t('pages.branches.newBranch')}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={modal.close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="branch-form" isLoading={isPending}>
                {modal.selectedItem ? t('common.save') : t('common.create')}
              </Button>
            </>
          }
        >
          <form id="branch-form" action={formAction} className="space-y-4">
            <Input
              label={t('common.name')}
              name="name"
              value={modal.formData.name}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Ej: Buen Sabor Centro"
              error={state.errors?.name}
            />

            <Input
              label={t('common.address')}
              name="address"
              value={modal.formData.address}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, address: e.target.value }))
              }
              placeholder="Ej: Av. Corrientes 1234, CABA"
              error={state.errors?.address}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('common.phone')}
                name="phone"
                value={modal.formData.phone}
                onChange={(e) =>
                  modal.setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="Ej: +54 11 1234-5678"
                error={state.errors?.phone}
              />

              <Input
                label={t('common.email')}
                name="email"
                type="email"
                value={modal.formData.email}
                onChange={(e) =>
                  modal.setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Ej: sucursal@buensabor.com"
                error={state.errors?.email}
              />
            </div>

            <input type="hidden" name="image" value={modal.formData.image} />
            <ImageUpload
              label={t('common.image')}
              value={modal.formData.image}
              onChange={(url) => modal.setFormData((prev) => ({ ...prev, image: url }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('pages.branches.openingTime')}
                name="opening_time"
                type="time"
                value={modal.formData.opening_time}
                onChange={(e) =>
                  modal.setFormData((prev) => ({ ...prev, opening_time: e.target.value }))
                }
                error={state.errors?.opening_time}
              />

              <Input
                label={t('pages.branches.closingTime')}
                name="closing_time"
                type="time"
                value={modal.formData.closing_time}
                onChange={(e) =>
                  modal.setFormData((prev) => ({ ...prev, closing_time: e.target.value }))
                }
                error={state.errors?.closing_time}
              />
            </div>

            <Input
              label={t('common.order')}
              name="order"
              type="number"
              value={modal.formData.order}
              onChange={(e) =>
                modal.setFormData((prev) => ({
                  ...prev,
                  order: parseInt(e.target.value, 10) || 0,
                }))
              }
              min={0}
            />

            <Toggle
              label={t('pages.branches.branchActive')}
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
          title={t('pages.branches.deleteBranch')}
          message={`${t('modals.confirmDelete')} "${deleteDialog.item?.name}"?`}
          confirmLabel={t('common.delete')}
        >
          {deleteDialog.item && (() => {
            const preview = getBranchPreview(deleteDialog.item.id)
            return preview && preview.totalItems > 0 ? (
              <CascadePreviewList preview={preview} />
            ) : null
          })()}
        </ConfirmDialog>
      </PageContainer>
    </>
  )
}

export default BranchesPage
