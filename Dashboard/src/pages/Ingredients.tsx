import React, { useEffect, useMemo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Package } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal, useConfirmDialog, usePagination } from '../hooks'
import { PageContainer } from '../components/layout'
import {
  Card,
  Button,
  Modal,
  Input,
  Select,
  Toggle,
  ConfirmDialog,
  Badge,
  Pagination,
} from '../components/ui'
import {
  useIngredientStore,
  selectIngredients,
  selectIngredientGroups,
  selectIngredientLoading,
} from '../stores/ingredientStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'
import { canDelete } from '../utils/permissions'
import type { Ingredient, IngredientFormData, TableColumn, SubIngredientFormData } from '../types'

const initialFormData: IngredientFormData = {
  name: '',
  description: '',
  group_id: undefined,
  is_processed: false,
}

const initialSubFormData: SubIngredientFormData = {
  name: '',
  description: '',
}

export function IngredientsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.ingredients.title'))

  const ingredients = useIngredientStore(selectIngredients)
  const groups = useIngredientStore(selectIngredientGroups)
  const isLoading = useIngredientStore(selectIngredientLoading)
  const fetchIngredients = useIngredientStore((s) => s.fetchIngredients)
  const fetchGroups = useIngredientStore((s) => s.fetchGroups)
  const createIngredientAsync = useIngredientStore((s) => s.createIngredientAsync)
  const updateIngredientAsync = useIngredientStore((s) => s.updateIngredientAsync)
  const deleteIngredientAsync = useIngredientStore((s) => s.deleteIngredientAsync)
  const createSubIngredientAsync = useIngredientStore((s) => s.createSubIngredientAsync)
  const deleteSubIngredientAsync = useIngredientStore((s) => s.deleteSubIngredientAsync)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canDeleteIngredient = canDelete(userRoles)

  // State for expanded rows (sub-ingredients)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // State for sub-ingredient modal
  const [subIngredientModal, setSubIngredientModal] = useState<{
    isOpen: boolean
    ingredientId: string | null
    ingredientName: string
  }>({ isOpen: false, ingredientId: null, ingredientName: '' })
  const [subFormData, setSubFormData] = useState<SubIngredientFormData>(initialSubFormData)

  // Filter by group
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')

  // Modal and dialog hooks
  const modal = useFormModal<IngredientFormData, Ingredient>(initialFormData)
  const deleteDialog = useConfirmDialog<Ingredient>()

  // Fetch data on mount
  useEffect(() => {
    fetchGroups()
    fetchIngredients()
  }, [fetchGroups, fetchIngredients])

  // Filter ingredients by selected group
  const filteredIngredients = useMemo(() => {
    if (!selectedGroupId) return ingredients
    const groupId = parseInt(selectedGroupId, 10)
    return ingredients.filter((ing) => ing.group_id === groupId)
  }, [ingredients, selectedGroupId])

  const sortedIngredients = useMemo(
    () => [...filteredIngredients].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredIngredients]
  )

  const {
    paginatedItems: paginatedIngredients,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedIngredients)

  // Toggle row expansion
  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (!modal.formData.name.trim()) {
        toast.error(t('pages.ingredients.nameRequired'))
        return
      }

      try {
        if (modal.selectedItem) {
          await updateIngredientAsync(modal.selectedItem.id, modal.formData)
          toast.success(t('pages.ingredients.ingredientUpdated'))
        } else {
          await createIngredientAsync(modal.formData)
          toast.success(t('pages.ingredients.ingredientCreated'))
        }
        modal.close()
      } catch (error) {
        const message = handleError(error, 'IngredientsPage.handleSubmit')
        toast.error(`Error: ${message}`)
      }
    },
    [modal, createIngredientAsync, updateIngredientAsync]
  )

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      await deleteIngredientAsync(deleteDialog.item.id)
      toast.success(t('pages.ingredients.ingredientDeleted'))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'IngredientsPage.handleDelete')
      toast.error(`Error: ${message}`)
    }
  }, [deleteDialog, deleteIngredientAsync])

  // Open edit modal
  const openEditModal = useCallback(
    (ingredient: Ingredient) => {
      modal.openEdit(ingredient, {
        name: ingredient.name,
        description: ingredient.description || '',
        group_id: ingredient.group_id,
        is_processed: ingredient.is_processed,
      })
    },
    [modal]
  )

  // Sub-ingredient modal handlers
  const openSubIngredientModal = useCallback((ingredient: Ingredient) => {
    setSubIngredientModal({
      isOpen: true,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
    })
    setSubFormData(initialSubFormData)
  }, [])

  const closeSubIngredientModal = useCallback(() => {
    setSubIngredientModal({ isOpen: false, ingredientId: null, ingredientName: '' })
    setSubFormData(initialSubFormData)
  }, [])

  const handleSubIngredientSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (!subIngredientModal.ingredientId) return

      if (!subFormData.name.trim()) {
        toast.error(t('pages.ingredients.nameRequired'))
        return
      }

      try {
        await createSubIngredientAsync(subIngredientModal.ingredientId, subFormData)
        toast.success(t('pages.ingredients.subIngredientCreated'))
        closeSubIngredientModal()
        // Expand the row to show the new sub-ingredient
        setExpandedRows((prev) => new Set(prev).add(subIngredientModal.ingredientId!))
      } catch (error) {
        const message = handleError(error, 'IngredientsPage.handleSubIngredientSubmit')
        toast.error(`Error: ${message}`)
      }
    },
    [subIngredientModal.ingredientId, subFormData, createSubIngredientAsync, closeSubIngredientModal]
  )

  const handleDeleteSubIngredient = useCallback(
    async (ingredientId: string, subIngredientId: number) => {
      try {
        await deleteSubIngredientAsync(ingredientId, subIngredientId)
        toast.success(t('pages.ingredients.subIngredientDeleted'))
      } catch (error) {
        const message = handleError(error, 'IngredientsPage.handleDeleteSubIngredient')
        toast.error(`Error: ${message}`)
      }
    },
    [deleteSubIngredientAsync]
  )

  // Group options for select
  const groupOptions = useMemo(
    () => [
      { value: '', label: t('pages.ingredients.allGroups') },
      ...groups.map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  )

  const columns: TableColumn<Ingredient>[] = useMemo(
    () => [
      {
        key: 'expand',
        label: '',
        width: 'w-10',
        render: (item) =>
          item.is_processed && item.sub_ingredients.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleRow(item.id)
              }}
              className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
              aria-label={expandedRows.has(item.id) ? t('pages.ingredients.collapse') : t('pages.ingredients.expand')}
            >
              {expandedRows.has(item.id) ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          ),
      },
      {
        key: 'name',
        label: t('pages.ingredients.nameCol'),
        render: (item) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.name}</span>
            {item.is_processed && (
              <Badge variant="info" className="text-xs">
                Procesado
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'group_name',
        label: t('pages.ingredients.groupCol'),
        render: (item) => (
          <span className="text-[var(--text-tertiary)]">{item.group_name || '-'}</span>
        ),
      },
      {
        key: 'sub_count',
        label: t('pages.ingredients.subIngredientsCol'),
        width: 'w-32',
        render: (item) =>
          item.is_processed ? (
            <span className="text-[var(--text-muted)]">{item.sub_ingredients.length}</span>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          ),
      },
      {
        key: 'is_active',
        label: t('pages.ingredients.statusCol'),
        width: 'w-24',
        render: (item) =>
          item.is_active ? (
            <Badge variant="success">{t('pages.ingredients.active')}</Badge>
          ) : (
            <Badge variant="danger">{t('pages.ingredients.inactive')}</Badge>
          ),
      },
      {
        key: 'actions',
        label: t('pages.ingredients.actionsCol'),
        width: 'w-36',
        render: (item) => (
          <div className="flex items-center gap-1">
            {item.is_processed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openSubIngredientModal(item)
                }}
                aria-label={`Agregar sub-ingrediente a ${item.name}`}
                title="Agregar sub-ingrediente"
              >
                <Package className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                openEditModal(item)
              }}
              aria-label={`Editar ${item.name}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            {canDeleteIngredient && (
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
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [expandedRows, toggleRow, openEditModal, openSubIngredientModal, deleteDialog, canDeleteIngredient]
  )

  // Custom row render to handle expansion
  const renderRow = useCallback(
    (item: Ingredient, index: number) => {
      const isExpanded = expandedRows.has(item.id)
      const hasSubIngredients = item.is_processed && item.sub_ingredients.length > 0

      return (
        <React.Fragment key={item.id}>
          <tr
            className={`border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]/50 ${
              index % 2 === 0 ? 'bg-[var(--bg-secondary)]/30' : ''
            }`}
          >
            {columns.map((col) => (
              <td
                key={`${item.id}-${col.key}`}
                className={`px-4 py-3 ${col.width || ''}`}
              >
                {col.render ? col.render(item) : String(item[col.key as keyof Ingredient] ?? '')}
              </td>
            ))}
          </tr>
          {isExpanded && hasSubIngredients && (
            <tr className="bg-[var(--bg-tertiary)]/30">
              <td colSpan={columns.length} className="px-4 py-2 pl-12">
                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-muted)] mb-2">{t('pages.ingredients.subIngredientsOf', { name: item.name })}:</p>
                  {item.sub_ingredients.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between py-1 px-3 bg-[var(--bg-secondary)]/50 rounded"
                    >
                      <div>
                        <span className="text-sm">{sub.name}</span>
                        {sub.description && (
                          <span className="text-xs text-[var(--text-muted)] ml-2">
                            ({sub.description})
                          </span>
                        )}
                      </div>
                      {canDeleteIngredient && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSubIngredient(item.id, sub.id)}
                          className="text-[var(--danger-icon)] hover:text-[var(--danger-text)]"
                          aria-label={`Eliminar ${sub.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      )
    },
    [columns, expandedRows, handleDeleteSubIngredient, canDeleteIngredient]
  )

  return (
    <PageContainer
      title={t('pages.ingredients.title')}
      description={t('pages.ingredients.description')}
      actions={
        <Button onClick={() => modal.openCreate()} leftIcon={<Plus className="w-4 h-4" />}>
          Nuevo Ingrediente
        </Button>
      }
    >
      {/* Filter by group */}
      <div className="mb-4 flex items-center gap-4">
        <div className="w-64">
          <Select
            label={t('pages.ingredients.filterByGroup')}
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            options={groupOptions}
          />
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {filteredIngredients.length} {t('pages.ingredients.ingredientCount')}
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" aria-label={t('pages.ingredients.listLabel')}>
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-left text-sm text-[var(--text-tertiary)]">
                    {columns.map((col) => (
                      <th key={col.key} className={`px-4 py-3 font-medium ${col.width || ''}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center text-[var(--text-muted)]">
                        No hay ingredientes. Crea uno para comenzar.
                      </td>
                    </tr>
                  ) : (
                    paginatedIngredients.map((item, index) => renderRow(item, index))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.selectedItem ? t('pages.ingredients.editIngredient') : t('pages.ingredients.newIngredient')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={modal.close}>
              Cancelar
            </Button>
            <Button type="submit" form="ingredient-form" isLoading={isLoading}>
              {modal.selectedItem ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="ingredient-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('pages.ingredients.nameCol')}
            name="name"
            value={modal.formData.name}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t('pages.ingredients.namePlaceholder')}
            required
          />

          <Input
            label={t('pages.ingredients.descriptionLabel')}
            name="description"
            value={modal.formData.description || ''}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder={t('pages.ingredients.descriptionPlaceholder')}
          />

          <Select
            label={t('pages.ingredients.groupLabel')}
            value={modal.formData.group_id ? String(modal.formData.group_id) : ''}
            onChange={(e) =>
              modal.setFormData((prev) => ({
                ...prev,
                group_id: e.target.value ? parseInt(e.target.value, 10) : undefined,
              }))
            }
            options={[
              { value: '', label: t('pages.ingredients.noGroup') },
              ...groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />

          <Toggle
            label={t('pages.ingredients.isProcessed')}
            name="is_processed"
            checked={modal.formData.is_processed}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, is_processed: e.target.checked }))
            }
          />

          <p className="text-xs text-[var(--text-muted)]">
            Marca como "procesado" si este ingrediente tiene componentes (ej: Salsa BBQ contiene tomate, azucar, vinagre).
          </p>
        </form>
      </Modal>

      {/* Sub-ingredient Modal */}
      <Modal
        isOpen={subIngredientModal.isOpen}
        onClose={closeSubIngredientModal}
        title={t('pages.ingredients.addSubIngredientTo', { name: subIngredientModal.ingredientName })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeSubIngredientModal}>
              Cancelar
            </Button>
            <Button type="submit" form="sub-ingredient-form" isLoading={isLoading}>
              Agregar
            </Button>
          </>
        }
      >
        <form id="sub-ingredient-form" onSubmit={handleSubIngredientSubmit} className="space-y-4">
          <Input
            label={t('pages.ingredients.nameCol')}
            name="sub_name"
            value={subFormData.name}
            onChange={(e) =>
              setSubFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t('pages.ingredients.subNamePlaceholder')}
            required
          />

          <Input
            label={t('pages.ingredients.descriptionLabel')}
            name="sub_description"
            value={subFormData.description || ''}
            onChange={(e) =>
              setSubFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder={t('pages.ingredients.subDescriptionPlaceholder')}
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title={t('pages.ingredients.deleteConfirmTitle')}
        message={t('pages.ingredients.deleteConfirmMessage', { name: deleteDialog.item?.name })}
        confirmLabel={t('common.delete')}
      >
        {deleteDialog.item?.sub_ingredients && deleteDialog.item.sub_ingredients.length > 0 && (
          <p className="mt-3 text-sm text-[var(--warning-icon)]">
            {t('pages.ingredients.deleteSubWarning', { count: deleteDialog.item.sub_ingredients.length })}
          </p>
        )}
      </ConfirmDialog>
    </PageContainer>
  )
}

export default IngredientsPage
