/**
 * Customizations page - Manage reusable product customization options.
 * Examples: "Sin cebolla", "Extra queso", "Sin gluten".
 * Options can be linked to multiple products (M:N).
 */

import { useMemo, useCallback, useActionState, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Link2, Settings2 } from 'lucide-react'
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
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import {
  useCustomizationStore,
  selectCustomizationOptions,
  selectIsLoading,
  selectIsSaving,
} from '../stores/customizationStore'
import {
  useProductStore,
  selectProducts,
} from '../stores/productStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'
import { isAdmin } from '../utils/permissions'
import type { TableColumn } from '../types'
import type { FormState } from '../types/form'
import type { CustomizationOption } from '../services/api'

interface CustomizationFormData {
  name: string
  category: string
  extra_cost_cents: number
  order: number
}

const initialFormData: CustomizationFormData = {
  name: '',
  category: '',
  extra_cost_cents: 0,
  order: 0,
}

export function CustomizationsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.customizations.title'))

  const options = useCustomizationStore(selectCustomizationOptions)
  const isLoading = useCustomizationStore(selectIsLoading)
  const isSaving = useCustomizationStore(selectIsSaving)
  const fetchOptions = useCustomizationStore((s) => s.fetchOptions)
  const createOption = useCustomizationStore((s) => s.createOption)
  const updateOption = useCustomizationStore((s) => s.updateOption)
  const deleteOption = useCustomizationStore((s) => s.deleteOption)
  const setProductLinks = useCustomizationStore((s) => s.setProductLinks)

  const products = useProductStore(selectProducts)
  const fetchProducts = useProductStore((s) => s.fetchProducts)

  const userRoles = useAuthStore(selectUserRoles)
  const canManage = isAdmin(userRoles)

  const modal = useFormModal<CustomizationFormData, CustomizationOption>(initialFormData)
  const deleteDialog = useConfirmDialog<CustomizationOption>()

  // Product linking state
  const [linkingOption, setLinkingOption] = useState<CustomizationOption | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])

  // Category filter
  const [filterCategory, setFilterCategory] = useState<string>('')

  // Fetch data on mount
  useEffect(() => {
    fetchOptions()
    fetchProducts()
  }, [fetchOptions, fetchProducts])

  // Get unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>()
    options.forEach((opt) => {
      if (opt.category) cats.add(opt.category)
    })
    return Array.from(cats).sort()
  }, [options])

  // Filter options
  const filteredOptions = useMemo(() => {
    if (!filterCategory) return options
    return options.filter((opt) => opt.category === filterCategory)
  }, [options, filterCategory])

  // Pagination
  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredOptions)

  // Open create modal
  const openCreate = useCallback(() => {
    modal.openCreate(initialFormData)
  }, [modal])

  // Open edit modal
  const openEdit = useCallback(
    (option: CustomizationOption) => {
      modal.openEdit(option, {
        name: option.name,
        category: option.category || '',
        extra_cost_cents: option.extra_cost_cents,
        order: option.order,
      })
    },
    [modal]
  )

  // Open product linking modal
  const openLinkProducts = useCallback(
    (option: CustomizationOption) => {
      setLinkingOption(option)
      setSelectedProductIds(option.product_ids)
    },
    []
  )

  // Close product linking modal
  const closeLinkProducts = useCallback(() => {
    setLinkingOption(null)
    setSelectedProductIds([])
  }, [])

  // Save product links
  const saveProductLinks = useCallback(async () => {
    if (!linkingOption) return
    try {
      await setProductLinks(linkingOption.id, selectedProductIds)
      toast.success(t('pages.customizations.productsUpdated'))
      closeLinkProducts()
    } catch {
      toast.error(t('pages.customizations.errorUpdating'))
    }
  }, [linkingOption, selectedProductIds, setProductLinks, closeLinkProducts])

  // Toggle product selection
  const toggleProduct = useCallback((productId: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    )
  }, [])

  // Form submission
  const submitAction = useCallback(
    async (
      _prevState: FormState<CustomizationFormData>,
      formData: FormData
    ): Promise<FormState<CustomizationFormData>> => {
      const data: CustomizationFormData = {
        name: (formData.get('name') as string)?.trim() || '',
        category: (formData.get('category') as string)?.trim() || '',
        extra_cost_cents: parseInt(formData.get('extra_cost_cents') as string, 10) || 0,
        order: parseInt(formData.get('order') as string, 10) || 0,
      }

      if (!data.name) {
        return { errors: { name: t('pages.customizations.nameRequired') }, isSuccess: false }
      }

      try {
        const apiData = {
          name: data.name,
          category: data.category || null,
          extra_cost_cents: data.extra_cost_cents,
          order: data.order,
        }

        if (modal.selectedItem) {
          await updateOption(modal.selectedItem.id, apiData)
          toast.success(t('pages.customizations.customizationUpdated'))
        } else {
          await createOption(apiData)
          toast.success(t('pages.customizations.customizationCreated'))
        }
        return { isSuccess: true }
      } catch (error) {
        const message = handleError(error, 'Customizations.submitAction')
        toast.error(`Error: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateOption, createOption]
  )

  const [state, formAction, isPending] = useActionState<
    FormState<CustomizationFormData>,
    FormData
  >(submitAction, { isSuccess: false })

  // Close modal on success
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return
    try {
      await deleteOption(deleteDialog.item.id)
      toast.success(t('pages.customizations.customizationDeleted'))
      deleteDialog.close()
    } catch {
      toast.error(t('pages.customizations.errorDeleting'))
    }
  }, [deleteDialog, deleteOption])

  // Format price for display
  const formatCostDisplay = useCallback((cents: number) => {
    if (cents === 0) return '-'
    const sign = cents > 0 ? '+' : ''
    return `${sign}$${(cents / 100).toFixed(2)}`
  }, [])

  // Table columns
  const columns: TableColumn<CustomizationOption>[] = useMemo(
    () => [
      {
        key: 'name',
        label: t('pages.customizations.nameCol'),
        render: (item) => (
          <span className="font-medium">{item.name}</span>
        ),
      },
      {
        key: 'category',
        label: t('pages.customizations.categoryCol'),
        width: 'w-36',
        render: (item) =>
          item.category ? (
            <Badge variant="info">{item.category}</Badge>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          ),
      },
      {
        key: 'extra_cost',
        label: t('pages.customizations.extraCostCol'),
        width: 'w-28',
        render: (item) => (
          <span
            className={
              item.extra_cost_cents > 0
                ? 'text-[var(--success-text)]'
                : 'text-[var(--text-muted)]'
            }
          >
            {formatCostDisplay(item.extra_cost_cents)}
          </span>
        ),
      },
      {
        key: 'products',
        label: t('pages.customizations.productsCol'),
        width: 'w-32',
        render: (item) => (
          <Badge variant={item.product_ids.length > 0 ? 'success' : 'warning'}>
            {item.product_ids.length} producto{item.product_ids.length !== 1 ? 's' : ''}
          </Badge>
        ),
      },
      {
        key: 'actions',
        label: t('pages.customizations.actionsCol'),
        width: 'w-40',
        render: (item) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openLinkProducts(item)}
              disabled={!canManage}
              aria-label={`Vincular productos a ${item.name}`}
            >
              <Link2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(item)}
              disabled={!canManage}
              aria-label={`Editar ${item.name}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteDialog.open(item)}
              disabled={!canManage}
              aria-label={`Eliminar ${item.name}`}
            >
              <Trash2 className="w-4 h-4 text-[var(--danger-text)]" />
            </Button>
          </div>
        ),
      },
    ],
    [canManage, openEdit, openLinkProducts, deleteDialog, formatCostDisplay]
  )

  if (isLoading) {
    return (
      <PageContainer
        title={t('pages.customizations.title')}
        description={t('pages.customizations.selectBranchDesc')}
      >
        <TableSkeleton rows={5} />
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('pages.customizations.title')}
      description={t('pages.customizations.description')}
    >
      {/* Toolbar */}
      <Card className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Settings2 className="w-5 h-5 text-[var(--primary-500)]" />

            {categories.length > 0 && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-secondary)]"
              >
                <option value="">{t('pages.customizations.allCategories')}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            <span className="text-sm text-[var(--text-muted)]">
              {filteredOptions.length} {t('pages.customizations.options')}
            </span>
          </div>

          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Nueva personalización
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <Table
          data={paginatedItems}
          columns={columns}
          emptyMessage={t('pages.customizations.emptyMessage')}
          ariaLabel={t('pages.customizations.listLabel')}
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
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={
          modal.selectedItem
            ? t('pages.customizations.editCustomization')
            : t('pages.customizations.newCustomizationTitle')
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={modal.close}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="customization-form"
              isLoading={isPending || isSaving}
            >
              {modal.selectedItem ? t('common.save') : t('common.create')}
            </Button>
          </div>
        }
      >
        <form id="customization-form" action={formAction} className="space-y-4">
          <Input
            label={t('pages.customizations.nameCol')}
            name="name"
            defaultValue={modal.formData.name}
            placeholder={t('pages.customizations.namePlaceholder')}
            required
            error={state.errors?.name}
          />
          <Input
            label={t('pages.customizations.categoryCol')}
            name="category"
            defaultValue={modal.formData.category}
            placeholder={t('pages.customizations.categoryPlaceholder')}
          />
          <Input
            label={t('pages.customizations.extraCostLabel')}
            name="extra_cost_cents"
            type="number"
            defaultValue={String(modal.formData.extra_cost_cents)}
            placeholder={t('pages.customizations.extraCostPlaceholder')}
          />
          <Input
            label={t('pages.customizations.orderLabel')}
            name="order"
            type="number"
            defaultValue={String(modal.formData.order)}
            placeholder="0"
          />
        </form>
      </Modal>

      {/* Product Linking Modal */}
      <Modal
        isOpen={linkingOption !== null}
        onClose={closeLinkProducts}
        title={t('pages.customizations.productsWithOption', { name: linkingOption?.name || '' })}
        size="lg"
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-sm text-[var(--text-muted)]">
              {selectedProductIds.length} {t('pages.customizations.selected')}
            </span>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={closeLinkProducts}>
                Cancelar
              </Button>
              <Button onClick={saveProductLinks} isLoading={isSaving}>
                Guardar
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {products.length === 0 ? (
            <p className="text-[var(--text-muted)] text-center py-8">
              No hay productos disponibles. Crea productos primero.
            </p>
          ) : (
            products.map((product) => {
              const productId = parseInt(product.id, 10)
              const isSelected = selectedProductIds.includes(productId)
              return (
                <label
                  key={product.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                    ${
                      isSelected
                        ? 'bg-[var(--primary-500)]/10 border border-[var(--primary-500)]/30'
                        : 'bg-[var(--bg-tertiary)] border border-transparent hover:border-[var(--border-default)]'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleProduct(productId)}
                    className="rounded border-[var(--border-default)] accent-[var(--primary-500)]"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{product.name}</span>
                    {product.description && (
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {product.description}
                      </p>
                    )}
                  </div>
                </label>
              )
            })
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title={t('pages.customizations.confirmDeleteTitle')}
        message={t('pages.customizations.confirmDeleteMessage', { name: deleteDialog.item?.name || '' })}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </PageContainer>
  )
}

export default CustomizationsPage
