import { useState, useMemo, useCallback } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Button, Select } from '../components/ui'
import { Download, TrendingUp, ShoppingCart, DollarSign, Package } from 'lucide-react'
import { exportToCsv, type ColumnConfig } from '../utils/exportCsv'
import { useBranchStore, selectBranches, selectSelectedBranchId } from '../stores/branchStore'

// Types for reports data
interface SalesSummary {
  totalSales: number
  ordersCount: number
  avgOrderValue: number
}

interface DailySales {
  date: string
  label: string
  sales: number
  orders: number
}

interface TopProduct {
  id: string
  name: string
  quantity: number
  revenue: number
}

type DateRangeType = 'today' | 'week' | 'month' | 'custom'

interface DateRange {
  start: Date
  end: Date
}

// Helper to format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value)
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
  })
}

// Get date range based on selection
function getDateRange(rangeType: DateRangeType, customStart?: Date, customEnd?: Date): DateRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (rangeType) {
    case 'today':
      return { start: today, end: today }
    case 'week': {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - 6)
      return { start: weekStart, end: today }
    }
    case 'month': {
      const monthStart = new Date(today)
      monthStart.setDate(today.getDate() - 29)
      return { start: monthStart, end: today }
    }
    case 'custom':
      return {
        start: customStart || today,
        end: customEnd || today,
      }
    default:
      return { start: today, end: today }
  }
}

// Generate mock data for demonstration
function generateMockData(dateRange: DateRange, branchId: string | null): {
  summary: SalesSummary
  dailySales: DailySales[]
  topProducts: TopProduct[]
} {
  const days: DailySales[] = []
  const current = new Date(dateRange.start)

  // Seed based on branch for consistent mock data
  const seed = branchId ? parseInt(branchId.replace(/\D/g, ''), 10) || 1 : 1

  while (current <= dateRange.end) {
    const dayOfWeek = current.getDay()
    // Weekend has higher sales
    const baseMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.5 : 1
    const randomFactor = 0.8 + (Math.sin(current.getTime() / 1000000 + seed) + 1) * 0.4

    const dailyOrders = Math.floor(20 * baseMultiplier * randomFactor * (seed * 0.3 + 0.7))
    const dailySales = dailyOrders * (1500 + Math.floor(Math.random() * 500))

    days.push({
      date: current.toISOString().split('T')[0],
      label: formatDate(current),
      sales: dailySales,
      orders: dailyOrders,
    })

    current.setDate(current.getDate() + 1)
  }

  const totalSales = days.reduce((sum, d) => sum + d.sales, 0)
  const ordersCount = days.reduce((sum, d) => sum + d.orders, 0)

  const topProducts: TopProduct[] = [
    { id: '1', name: 'Hamburguesa Clasica', quantity: Math.floor(45 * seed * 0.5 + 30), revenue: Math.floor(120000 * seed * 0.3 + 80000) },
    { id: '2', name: 'Pizza Muzzarella', quantity: Math.floor(38 * seed * 0.5 + 25), revenue: Math.floor(95000 * seed * 0.3 + 65000) },
    { id: '3', name: 'Milanesa Napolitana', quantity: Math.floor(32 * seed * 0.5 + 20), revenue: Math.floor(88000 * seed * 0.3 + 55000) },
    { id: '4', name: 'Empanadas (docena)', quantity: Math.floor(28 * seed * 0.5 + 18), revenue: Math.floor(72000 * seed * 0.3 + 45000) },
    { id: '5', name: 'Gaseosa 500ml', quantity: Math.floor(85 * seed * 0.5 + 60), revenue: Math.floor(42500 * seed * 0.3 + 30000) },
  ]

  return {
    summary: {
      totalSales,
      ordersCount,
      avgOrderValue: ordersCount > 0 ? totalSales / ordersCount : 0,
    },
    dailySales: days,
    topProducts,
  }
}

// Simple bar chart component using divs
interface BarChartProps {
  data: DailySales[]
  maxBars?: number
}

