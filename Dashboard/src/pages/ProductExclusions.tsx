/**
 * ProductExclusions page - Manage which categories/subcategories are excluded from branches.
 * Allows ADMIN to mark categories and subcategories as "not sold" at specific branches.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Store, Filter, Check, X, AlertTriangle } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import {
  Card,
  Button,
  Table,
  Badge,
  Pagination,
  Toggle,
} from '../components/ui'
import { usePagination } from '../hooks/usePagination'
import {
  useBranchStore,
  selectBranches,
} from '../stores/branchStore'
import {
  useExclusionStore,
  selectCategoryExclusions,
  selectSubcategoryExclusions,
  selectIsLoading,
  selectIsUpdating,
} from '../stores/exclusionStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { isAdmin } from '../utils/permissions'
import type { TableColumn } from '../types'

type ViewMode = 'categories' | 'subcategories'

interface CategoryRow {
  id: string  // String for Table component compatibility
  numericId: number  // Original numeric ID for API calls
  name: string
  type: 'category'
  excludedBranchIds: number[]
}

interface SubcategoryRow {
  id: string  // String for Table component compatibility
  numericId: number  // Original numeric ID for API calls
  name: string
  type: 'subcategory'
  categoryId: number
  categoryName: string
  excludedBranchIds: number[]
}

type ExclusionRow = CategoryRow | SubcategoryRow

export function ProductExclusionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.productExclusions.title'))

  const branches = useBranchStore(selectBranches)
  const categoryExclusions = useExclusionStore(selectCategoryExclusions)
  const subcategoryExclusions = useExclusionStore(selectSubcategoryExclusions)
  const isLoading = useExclusionStore(selectIsLoading)
  const isUpdating = useExclusionStore(selectIsUpdating)
  const fetchExclusions = useExclusionStore((s) => s.fetchExclusions)
  const updateCategoryExclusions = useExclusionStore((s) => s.updateCategoryExclusions)
  const updateSubcategoryExclusions = useExclusionStore((s) => s.updateSubcategoryExclusions)

  const userRoles = useAuthStore(selectUserRoles)
  const canManage = isAdmin(userRoles)

  const [viewMode, setViewMode] = useState<ViewMode>('categories')
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([])
  const [filterCategory, setFilterCategory] = useState<string>('')

  // Fetch exclusions on mount
  useEffect(() => {
    fetchExclusions()
  }, [fetchExclusions])

  // Active branches only
  const activeBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false),
    [branches]
  )

  // Transform exclusions into table rows
  const categoryRows = useMemo<CategoryRow[]>(() => {
    return categoryExclusions.map((exc) => ({
      id: `cat-${exc.category_id}`,
      numericId: exc.category_id,
      name: exc.category_name,
      type: 'category' as const,
      excludedBranchIds: exc.excluded_branch_ids,
    }))
  }, [categoryExclusions])

  const subcategoryRows = useMemo<SubcategoryRow[]>(() => {
    let rows = subcategoryExclusions.map((exc) => ({
      id: `subcat-${exc.subcategory_id}`,
      numericId: exc.subcategory_id,
      name: exc.subcategory_name,
      type: 'subcategory' as const,
      categoryId: exc.category_id,
      categoryName: exc.category_name,
      excludedBranchIds: exc.excluded_branch_ids,
    }))

    // Filter by category if selected
    if (filterCategory) {
      rows = rows.filter((r) => String(r.categoryId) === filterCategory)
    }

    return rows
  }, [subcategoryExclusions, filterCategory])

  // Choose which data to show based on view mode
  const displayRows = useMemo<ExclusionRow[]>(() => {
    return viewMode === 'categories' ? categoryRows : subcategoryRows
  }, [viewMode, categoryRows, subcategoryRows])

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(displayRows)

  // Category filter options for subcategory view
  const categoryFilterOptions = useMemo(() => {
    const uniqueCategories = new Map<number, string>()
    subcategoryExclusions.forEach((exc) => {
      uniqueCategories.set(exc.category_id, exc.category_name)
    })
    return Array.from(uniqueCategories.entries()).map(([id, name]) => ({
      value: String(id),
      label: name,
    }))
  }, [subcategoryExclusions])

  // Toggle branch selection for filtering
  const toggleBranchSelection = useCallback((branchId: number) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    )
  }, [])

  // Select all branches
  const selectAllBranches = useCallback(() => {
    setSelectedBranchIds(activeBranches.map((b) => parseInt(b.id, 10)))
  }, [activeBranches])

  // Clear branch selection
  const clearBranchSelection = useCallback(() => {
    setSelectedBranchIds([])
  }, [])

  // Check if an item is excluded from ALL selected branches
  const isExcludedFromSelectedBranches = useCallback(
    (row: ExclusionRow): boolean => {
      if (selectedBranchIds.length === 0) return false
      return selectedBranchIds.every((branchId) =>
        row.excludedBranchIds.includes(branchId)
      )
    },
    [selectedBranchIds]
  )

  // Toggle exclusion for an item
  const toggleExclusion = useCallback(
    async (row: ExclusionRow) => {
      if (!canManage || selectedBranchIds.length === 0) return

      const isCurrentlyExcluded = isExcludedFromSelectedBranches(row)

      let newExcludedBranchIds: number[]
      if (isCurrentlyExcluded) {
        // Remove selected branches from exclusion
        newExcludedBranchIds = row.excludedBranchIds.filter(
          (id) => !selectedBranchIds.includes(id)
        )
      } else {
        // Add selected branches to exclusion
        const toAdd = selectedBranchIds.filter(
          (id) => !row.excludedBranchIds.includes(id)
        )
        newExcludedBranchIds = [...row.excludedBranchIds, ...toAdd]
      }

      try {
        if (row.type === 'category') {
          await updateCategoryExclusions(row.numericId, newExcludedBranchIds)
        } else {
          await updateSubcategoryExclusions(row.numericId, newExcludedBranchIds)
        }
        toast.success(
          isCurrentlyExcluded
            ? t('pages.productExclusions.nowSoldAt', { name: row.name })
            : t('pages.productExclusions.nowExcluded', { name: row.name })
        )
      } catch {
        toast.error(t('pages.productExclusions.updateError'))
      }
    },
    [
      canManage,
      selectedBranchIds,
      isExcludedFromSelectedBranches,
      updateCategoryExclusions,
      updateSubcategoryExclusions,
    ]
  )

  // Get status badge for a row
  const getStatusBadge = useCallback(
    (row: ExclusionRow) => {
      const excludedCount = row.excludedBranchIds.length
      const totalBranches = activeBranches.length

      if (excludedCount === 0) {
        return <Badge variant="success">{t('pages.productExclusions.allBranches')}</Badge>
      }
      if (excludedCount === totalBranches) {
        return <Badge variant="danger">{t('pages.productExclusions.noBranches')}</Badge>
      }
      return (
        <Badge variant="warning">
          {totalBranches - excludedCount}/{totalBranches} sucursales
        </Badge>
      )
    },
    [activeBranches.length]
  )

  // Table columns
  const columns: TableColumn<ExclusionRow>[] = useMemo(
    () => [
      {
        key: 'name',
        label: viewMode === 'categories' ? t('pages.productExclusions.categoryCol') : t('pages.productExclusions.subcategoryCol'),
        render: (item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.type === 'subcategory' && (
              <div className="text-xs text-[var(--text-muted)]">
                {(item as SubcategoryRow).categoryName}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'status',
        label: t('pages.productExclusions.availabilityCol'),
        width: 'w-40',
        render: (item) => getStatusBadge(item),
      },
      {
        key: 'exclusion',
        label:
          selectedBranchIds.length > 0
            ? t('pages.productExclusions.excludeCol', { count: selectedBranchIds.length })
            : t('pages.productExclusions.selectBranches'),
        width: 'w-52',
        render: (item) => {
          if (selectedBranchIds.length === 0) {
            return (
              <span className="text-[var(--text-muted)] text-sm">
                Selecciona sucursales arriba
              </span>
            )
          }

          const isExcluded = isExcludedFromSelectedBranches(item)

          return (
            <Toggle
              label=""
              checked={isExcluded}
              onChange={() => toggleExclusion(item)}
              disabled={!canManage || isUpdating}
            />
          )
        },
      },
      {
        key: 'details',
        label: t('pages.productExclusions.excludedBranchesCol'),
        render: (item) => {
          if (item.excludedBranchIds.length === 0) {
            return <span className="text-[var(--text-muted)] text-sm">-</span>
          }

          const excludedNames = item.excludedBranchIds
            .map((branchId) => {
              const branch = activeBranches.find(
                (b) => parseInt(b.id, 10) === branchId
              )
              return branch?.name
            })
            .filter(Boolean)

          if (excludedNames.length <= 2) {
            return (
              <span className="text-sm text-[var(--danger-text)]">
                {excludedNames.join(', ')}
              </span>
            )
          }

          return (
            <span className="text-sm text-[var(--danger-text)]">
              {excludedNames.slice(0, 2).join(', ')} +{excludedNames.length - 2} mas
            </span>
          )
        },
      },
    ],
    [
      viewMode,
      selectedBranchIds,
      activeBranches,
      isExcludedFromSelectedBranches,
      toggleExclusion,
      canManage,
      isUpdating,
      getStatusBadge,
    ]
  )

  // Render loading state
  if (isLoading) {
    return (
      <PageContainer
        title={t('pages.productExclusions.title')}
        description={t('pages.productExclusions.loadingDesc')}
      >
        <Card className="text-center py-12">
          <div className="animate-pulse text-[var(--text-muted)]">{t('common.loading')}</div>
        </Card>
      </PageContainer>
    )
  }

  // Render permission denied
  if (!canManage) {
    return (
      <PageContainer
        title={t('pages.productExclusions.title')}
        description={t('pages.productExclusions.adminOnly')}
      >
        <Card className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-[var(--warning-icon)] mx-auto mb-4" />
          <p className="text-[var(--text-tertiary)]">
            Solo los usuarios con rol ADMIN pueden gestionar exclusiones de productos.
          </p>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('pages.productExclusions.title')}
      description={t('pages.productExclusions.description')}
    >
      {/* Branch Selection */}
      <Card className="mb-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-[var(--primary-500)]" />
              <h3 className="font-medium text-zinc-200">
                Selecciona las sucursales a configurar
              </h3>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllBranches}>
                Seleccionar todas
              </Button>
              <Button variant="ghost" size="sm" onClick={clearBranchSelection}>
                Limpiar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeBranches.map((branch) => {
              const branchId = parseInt(branch.id, 10)
              const isSelected = selectedBranchIds.includes(branchId)
              return (
                <button
                  key={branch.id}
                  onClick={() => toggleBranchSelection(branchId)}
                  className={`
                    px-3 py-2 rounded-lg border transition-all flex items-center gap-2
                    ${
                      isSelected
                        ? 'bg-[var(--primary-500)]/20 border-[var(--primary-500)] text-[var(--primary-400)]'
                        : 'bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-emphasis)]'
                    }
                  `}
                >
                  {isSelected ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <X className="w-4 h-4 opacity-50" />
                  )}
                  {branch.name}
                </button>
              )
            })}
          </div>

          {selectedBranchIds.length > 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              {t('pages.productExclusions.branchesSelected', { count: selectedBranchIds.length })}
            </p>
          )}
        </div>
      </Card>

      {/* View Mode Toggle & Filters */}
      <Card className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Filter className="w-5 h-5 text-[var(--text-muted)]" />

          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => setViewMode('categories')}
              className={`px-4 py-2 text-sm transition-colors ${
                viewMode === 'categories'
                  ? 'bg-[var(--primary-500)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Categorias
            </button>
            <button
              onClick={() => setViewMode('subcategories')}
              className={`px-4 py-2 text-sm transition-colors ${
                viewMode === 'subcategories'
                  ? 'bg-[var(--primary-500)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Subcategorias
            </button>
          </div>

          {viewMode === 'subcategories' && categoryFilterOptions.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-secondary)]"
            >
              <option value="">{t('pages.productExclusions.allCategories')}</option>
              {categoryFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto text-sm text-[var(--text-muted)]">
            {displayRows.length}{' '}
            {viewMode === 'categories' ? t('pages.productExclusions.categoriesView').toLowerCase() : t('pages.productExclusions.subcategoriesView').toLowerCase()}
          </div>
        </div>
      </Card>

      {/* Exclusions Table */}
      <Card padding="none">
        <Table
          data={paginatedItems}
          columns={columns}
          emptyMessage={
            viewMode === 'categories'
              ? t('pages.productExclusions.noCategoriesMessage')
              : t('pages.productExclusions.noSubcategoriesMessage')
          }
          ariaLabel={t('pages.productExclusions.listLabel', { type: viewMode === 'categories' ? t('pages.productExclusions.categoriesView') : t('pages.productExclusions.subcategoriesView') })}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* Help text */}
      <Card className="mt-6 bg-[var(--bg-tertiary)]/50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--warning-icon)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--text-tertiary)] space-y-2">
            <p>
              <strong>{t('pages.productExclusions.howItWorks')}</strong>
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t('pages.productExclusions.step1')}</li>
              <li>
                Activa el toggle en la columna "Excluir" para marcar una
                categoria/subcategoria como NO disponible en las sucursales
                seleccionadas.
              </li>
              <li>
                Las categorias excluidas no apareceran en el menu de esas
                sucursales.
              </li>
            </ol>
            <p className="text-[var(--primary-400)]">
              <strong>Nota:</strong> Excluir una categoria automaticamente excluye
              todas sus subcategorias y productos para esa sucursal.
            </p>
          </div>
        </div>
      </Card>
    </PageContainer>
  )
}

export default ProductExclusionsPage
