import { useState, useMemo, useCallback, useActionState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import {
  Card,
  Button,
  Table,
  Modal,
  Input,
  ImageUpload,
  Toggle,
  ConfirmDialog,
  Badge,
  Pagination,
  ProductSelect,
  BranchCheckboxes,
  HelpButton,
} from '../components/ui'
import { usePagination } from '../hooks/usePagination'
import {
  usePromotionStore,
  selectPromotions,
} from '../stores/promotionStore'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import {
  usePromotionTypeStore,
  selectPromotionTypes,
} from '../stores/promotionTypeStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validatePromotion } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreatePromotion, canEditPromotion, canDelete } from '../utils/permissions'
import { formatPrice } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
import type { Promotion, PromotionFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: PromotionFormData = {
  name: '',
  description: '',
  price: 0,
  image: '',
  start_date: '',
  end_date: '',
  start_time: '00:00',
  end_time: '23:59',
  promotion_type_id: '',
  branch_ids: [],
  items: [],
  is_active: true,
}

export function PromotionsPage() {
  // REACT 19: Document metadata
  const { t } = useTranslation()
  useDocumentTitle(t('pages.promotions.title'))

  const promotions = usePromotionStore(selectPromotions)
  const fetchPromotions = usePromotionStore((s) => s.fetchPromotions)
  const createPromotionAsync = usePromotionStore((s) => s.createPromotionAsync)
  const updatePromotionAsync = usePromotionStore((s) => s.updatePromotionAsync)
  const deletePromotionAsync = usePromotionStore((s) => s.deletePromotionAsync)
  // LOW-01 FIX: Prefixed unused variable (reserved for future loading state UI)
  const _isLoading = usePromotionStore((s) => s.isLoading)

  const branches = useBranchStore(selectBranches)
  const promotionTypes = usePromotionTypeStore(selectPromotionTypes)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreatePromotion(userRoles)
  const canEdit = canEditPromotion(userRoles)
  const canDeletePromotion = canDelete(userRoles)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null)
  const [formData, setFormData] = useState<PromotionFormData>(initialFormData)

  // Fetch promotions from backend on mount
  useEffect(() => {
    fetchPromotions()
  }, [fetchPromotions])

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<PromotionFormData>, formDataSubmit: FormData): Promise<FormState<PromotionFormData>> => {
      // Extract simple fields from FormData
      const data: PromotionFormData = {
        name: formDataSubmit.get('name') as string,
        description: formDataSubmit.get('description') as string,
        price: parseFloat(formDataSubmit.get('price') as string) || 0,
        image: formDataSubmit.get('image') as string,
        start_date: formDataSubmit.get('start_date') as string,
        end_date: formDataSubmit.get('end_date') as string,
        start_time: formDataSubmit.get('start_time') as string,
        end_time: formDataSubmit.get('end_time') as string,
        promotion_type_id: formDataSubmit.get('promotion_type_id') as string,
        is_active: formDataSubmit.get('is_active') === 'on',
        // Complex fields from component state (not FormData)
        branch_ids: formData.branch_ids,
        items: formData.items,
      }

      const validation = validatePromotion(data, { isEditing: !!selectedPromotion })
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (selectedPromotion) {
          await updatePromotionAsync(selectedPromotion.id, data)
          toast.success(t('pages.promotions.promotionUpdated'))
        } else {
          await createPromotionAsync(data)
          toast.success(t('pages.promotions.promotionCreated'))
        }
        return { isSuccess: true }
      } catch (error) {
        const message = handleError(error, 'PromotionsPage.submitAction')
        toast.error(`${t('pages.promotions.errorSaving')}: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [selectedPromotion, updatePromotionAsync, createPromotionAsync, formData.branch_ids, formData.items]
  )

  const [state, formAction, isPending] = useActionState<FormState<PromotionFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // Close modal on success
  if (state.isSuccess && isModalOpen) {
    setIsModalOpen(false)
    setSelectedPromotion(null)
    setFormData(initialFormData)
  }

  const sortedPromotions = useMemo(
    () => [...promotions].sort((a, b) => a.name.localeCompare(b.name)),
    [promotions]
  )

  const {
    paginatedItems: paginatedPromotions,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedPromotions)

  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches]
  )

  const promotionTypeMap = useMemo(
    () => new Map(promotionTypes.map((pt) => [pt.id, pt])),
    [promotionTypes]
  )

  const activeBranchIds = useMemo(
    () => branches.filter((b) => b.is_active !== false).map((b) => b.id),
    [branches]
  )

  const getBranchNames = useCallback(
    (branchIds: string[]) => {
      if (branchIds.length === branches.length) {
        return t('pages.promotions.allBranches')
      }
      if (branchIds.length === 0) {
        return t('pages.promotions.noBranches')
      }
      if (branchIds.length <= 2) {
        return branchIds.map((id) => branchMap.get(id) || id).join(', ')
      }
      return t('pages.promotions.branchesCount', { count: branchIds.length })
    },
    [branches.length, branchMap]
  )

  const openCreateModal = useCallback(() => {
    setSelectedPromotion(null)
    setFormData({
      ...initialFormData,
      branch_ids: activeBranchIds,
    })
    setIsModalOpen(true)
  }, [activeBranchIds])

  const openEditModal = useCallback((promotion: Promotion) => {
    setSelectedPromotion(promotion)
    setFormData({
      name: promotion.name,
      description: promotion.description || '',
      price: promotion.price,
      image: promotion.image || '',
      start_date: promotion.start_date,
      end_date: promotion.end_date,
      start_time: promotion.start_time || '00:00',
      end_time: promotion.end_time || '23:59',
      promotion_type_id: promotion.promotion_type_id || '',
      branch_ids: promotion.branch_ids,
      items: promotion.items,
      is_active: promotion.is_active ?? true,
    })
    setIsModalOpen(true)
  }, [])

  const openDeleteDialog = useCallback((promotion: Promotion) => {
    setSelectedPromotion(promotion)
    setIsDeleteOpen(true)
  }, [])


  const handleDelete = useCallback(async () => {
    if (!selectedPromotion) return

    try {
      // Validate promotion exists before delete
      const promotionExists = promotions.some((p) => p.id === selectedPromotion.id)
      if (!promotionExists) {
        toast.error(t('pages.promotions.promotionNotFound'))
        setIsDeleteOpen(false)
        return
      }

      // Delete from backend
      await deletePromotionAsync(selectedPromotion.id)
      toast.success(t('pages.promotions.promotionDeleted'))
      setIsDeleteOpen(false)
    } catch (error) {
      const message = handleError(error, 'PromotionsPage.handleDelete')
      toast.error(`${t('pages.promotions.errorDeleting')}: ${message}`)
    }
  }, [selectedPromotion, promotions, deletePromotionAsync])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR')
  }

  const isPromotionActive = useCallback((promotion: Promotion) => {
    if (promotion.is_active === false) return false

    // Use local date comparison to avoid timezone issues
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Compare dates as strings (YYYY-MM-DD format)
    return today >= promotion.start_date && today <= promotion.end_date
  }, [])

  const columns: TableColumn<Promotion>[] = useMemo(
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
        key: 'price',
        label: t('common.price'),
        width: 'w-28',
        render: (item) => (
          <span className="font-medium text-[var(--primary-500)]">
            {formatPrice(item.price)}
          </span>
        ),
      },
      {
        key: 'promotion_type_id',
        label: t('common.type'),
        width: 'w-32',
        render: (item) => {
          const promoType = promotionTypeMap.get(item.promotion_type_id)
          return promoType ? (
            <span className="text-sm">
              {promoType.icon && <span className="mr-1">{promoType.icon}</span>}
              {promoType.name}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          )
        },
      },
      {
        key: 'dates',
        label: t('pages.promotions.validity'),
        width: 'w-40',
        render: (item) => (
          <div className="text-sm text-[var(--text-tertiary)]">
            <div>{formatDate(item.start_date)} - {formatDate(item.end_date)}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {item.start_time || '00:00'} - {item.end_time || '23:59'}
            </div>
          </div>
        ),
      },
      {
        key: 'branch_ids',
        label: t('pages.promotions.branches'),
        width: 'w-32',
        render: (item) => (
          <span className="text-sm text-[var(--text-tertiary)]">
            {getBranchNames(item.branch_ids)}
          </span>
        ),
      },
      {
        key: 'items',
        label: t('pages.promotions.products'),
        width: 'w-24',
        render: (item) => (
          <span className="text-[var(--text-muted)]">
            {item.items.length} producto{item.items.length !== 1 ? 's' : ''}
          </span>
        ),
      },
      {
        key: 'is_active',
        label: t('common.status'),
        width: 'w-24',
        render: (item) =>
          isPromotionActive(item) ? (
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
            {canDeletePromotion && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openDeleteDialog(item)
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
    [getBranchNames, openEditModal, openDeleteDialog, promotionTypeMap, isPromotionActive, canEdit, canDeletePromotion]
  )

  return (
    <PageContainer
      title={t('pages.promotions.title')}
      description={t('pages.promotions.description')}
      helpContent={helpContent.promotions}
      actions={
        canCreate ? (
          <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
            Nueva Promocion
          </Button>
        ) : undefined
      }
    >
      <Card padding="none">
        <Table
          data={paginatedPromotions}
          columns={columns}
          emptyMessage={t('pages.promotions.noPromotions')}
          ariaLabel={t('pages.promotions.title')}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedPromotion ? t('pages.promotions.editPromotion') : t('pages.promotions.newPromotion')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="promotion-form" isLoading={isPending}>
              {selectedPromotion ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="promotion-form" action={formAction} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpButton
              title={t('pages.promotions.formTitle')}
              size="sm"
              content={
                <div className="space-y-3">
                  <p>
                    <strong>Completa los siguientes campos</strong> para crear o editar una promocion:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>
                      <strong>Nombre:</strong> Nombre descriptivo de la promocion (ej: Combo Familiar, 2x1 Hamburguesas). Es obligatorio.
                    </li>
                    <li>
                      <strong>Descripcion:</strong> Detalle de la promocion que veran los clientes.
                    </li>
                    <li>
                      <strong>Precio:</strong> Precio del combo o promocion.
                    </li>
                    <li>
                      <strong>Imagen:</strong> Foto para mostrar en el menu.
                    </li>
                    <li>
                      <strong>Tipo de Promocion:</strong> Categoria de la promocion (Happy Hour, 2x1, etc.).
                    </li>
                    <li>
                      <strong>Fechas:</strong> Periodo de vigencia de la promocion.
                    </li>
                    <li>
                      <strong>Horarios:</strong> Horas del dia en que aplica (ej: Happy Hour 17:00-20:00).
                    </li>
                    <li>
                      <strong>Productos:</strong> Selecciona los productos que forman parte del combo.
                    </li>
                    <li>
                      <strong>Sucursales:</strong> Donde estara disponible la promocion.
                    </li>
                  </ul>
                  <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                    <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                    <p className="text-sm mt-1">
                      Las promociones solo se mostraran durante el periodo y horario configurados. Asegurate de que las fechas sean correctas.
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
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Ej: Combo Familiar, 2x1 Hamburguesas"
            error={state.errors?.name}
          />

          <Input
            label={t('common.description')}
            name="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Descripcion de la promocion"
          />

          <Input
            label={t('common.price')}
            name="price"
            type="number"
            value={formData.price}
            onChange={(e) => {
              const value = e.target.value.trim()
              const parsed = value === '' ? 0 : Number(value)
              setFormData((prev) => ({
                ...prev,
                price: isNaN(parsed) ? 0 : Math.max(0, parsed),
              }))
            }}
            min={0}
            step={0.01}
            error={state.errors?.price}
          />

          <input type="hidden" name="image" value={formData.image} />
          <ImageUpload
            label={t('common.image')}
            value={formData.image}
            onChange={(url) =>
              setFormData((prev) => ({ ...prev, image: url }))
            }
          />

          {/* Tipo de Promocion */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Tipo de Promocion
            </label>
            <select
              name="promotion_type_id"
              value={formData.promotion_type_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, promotion_type_id: e.target.value }))
              }
              className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
              aria-label="Tipo de promoción"
            >
              <option value="">{t('pages.promotions.selectType')}</option>
              {promotionTypes
                .filter((pt) => pt.is_active !== false)
                .map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.icon && `${pt.icon} `}{pt.name}
                  </option>
                ))}
            </select>
            {state.errors?.promotion_type_id && (
              <p className="text-sm text-[var(--danger-icon)] mt-1">{state.errors.promotion_type_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('pages.promotions.startDateLabel')}
              name="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, start_date: e.target.value }))
              }
              error={state.errors?.start_date}
            />

            <Input
              label={t('pages.promotions.endDateLabel')}
              name="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, end_date: e.target.value }))
              }
              error={state.errors?.end_date}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('pages.promotions.startTimeLabel')}
              name="start_time"
              type="time"
              value={formData.start_time}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, start_time: e.target.value }))
              }
              error={state.errors?.start_time}
            />

            <Input
              label={t('pages.promotions.endTimeLabel')}
              name="end_time"
              type="time"
              value={formData.end_time}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, end_time: e.target.value }))
              }
              error={state.errors?.end_time}
            />
          </div>

          <div className="border-t border-[var(--border-default)] pt-4">
            <ProductSelect
              label={t('pages.promotions.productsInCombo')}
              value={formData.items}
              onChange={(items) =>
                setFormData((prev) => ({ ...prev, items }))
              }
              error={state.errors?.items}
            />
          </div>

          <div className="border-t border-[var(--border-default)] pt-4">
            <BranchCheckboxes
              label={t('pages.promotions.branchesWhereApplies')}
              value={formData.branch_ids}
              onChange={(branchIds) =>
                setFormData((prev) => ({ ...prev, branch_ids: branchIds }))
              }
              error={state.errors?.branch_ids}
            />
          </div>

          <Toggle
            label={t('pages.promotions.activePromotion')}
            name="is_active"
            checked={formData.is_active}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
            }
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('pages.promotions.deletePromotion')}
        message={`¿Estas seguro de eliminar "${selectedPromotion?.name}"?`}
        confirmLabel={t('common.delete')}
      />
    </PageContainer>
  )
}

export default PromotionsPage