function BarChart({ data, maxBars = 14 }: BarChartProps) {
  const displayData = data.slice(-maxBars)
  const maxValue = Math.max(...displayData.map((d) => d.sales), 1)

  return (
    <div className="flex items-end gap-1 h-48 px-2">
      {displayData.map((item) => {
        const height = (item.sales / maxValue) * 100
        return (
          <div
            key={item.date}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${item.label}: ${formatCurrency(item.sales)} (${item.orders} pedidos)`}
          >
            <div
              className="w-full bg-gradient-to-t from-orange-600 to-orange-400 rounded-t transition-all duration-300 hover:from-orange-500 hover:to-orange-300 cursor-pointer min-h-[4px]"
              style={{ height: `${Math.max(height, 2)}%` }}
              role="img"
              aria-label={`${item.label}: ${formatCurrency(item.sales)}`}
            />
            <span className="text-[10px] text-[var(--text-muted)] -rotate-45 origin-center whitespace-nowrap">
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Summary card component
interface SummaryCardProps {
  title: string
  value: string
  icon: React.ReactNode
  trend?: number
}

function SummaryCard({ title, value, icon, trend }: SummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[var(--primary-500)]/10 rounded-lg">{icon}</div>
        <div className="flex-1">
          <p className="text-[var(--text-tertiary)] text-sm">{title}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        </div>
        {trend !== undefined && (
          <div
            className={`flex items-center gap-1 text-sm ${trend >= 0 ? 'text-[var(--success-icon)]' : 'text-[var(--danger-icon)]'}`}
          >
            <TrendingUp
              className={`w-4 h-4 ${trend < 0 ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
    </Card>
  )
}

export function ReportsPage() {
  useDocumentTitle('Reportes')

  const branches = useBranchStore(selectBranches)
  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('week')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState<string>(selectedBranchId || '')

  // Calculate date range
  const dateRange = useMemo(() => {
    if (dateRangeType === 'custom' && customStartDate && customEndDate) {
      return getDateRange(
        'custom',
        new Date(customStartDate + 'T00:00:00'),
        new Date(customEndDate + 'T00:00:00')
      )
    }
    return getDateRange(dateRangeType)
  }, [dateRangeType, customStartDate, customEndDate])

  // Generate data based on filters
  const { summary, dailySales, topProducts } = useMemo(() => {
    return generateMockData(dateRange, branchFilter || null)
  }, [dateRange, branchFilter])

  // Export handlers
  const handleExportSalesSummary = useCallback(() => {
    const exportData = [
      {
        metric: 'Total Ventas',
        value: summary.totalSales,
        formatted: formatCurrency(summary.totalSales),
      },
      {
        metric: 'Cantidad de Pedidos',
        value: summary.ordersCount,
        formatted: String(summary.ordersCount),
      },
      {
        metric: 'Valor Promedio',
        value: summary.avgOrderValue,
        formatted: formatCurrency(summary.avgOrderValue),
      },
    ]

    const columns: ColumnConfig<typeof exportData[0]>[] = [
      { key: 'metric', header: 'Metrica' },
      { key: 'formatted', header: 'Valor' },
    ]

    exportToCsv(exportData, `resumen-ventas-${new Date().toISOString().split('T')[0]}`, columns)
  }, [summary])

  const handleExportDailySales = useCallback(() => {
    const columns: ColumnConfig<DailySales>[] = [
      { key: 'date', header: 'Fecha' },
      { key: 'sales', header: 'Ventas', format: (v) => formatCurrency(v as number) },
      { key: 'orders', header: 'Pedidos' },
    ]

    exportToCsv(dailySales, `ventas-diarias-${new Date().toISOString().split('T')[0]}`, columns)
  }, [dailySales])

  const handleExportTopProducts = useCallback(() => {
    const columns: ColumnConfig<TopProduct>[] = [
      { key: 'name', header: 'Producto' },
      { key: 'quantity', header: 'Cantidad Vendida' },
      { key: 'revenue', header: 'Ingresos', format: (v) => formatCurrency(v as number) },
    ]

    exportToCsv(topProducts, `top-productos-${new Date().toISOString().split('T')[0]}`, columns)
  }, [topProducts])

  // Date range options
  const dateRangeOptions = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Ultima semana' },
    { value: 'month', label: 'Ultimo mes' },
    { value: 'custom', label: 'Personalizado' },
  ]

  // Branch filter options
  const branchOptions = [
    { value: '', label: 'Todas las sucursales' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ]

  return (
    <PageContainer
      title="Reportes"
      description="Analiza las ventas y el rendimiento de tu restaurante"
      actions={
        <Button
          variant="secondary"
          onClick={handleExportSalesSummary}
          leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
        >
          Exportar Resumen
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-48">
          <Select
            id="date-range-filter"
            label="Periodo"
            options={dateRangeOptions}
            value={dateRangeType}
            onChange={(e) => setDateRangeType(e.target.value as DateRangeType)}
          />
        </div>

        {dateRangeType === 'custom' && (
          <>
            <div className="w-48">
              <label
                htmlFor="custom-start"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Desde
              </label>
              <input
                id="custom-start"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
            <div className="w-48">
              <label
                htmlFor="custom-end"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Hasta
              </label>
              <input
                id="custom-end"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
          </>
        )}

        <div className="w-64">
          <Select
            id="branch-filter"
            label="Sucursal"
            options={branchOptions}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total Ventas"
          value={formatCurrency(summary.totalSales)}
          icon={<DollarSign className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />}
          trend={12}
        />
        <SummaryCard
          title="Pedidos"
          value={String(summary.ordersCount)}
          icon={<ShoppingCart className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />}
          trend={8}
        />
        <SummaryCard
          title="Valor Promedio"
          value={formatCurrency(summary.avgOrderValue)}
          icon={<TrendingUp className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />}
          trend={-2}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Day/Week */}
        <Card>
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--border-default)]">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Ventas por Dia</h3>
              <p className="text-sm text-[var(--text-tertiary)]">
                {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportDailySales}
              leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              aria-label="Exportar ventas diarias a CSV"
            >
              CSV
            </Button>
          </div>

          {dailySales.length > 0 ? (
            <BarChart data={dailySales} />
          ) : (
            <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
              No hay datos para el periodo seleccionado
            </div>
          )}
        </Card>

        {/* Top Products */}
        <Card>
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--border-default)]">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Top 5 Productos</h3>
              <p className="text-sm text-[var(--text-tertiary)]">Por cantidad vendida</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportTopProducts}
              leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              aria-label="Exportar top productos a CSV"
            >
              CSV
            </Button>
          </div>

          <div className="space-y-3">
            {topProducts.map((product, index) => {
              const maxQuantity = topProducts[0]?.quantity || 1
              const barWidth = (product.quantity / maxQuantity) * 100

              return (
                <div key={product.id} className="flex items-center gap-3">
                  <span className="w-6 text-center text-[var(--text-muted)] font-medium">{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[var(--text-primary)] text-sm font-medium truncate">
                        {product.name}
                      </span>
                      <span className="text-[var(--text-tertiary)] text-sm ml-2">
                        {product.quantity} uds
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                        role="progressbar"
                        aria-valuenow={product.quantity}
                        aria-valuemin={0}
                        aria-valuemax={maxQuantity}
                        aria-label={`${product.name}: ${product.quantity} unidades`}
                      />
                    </div>
                    <div className="flex justify-end mt-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {topProducts.length === 0 && (
            <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
              <Package className="w-8 h-8 mr-2" aria-hidden="true" />
              No hay datos de productos
            </div>
          )}
        </Card>
      </div>

      {/* Status announcement for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        Mostrando reportes del {formatDate(dateRange.start)} al {formatDate(dateRange.end)}.
        Total ventas: {formatCurrency(summary.totalSales)}, {summary.ordersCount} pedidos.
      </div>
    </PageContainer>
  )
}

export default ReportsPage
