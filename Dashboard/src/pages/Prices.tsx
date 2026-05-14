import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Filter, Save, DollarSign, Percent } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import {
  Card,
  Button,
  Table,
  Modal,
  Input,
  Select,
  Badge,
  Pagination,
  HelpButton,
} from '../components/ui'
import { usePagination } from '../hooks/usePagination'
import { useCategoryStore, selectCategories } from '../stores/categoryStore'
import { useSubcategoryStore } from '../stores/subcategoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import {
  useBranchStore,
  selectBranches,
  selectSelectedBranchId,
  selectBranchById,
} from '../stores/branchStore'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'
import { HOME_CATEGORY_NAME, formatPrice } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
import type { Product, TableColumn, BranchPrice } from '../types'

interface PriceEdit {
  productId: string
  price: number
  branchPrices: BranchPrice[]
  useBranchPrices: boolean
}

export function PricesPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.prices.title'))

  const navigate = useNavigate()

  const categories = useCategoryStore(selectCategories)
  const getByCategory = useSubcategoryStore((s) => s.getByCategory)
  const products = useProductStore(selectProducts)
  const updateProduct = useProductStore((s) => s.updateProduct)
  const branches = useBranchStore(selectBranches)

  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const selectedBranch = useBranchStore(selectBranchById(selectedBranchId))

  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [priceEdits, setPriceEdits] = useState<PriceEdit | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Bulk update modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkType, setBulkType] = useState<'fixed' | 'percent'>('percent')
  const [bulkValue, setBulkValue] = useState<number>(0)

  const activeBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false),
    [branches]
  )

  // Filtrar categorias por sucursal seleccionada
  const branchCategories = useMemo(() => {
    if (!selectedBranchId) return []
    return categories.filter(
      (c) => c.branch_id === selectedBranchId && c.name !== HOME_CATEGORY_NAME
    )
  }, [categories, selectedBranchId])

  const branchCategoryIds = useMemo(
    () => new Set(branchCategories.map((c) => c.id)),
    [branchCategories]
  )

  const categoryOptions = useMemo(
    () => branchCategories.map((c) => ({ value: c.id, label: c.name })),
    [branchCategories]
  )

  const filterSubcategoryOptions = useMemo(() => {
    if (!filterCategory) return []
    return getByCategory(filterCategory).map((s) => ({
      value: s.id,
      label: s.name,
    }))
  }, [filterCategory, getByCategory])

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => branchCategoryIds.has(p.category_id))
    if (filterCategory) {
      result = result.filter((p) => p.category_id === filterCategory)
    }
    if (filterSubcategory) {
      result = result.filter((p) => p.subcategory_id === filterSubcategory)
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [products, branchCategoryIds, filterCategory, filterSubcategory])

  const {
    paginatedItems: paginatedProducts,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredProducts)

  const getCategoryName = useCallback(
    (categoryId: string): string => {
      return categories.find((c) => c.id === categoryId)?.name || 'Sin categoria'
    },
    [categories]
  )

  // Get price display for a product
  const getPriceDisplay = (product: Product): { text: string; detail?: string } => {
    const branchPrices = product.branch_prices ?? []
    if (!product.use_branch_prices || branchPrices.length === 0) {
      return { text: formatPrice(product.price) }
    }

    const activePrices = branchPrices
      .filter((bp) => bp.is_active)
      .map((bp) => bp.price)

    if (activePrices.length === 0) {
      return { text: '-', detail: 'Sin sucursales activas' }
    }

    const minPrice = Math.min(...activePrices)
    const maxPrice = Math.max(...activePrices)

    if (minPrice === maxPrice) {
      return { text: formatPrice(minPrice), detail: `${activePrices.length} sucursales` }
    }

    return {
      text: `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`,
      detail: `${activePrices.length} sucursales`,
    }
  }

  const openEditModal = useCallback((product: Product) => {
    setEditingProduct(product)
    setPriceEdits({
      productId: product.id,
      price: product.price,
      branchPrices: product.branch_prices || [],
      useBranchPrices: product.use_branch_prices || false,
    })
    setIsModalOpen(true)
  }, [])

  const handleSavePrice = useCallback(() => {
    if (!editingProduct || !priceEdits) return

    // Validate base price
    if (priceEdits.price <= 0) {
      toast.error(t('pages.prices.priceGreaterThanZero'))
      return
    }

    // Validate branch prices if enabled
    if (priceEdits.useBranchPrices) {
      const invalidBranchPrice = priceEdits.branchPrices.find(
        (bp) => bp.is_active && bp.price <= 0
      )
      if (invalidBranchPrice) {
        const branchName = activeBranches.find(b => b.id === invalidBranchPrice.branch_id)?.name || 'sucursal'
        toast.error(`El precio en ${branchName} debe ser mayor a 0`)
        return
      }
    }

    setIsSaving(true)
    try {
      // Only update price-related fields to preserve other product data
      updateProduct(editingProduct.id, {
        ...editingProduct,
        price: priceEdits.price,
        branch_prices: priceEdits.branchPrices,
        use_branch_prices: priceEdits.useBranchPrices,
      })
      toast.success(`Precio de "${editingProduct.name}" actualizado`)
      setIsModalOpen(false)
      setEditingProduct(null)
      setPriceEdits(null)
    } catch (error) {
      const message = handleError(error, 'PricesPage.handleSavePrice')
      toast.error(`Error al guardar: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }, [editingProduct, priceEdits, updateProduct, activeBranches])

  const handleBranchPriceChange = useCallback(
    (branchId: string, newPrice: number) => {
      if (!priceEdits) return

      const existingIndex = priceEdits.branchPrices.findIndex(
        (bp) => bp.branch_id === branchId
      )

      let newBranchPrices: BranchPrice[]
      if (existingIndex >= 0) {
        newBranchPrices = priceEdits.branchPrices.map((bp) =>
          bp.branch_id === branchId ? { ...bp, price: newPrice } : bp
        )
      } else {
        newBranchPrices = [
          ...priceEdits.branchPrices,
          { branch_id: branchId, price: newPrice, is_active: true },
        ]
      }

      setPriceEdits({ ...priceEdits, branchPrices: newBranchPrices })
    },
    [priceEdits]
  )

  const handleBranchActiveChange = useCallback(
    (branchId: string, isActive: boolean) => {
      if (!priceEdits) return

      const existingIndex = priceEdits.branchPrices.findIndex(
        (bp) => bp.branch_id === branchId
      )

      let newBranchPrices: BranchPrice[]
      if (existingIndex >= 0) {
        newBranchPrices = priceEdits.branchPrices.map((bp) =>
          bp.branch_id === branchId ? { ...bp, is_active: isActive } : bp
        )
      } else {
        newBranchPrices = [
          ...priceEdits.branchPrices,
          { branch_id: branchId, price: priceEdits.price, is_active: isActive },
        ]
      }

      setPriceEdits({ ...priceEdits, branchPrices: newBranchPrices })
    },
    [priceEdits]
  )

  const getBranchPrice = useCallback(
    (branchId: string): BranchPrice => {
      if (!priceEdits) {
        return { branch_id: branchId, price: 0, is_active: true }
      }
      return (
        priceEdits.branchPrices.find((bp) => bp.branch_id === branchId) || {
          branch_id: branchId,
          price: priceEdits.price,
          is_active: true,
        }
      )
    },
    [priceEdits]
  )

  const applyDefaultToAll = useCallback(() => {
    if (!priceEdits) return

    const newBranchPrices = activeBranches.map((b) => {
      const existing = priceEdits.branchPrices.find((bp) => bp.branch_id === b.id)
      return {
        branch_id: b.id,
        price: priceEdits.price,
        is_active: existing?.is_active ?? true,
      }
    })

    setPriceEdits({ ...priceEdits, branchPrices: newBranchPrices })
  }, [priceEdits, activeBranches])

  // Bulk update
  const handleBulkUpdate = useCallback(() => {
    // Validate bulkValue is a valid number
    if (isNaN(bulkValue)) {
      toast.error(t('pages.prices.enterValidValue'))
      return
    }
    // For fixed price, value must be positive; for percent, 0 is invalid
    if (bulkType === 'fixed' && bulkValue <= 0) {
      toast.error(t('pages.prices.priceGreaterThanZero'))
      return
    }
    if (bulkType === 'percent' && bulkValue === 0) {
      toast.error(t('pages.prices.enterNonZeroPercentage'))
      return
    }

    let updatedCount = 0
    filteredProducts.forEach((product) => {
      let newPrice: number

      if (bulkType === 'fixed') {
        newPrice = bulkValue
      } else {
        // Percent change
        newPrice = product.price * (1 + bulkValue / 100)
      }

      newPrice = Math.round(newPrice * 100) / 100 // Round to 2 decimals

      if (newPrice > 0) {
        updateProduct(product.id, { price: newPrice })
        updatedCount++
      }
    })

    toast.success(`${updatedCount} ${t('pages.prices.productsUpdated')}`)
    setIsBulkModalOpen(false)
    setBulkValue(0)
  }, [bulkType, bulkValue, filteredProducts, updateProduct])

  const columns: TableColumn<Product>[] = [
    {
      key: 'name',
      label: t('pages.products.title'),
      render: (item) => (
        <div>
          <span className="font-medium">{item.name}</span>
          <div className="text-xs text-[var(--text-muted)]">{getCategoryName(item.category_id)}</div>
        </div>
      ),
    },
    {
      key: 'price',
      label: (
        <div className="flex items-center gap-2">
          <HelpButton
            title="Editar Precio"
            size="sm"
            content={
              <div className="space-y-3">
                <p>
                  <strong>Haz clic en cualquier fila</strong> de la tabla o en el boton "Editar" para abrir el modal de edicion de precios.
                </p>
                <p className="font-semibold">En el modal puedes:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Precio Base:</strong> Modificar el precio principal del producto que se usa cuando no hay precios por sucursal.</li>
                  <li><strong>Precios por Sucursal:</strong> Activar el toggle "Precios diferentes por sucursal" para configurar precios individuales en cada sucursal.</li>
                  <li><strong>Activar/Desactivar:</strong> Con el checkbox de cada sucursal puedes indicar si el producto se vende o no en esa ubicacion.</li>
                  <li><strong>Aplicar precio base:</strong> Usa este boton para copiar el precio base a todas las sucursales activas rapidamente.</li>
                </ul>
                <p className="text-[var(--primary-400)]">
                  <strong>Tip:</strong> Si solo necesitas un precio unico para todas las sucursales, deja desactivado el toggle de precios por sucursal.
                </p>
              </div>
            }
          />
          <span>{t('pages.prices.basePrice')}</span>
        </div>
      ),
      width: 'w-40',
      render: (item) => (
        <span className="font-medium text-[var(--primary-500)]">{formatPrice(item.price)}</span>
      ),
    },
    {
      key: 'branch_prices',
      label: t('pages.products.branchPrices'),
      width: 'w-48',
      render: (item) => {
        const display = getPriceDisplay(item)
        if (!item.use_branch_prices) {
          return <span className="text-[var(--text-muted)]">{t('pages.prices.fixedPrice')}</span>
        }
        return (
          <div>
            <span className="font-medium text-[var(--primary-500)]">{display.text}</span>
            {display.detail && (
              <div className="text-xs text-[var(--text-muted)]">{display.detail}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'mode',
      label: t('common.type'),
      width: 'w-32',
      render: (item) =>
        item.use_branch_prices ? (
          <Badge variant="info">Por sucursal</Badge>
        ) : (
          <Badge variant="default">Unico</Badge>
        ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      width: 'w-28',
      render: (item) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            openEditModal(item)
          }}
          aria-label={`Editar precio de ${item.name}`}
        >
          <DollarSign className="w-4 h-4 mr-1" aria-hidden="true" />
          {t('common.edit')}
        </Button>
      ),
    },
  ]

  // Si no hay sucursal seleccionada, mostrar mensaje
  if (!selectedBranchId) {
    return (
      <PageContainer
        title={t('pages.prices.title')}
        description={t('pages.prices.description')}
        helpContent={helpContent.prices}
      >
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">
            {t('pages.prices.description')}
          </p>
          <Button onClick={() => navigate('/')}>{t('common.goToDashboard')}</Button>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={`${t('pages.prices.title')} - ${selectedBranch?.name || ''}`}
      description={`${t('pages.prices.description')} - ${selectedBranch?.name || ''}`}
      helpContent={helpContent.prices}
      actions={
        <Button
          onClick={() => setIsBulkModalOpen(true)}
          leftIcon={<Percent className="w-4 h-4" />}
          variant="secondary"
        >
          {t('pages.prices.bulkUpdate')}
        </Button>
      }
    >
      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Filter className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
          <Select
            options={[{ value: '', label: 'Todas las categorias' }, ...categoryOptions]}
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value)
              setFilterSubcategory('')
            }}
            className="w-48"
            aria-label="Filtrar por categoria"
          />
          {filterCategory && (
            <Select
              options={[
                { value: '', label: 'Todas las subcategorias' },
                ...filterSubcategoryOptions,
              ]}
              value={filterSubcategory}
              onChange={(e) => setFilterSubcategory(e.target.value)}
              className="w-48"
              aria-label="Filtrar por subcategoria"
            />
          )}
          {(filterCategory || filterSubcategory) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterCategory('')
                setFilterSubcategory('')
              }}
            >
              {t('pages.subcategories.clearFilter')}
            </Button>
          )}
          <div className="ml-auto text-sm text-[var(--text-muted)]">
            {filteredProducts.length} productos
          </div>
        </div>
      </Card>

      <Card padding="none">
        <Table
          data={paginatedProducts}
          columns={columns}
          onRowClick={openEditModal}
          emptyMessage={t('pages.products.noProducts')}
          ariaLabel="Lista de precios de productos"
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* Edit Price Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`${t('pages.prices.editPrice')} - ${editingProduct?.name || ''}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSavePrice}
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {priceEdits && (
          <div className="space-y-4">
            {/* Base price */}
            <Input
              label={t('pages.prices.basePrice')}
              type="number"
              value={priceEdits.price}
              onChange={(e) => {
                const value = e.target.value.trim()
                const parsed = value === '' ? 0 : Number(value)
                setPriceEdits({
                  ...priceEdits,
                  price: isNaN(parsed) ? 0 : Math.max(0, parsed),
                })
              }}
              min={0}
              step={0.01}
            />

            {/* Toggle for per-branch pricing */}
            <label className="inline-flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={priceEdits.useBranchPrices}
                  onChange={(e) => {
                    const newValue = e.target.checked
                    setPriceEdits({ ...priceEdits, useBranchPrices: newValue })
                    if (newValue && priceEdits.branchPrices.length === 0) {
                      // Initialize with all branches
                      const initialPrices = activeBranches.map((b) => ({
                        branch_id: b.id,
                        price: priceEdits.price,
                        is_active: true,
                      }))
                      setPriceEdits({
                        ...priceEdits,
                        useBranchPrices: true,
                        branchPrices: initialPrices,
                      })
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] peer-checked:bg-[var(--primary-500)] transition-colors duration-200 peer-focus:ring-2 peer-focus:ring-[var(--primary-500)] peer-focus:ring-offset-2 peer-focus:ring-offset-zinc-900" />
                <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5" />
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                {t('pages.products.useBranchPrices')}
              </span>
            </label>

            {/* Branch prices */}
            {priceEdits.useBranchPrices && (
              <div className="space-y-3 pl-2 border-l-2 border-[var(--border-default)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={applyDefaultToAll}
                  className="text-[var(--primary-500)] hover:text-[var(--primary-400)]"
                >
                  {t('pages.prices.applyToAll')}
                </Button>

                <div className="space-y-2">
                  {activeBranches.map((branch) => {
                    const bp = getBranchPrice(branch.id)
                    return (
                      <div
                        key={branch.id}
                        className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)]/50 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={bp.is_active}
                          onChange={(e) =>
                            handleBranchActiveChange(branch.id, e.target.checked)
                          }
                          className="w-4 h-4 rounded border-[var(--border-emphasis)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-[var(--primary-500)] focus:ring-offset-zinc-900"
                          aria-label={`Vender en ${branch.name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm ${bp.is_active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}
                          >
                            {branch.name}
                          </span>
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            value={bp.price}
                            onChange={(e) => {
                              const value = e.target.value.trim()
                              const parsed = value === '' ? 0 : Number(value)
                              handleBranchPriceChange(
                                branch.id,
                                isNaN(parsed) ? 0 : Math.max(0, parsed)
                              )
                            }}
                            disabled={!bp.is_active}
                            min={0}
                            step={0.01}
                            className={`
                              w-full px-3 py-1.5 text-sm rounded-lg
                              bg-[var(--bg-tertiary)] border border-[var(--border-default)] transition-colors
                              ${bp.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-50'}
                              focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]
                              disabled:cursor-not-allowed
                            `}
                            aria-label={`Precio en ${branch.name}`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk Update Modal */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title={t('pages.prices.bulkUpdate')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsBulkModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleBulkUpdate}>
              Aplicar a {filteredProducts.length} productos
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-tertiary)]">
            Esto actualizara el precio BASE de todos los productos filtrados actualmente
            ({filteredProducts.length} productos).
          </p>

          <Select
            label="Tipo de actualizacion"
            options={[
              { value: 'percent', label: 'Porcentaje (+/-)' },
              { value: 'fixed', label: 'Precio fijo' },
            ]}
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value as 'fixed' | 'percent')}
          />

          <Input
            label={bulkType === 'percent' ? 'Porcentaje (ej: 10 o -5)' : 'Precio fijo'}
            type="number"
            value={bulkValue}
            onChange={(e) => {
              const value = e.target.value.trim()
              const parsed = value === '' ? 0 : Number(value)
              setBulkValue(isNaN(parsed) ? 0 : parsed)
            }}
            step={bulkType === 'percent' ? 1 : 0.01}
            placeholder={bulkType === 'percent' ? 'Ej: 10 para +10%' : 'Ej: 1500'}
          />

          {bulkType === 'percent' && bulkValue !== 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              {bulkValue > 0 ? 'Aumentar' : 'Reducir'} precios en{' '}
              {Math.abs(bulkValue)}%
            </p>
          )}
        </div>
      </Modal>
    </PageContainer>
  )
}

export default PricesPage
