import { useMemo, useCallback, useState, useEffect } from 'react'
import { Package, AlertTriangle, Trash2, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePagination } from '../hooks/usePagination'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { useBranchStore, selectSelectedBranchId } from '../stores/branchStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'
import type { TableColumn } from '../types'

// Types for inventory data from backend
interface StockItem {
  id: number
  tenant_id: number
  branch_id: number
  ingredient_id: number
  current_qty: number
  unit: string
  min_level: number
  max_level: number | null
  cost_per_unit_cents: number
  location: string | null
  last_restock_at: string | null
  is_active: boolean
  // Enriched fields from join (if available)
  ingredient_name?: string
}

interface StockAlert {
  id: number
  branch_id: number
  stock_item_id: number
  alert_type: string
  current_qty: number
  threshold_qty: number
  status: string
  created_at: string | null
}

interface FoodCostItem {
  product_id: number | null
  product_name: string | null
  recipe_id: number
  recipe_name: string
  total_cost_cents: number
  selling_price_cents: number | null
  food_cost_percent: number
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

function getStockStatus(item: StockItem): { label: string; variant: 'success' | 'warning' | 'danger' } {
  if (item.current_qty <= 0) return { label: t('pages.inventory.outOfStock'), variant: 'danger' }
  if (item.current_qty < item.min_level) return { label: t('pages.inventory.lowStock'), variant: 'warning' }
  if (item.current_qty < item.min_level * 1.5) return { label: t('pages.inventory.attention'), variant: 'warning' }
  return { label: t('pages.inventory.ok'), variant: 'success' }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export function InventoryPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.inventory.title'))

  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [foodCost, setFoodCost] = useState<FoodCostItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'stock' | 'alerts' | 'cost'>('stock')

  const fetchStock = useCallback(async () => {
    if (!selectedBranchId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/inventory/stock?branch_id=${selectedBranchId}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      })
      if (res.ok) {
        const data = await res.json()
        setStockItems(data)
      }
    } catch (error) {
      handleError(error, 'InventoryPage.fetchStock')
    } finally {
      setLoading(false)
    }
  }, [selectedBranchId])

  const fetchAlerts = useCallback(async () => {
    if (!selectedBranchId) return
    try {
      const res = await fetch(`${API_URL}/admin/inventory/alerts?branch_id=${selectedBranchId}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAlerts(data)
      }
    } catch (error) {
      handleError(error, 'InventoryPage.fetchAlerts')
    }
  }, [selectedBranchId])

  const fetchFoodCost = useCallback(async () => {
    if (!selectedBranchId) return
    try {
      const res = await fetch(`${API_URL}/admin/inventory/food-cost?branch_id=${selectedBranchId}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      })
      if (res.ok) {
        const data = await res.json()
        setFoodCost(data)
      }
    } catch (error) {
      handleError(error, 'InventoryPage.fetchFoodCost')
    }
  }, [selectedBranchId])

  useEffect(() => {
    fetchStock()
    fetchAlerts()
    fetchFoodCost()
  }, [fetchStock, fetchAlerts, fetchFoodCost])

  const handleRecalculate = useCallback(async () => {
    if (!selectedBranchId) return
    try {
      const res = await fetch(`${API_URL}/admin/inventory/food-cost/calculate?branch_id=${selectedBranchId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      })
      if (res.ok) {
        toast.success(t('pages.inventory.recalculateCosts'))
        fetchFoodCost()
      }
    } catch (error) {
      const message = handleError(error, 'InventoryPage.handleRecalculate')
      toast.error(`Error: ${message}`)
    }
  }, [selectedBranchId, fetchFoodCost])

  const sortedStock = useMemo(
    () =>
      [...stockItems].sort((a, b) => {
        // Show critical items first (out of stock, then low stock)
        const statusA = a.current_qty <= 0 ? 0 : a.current_qty < a.min_level ? 1 : 2
        const statusB = b.current_qty <= 0 ? 0 : b.current_qty < b.min_level ? 1 : 2
        return statusA - statusB
      }),
    [stockItems]
  )

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedStock)

  const stockColumns: TableColumn<StockItem>[] = useMemo(
    () => [
      {
        key: 'ingredient_id',
        label: t('pages.inventory.ingredient'),
        render: (item: StockItem) => (
          <span className="font-medium text-[var(--text-primary)]">
            {item.ingredient_name || `#${item.ingredient_id}`}
          </span>
        ),
      },
      {
        key: 'current_qty',
        label: t('pages.inventory.currentQty'),
        render: (item: StockItem) => (
          <span className="text-[var(--text-primary)]">
            {item.current_qty.toFixed(2)} {item.unit}
          </span>
        ),
      },
      {
        key: 'min_level',
        label: t('pages.inventory.minLevel'),
        render: (item: StockItem) => (
          <span className="text-[var(--text-secondary)]">
            {item.min_level.toFixed(2)} {item.unit}
          </span>
        ),
      },
      {
        key: 'cost_per_unit_cents',
        label: t('pages.inventory.costPerUnit'),
        render: (item: StockItem) => (
          <span className="text-[var(--text-secondary)]">
            {formatPrice(item.cost_per_unit_cents)}
          </span>
        ),
      },
      {
        key: 'location',
        label: t('pages.inventory.location'),
        render: (item: StockItem) => (
          <span className="text-[var(--text-secondary)]">{item.location || '-'}</span>
        ),
      },
      {
        key: 'is_active',
        label: t('common.status'),
        render: (item: StockItem) => {
          const status = getStockStatus(item)
          return <Badge variant={status.variant}>{status.label}</Badge>
        },
      },
    ],
    []
  )

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.inventory.title')} description={t('pages.inventory.selectBranchDesc')}>
        <Card>
          <div className="text-center py-12 text-[var(--text-muted)]">
            <Package className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
            <p className="text-lg">{t('pages.inventory.selectBranchFromDashboard')}</p>
          </div>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="Inventario"
      description="Control de stock, alertas y costos de ingredientes"
      actions={
        <Button onClick={fetchStock} variant="secondary" aria-label="Actualizar inventario">
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          Actualizar
        </Button>
      }
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-6" role="tablist">
        {(['stock', 'alerts', 'cost'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-orange-500 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {tab === 'stock' && t('pages.inventory.stockTab')}
            {tab === 'alerts' && `${t('pages.inventory.alertsTab')} (${alerts.length})`}
            {tab === 'cost' && t('pages.inventory.costTab')}
          </button>
        ))}
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12" role="status">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="sr-only">{t('pages.inventory.loadingInventory')}</span>
            </div>
          ) : sortedStock.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <Package className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
              <p>{t('pages.inventory.noStockItems')}</p>
            </div>
          ) : (
            <>
              <Table
                data={paginatedItems}
                columns={stockColumns}
                ariaLabel={t('pages.inventory.inventoryTable')}
              />
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
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <Card>
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <AlertTriangle className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
              <p>{t('pages.inventory.noActiveAlerts')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    alert.alert_type === 'OUT_OF_STOCK'
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-yellow-500/30 bg-yellow-500/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle
                      className={`w-5 h-5 ${
                        alert.alert_type === 'OUT_OF_STOCK' ? 'text-red-500' : 'text-yellow-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {alert.alert_type === 'OUT_OF_STOCK' ? t('pages.inventory.outOfStockAlert') : t('pages.inventory.lowStockAlert')}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Stock Item #{alert.stock_item_id} — Actual: {alert.current_qty} / Mínimo: {alert.threshold_qty}
                      </p>
                    </div>
                  </div>
                  <Badge variant={alert.alert_type === 'OUT_OF_STOCK' ? 'danger' : 'warning'}>
                    {alert.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Food Cost Tab */}
      {activeTab === 'cost' && (
        <Card>
          <div className="flex justify-end mb-4">
            <Button onClick={handleRecalculate} variant="secondary" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Recalcular Costos
            </Button>
          </div>
          {foodCost.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p>{t('pages.inventory.noCostData')}</p>
              <p className="text-sm mt-2">{t('pages.inventory.recipesNeeded')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.inventory.foodCostReport')}>
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-3 px-4 text-[var(--text-secondary)] font-medium">{t('pages.inventory.productCol')}</th>
                    <th className="text-left py-3 px-4 text-[var(--text-secondary)] font-medium">{t('pages.inventory.recipeCol')}</th>
                    <th className="text-right py-3 px-4 text-[var(--text-secondary)] font-medium">{t('pages.inventory.costCol')}</th>
                    <th className="text-right py-3 px-4 text-[var(--text-secondary)] font-medium">{t('pages.inventory.sellingPriceCol')}</th>
                    <th className="text-right py-3 px-4 text-[var(--text-secondary)] font-medium">{t('pages.inventory.foodCostPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {foodCost.map((item) => (
                    <tr
                      key={item.recipe_id}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <td className="py-3 px-4 text-[var(--text-primary)]">{item.product_name || '-'}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{item.recipe_name}</td>
                      <td className="py-3 px-4 text-right text-[var(--text-primary)]">
                        {formatPrice(item.total_cost_cents)}
                      </td>
                      <td className="py-3 px-4 text-right text-[var(--text-secondary)]">
                        {item.selling_price_cents ? formatPrice(item.selling_price_cents) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Badge
                          variant={
                            item.food_cost_percent > 35
                              ? 'danger'
                              : item.food_cost_percent > 28
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {item.food_cost_percent.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </PageContainer>
  )
}

export default InventoryPage
