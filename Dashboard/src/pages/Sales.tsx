import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  Clock,
  Download,
  RefreshCw,
  Printer,
} from 'lucide-react'
import { Card, Button, Select } from '../components/ui'
import { helpContent } from '../utils/helpContent'
import { printDailyReport } from '../utils/print'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import {
  reportsAPI,
  type ReportsSummary,
  type DailySales,
  type TopProduct,
  type HourlyOrders,
  type WaiterPerformance,
} from '../services/api'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'

type DateRange = '7' | '14' | '30' | '90'
type ActiveTab = 'sales' | 'waiters'

export function SalesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.sales.title'))

  const branches = useBranchStore(selectBranches)

  const [activeTab, setActiveTab] = useState<ActiveTab>('sales')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('30')
  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [hourlyOrders, setHourlyOrders] = useState<HourlyOrders[]>([])
  const [waiterPerformance, setWaiterPerformance] = useState<WaiterPerformance[]>([])
  const [isLoadingWaiters, setIsLoadingWaiters] = useState(false)
  const [sortField, setSortField] = useState<keyof WaiterPerformance>('total_revenue_cents')
  const [sortAsc, setSortAsc] = useState(false)

  const branchOptions = useMemo(
    () => [
      { value: '', label: t('pages.sales.allBranches') },
      ...branches.map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [branches]
  )

  const dateRangeOptions = [
    { value: '7', label: t('pages.sales.last7days') },
    { value: '14', label: t('pages.sales.last14days') },
    { value: '30', label: t('pages.sales.last30days') },
    { value: '90', label: t('pages.sales.last90days') },
  ]

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const branchId = selectedBranchId ? parseInt(selectedBranchId, 10) : undefined
      const days = parseInt(dateRange, 10)

      const [summaryData, dailyData, topData, hourlyData] = await Promise.all([
        reportsAPI.getSummary(branchId, days),
        reportsAPI.getDailySales(branchId, days),
        reportsAPI.getTopProducts(branchId, days, 10),
        reportsAPI.getOrdersByHour(branchId, days),
      ])

      setSummary(summaryData)
      setDailySales(dailyData)
      setTopProducts(topData)
      setHourlyOrders(hourlyData)
    } catch (error) {
      handleError(error, 'SalesPage.fetchReports')
      toast.error(t('pages.sales.errorLoadingReports'))
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranchId, dateRange])

  const fetchWaiterPerformance = useCallback(async () => {
    setIsLoadingWaiters(true)
    try {
      const branchId = selectedBranchId ? parseInt(selectedBranchId, 10) : undefined
      const days = parseInt(dateRange, 10)
      const data = await reportsAPI.getWaiterPerformance(branchId, days)
      setWaiterPerformance(data)
    } catch (error) {
      handleError(error, 'SalesPage.fetchWaiterPerformance')
      toast.error(t('pages.sales.errorLoadingPerformance'))
    } finally {
      setIsLoadingWaiters(false)
    }
  }, [selectedBranchId, dateRange])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  useEffect(() => {
    if (activeTab === 'waiters') {
      fetchWaiterPerformance()
    }
  }, [activeTab, fetchWaiterPerformance])

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
  }

  const formatHour = (hour: number | null) => {
    if (hour === null) return '-'
    return `${hour}:00 - ${hour + 1}:00`
  }

  // Simple bar chart component
  const maxDailySale = Math.max(...dailySales.map((d) => d.total_sales_cents), 1)

  // Hourly chart data - fill in missing hours with 0
  const fullHourlyData = useMemo(() => {
    const hourMap = new Map(hourlyOrders.map((h) => [h.hour, h.order_count]))
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      order_count: hourMap.get(i) || 0,
    }))
  }, [hourlyOrders])

  const maxHourlyOrders = Math.max(...fullHourlyData.map((h) => h.order_count), 1)

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const headers = ['Fecha', 'Ventas', 'Pedidos', 'Ticket Promedio']
    const rows = dailySales.map((d) => [
      d.date,
      (d.total_sales_cents / 100).toFixed(2),
      d.order_count,
      (d.avg_order_cents / 100).toFixed(2),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ventas_${dateRange}dias_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(t('pages.sales.reportExported'))
  }, [dailySales, dateRange])

  const handleSort = useCallback((field: keyof WaiterPerformance) => {
    setSortAsc((prev) => (sortField === field ? !prev : false))
    setSortField(field)
  }, [sortField])

  const sortedWaiters = useMemo(() => {
    const sorted = [...waiterPerformance].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal
      }
      return String(aVal).localeCompare(String(bVal)) * (sortAsc ? 1 : -1)
    })
    return sorted
  }, [waiterPerformance, sortField, sortAsc])

  const SortHeader = ({ field, label }: { field: keyof WaiterPerformance; label: string }) => (
    <th
      className="pb-2 font-medium text-right cursor-pointer hover:text-[var(--text-primary)] select-none"
      onClick={() => handleSort(field)}
    >
      {label} {sortField === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <PageContainer
      title={t('pages.sales.title')}
      description={t('pages.sales.description')}
      helpContent={helpContent.sales}
      actions={
        <div className="flex items-center gap-3">
          <Select
            options={branchOptions}
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-48"
            aria-label={t('pages.sales.filterByBranch')}
          />
          <Select
            options={dateRangeOptions}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-40"
            aria-label={t('pages.sales.timePeriod')}
          />
          <Button
            variant="ghost"
            onClick={() => {
              fetchReports()
              if (activeTab === 'waiters') fetchWaiterPerformance()
            }}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            disabled={isLoading}
          >
            Actualizar
          </Button>
          <Button
            variant="secondary"
            onClick={exportToCSV}
            leftIcon={<Download className="w-4 h-4" />}
            disabled={dailySales.length === 0}
          >
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const branchId = selectedBranchId ? parseInt(selectedBranchId, 10) : undefined
              if (branchId) {
                printDailyReport(branchId)
              }
            }}
            leftIcon={<Printer className="w-4 h-4" />}
            disabled={!selectedBranchId}
          >
            Imprimir Cierre
          </Button>
        </div>
      }
    >
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-default)]">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'sales'
              ? 'text-[var(--primary-500)] border-b-2 border-[var(--primary-500)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setActiveTab('sales')}
        >
          {t('pages.sales.tabSales')}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'waiters'
              ? 'text-[var(--primary-500)] border-b-2 border-[var(--primary-500)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setActiveTab('waiters')}
        >
          {t('pages.sales.tabWaiters')}
        </button>
      </div>

      {activeTab === 'sales' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--text-tertiary)]">{t('pages.sales.totalSales')}</p>
                <DollarSign className="w-5 h-5 text-[var(--success-icon)]" />
              </div>
              {isLoading ? (
                <div className="h-8 bg-[var(--bg-tertiary)] rounded w-32 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatCurrency(summary?.total_revenue_cents || 0)}
                </p>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--text-tertiary)]">{t('pages.sales.orders')}</p>
                <ShoppingBag className="w-5 h-5 text-[var(--info-icon)]" />
              </div>
              {isLoading ? (
                <div className="h-8 bg-[var(--bg-tertiary)] rounded w-20 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[var(--text-primary)]">{summary?.total_orders || 0}</p>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--text-tertiary)]">{t('pages.sales.sessions')}</p>
                <Users className="w-5 h-5 text-purple-500" />
              </div>
              {isLoading ? (
                <div className="h-8 bg-[var(--bg-tertiary)] rounded w-16 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[var(--text-primary)]">{summary?.total_sessions || 0}</p>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--text-tertiary)]">{t('pages.sales.avgTicket')}</p>
                <TrendingUp className="w-5 h-5 text-[var(--primary-500)]" />
              </div>
              {isLoading ? (
                <div className="h-8 bg-[var(--bg-tertiary)] rounded w-28 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatCurrency(summary?.avg_order_value_cents || 0)}
                </p>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--text-tertiary)]">{t('pages.sales.peakHour')}</p>
                <Clock className="w-5 h-5 text-[var(--warning-icon)]" />
              </div>
              {isLoading ? (
                <div className="h-8 bg-[var(--bg-tertiary)] rounded w-24 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatHour(summary?.busiest_hour ?? null)}
                </p>
              )}
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Daily Sales Chart */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.sales.dailySales')}</h3>
              {isLoading ? (
                <div className="h-64 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
              ) : dailySales.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
                  {t('pages.sales.noDataForPeriod')}
                </div>
              ) : (
                <div className="h-64 flex items-end gap-1 overflow-x-auto pb-2">
                  {dailySales.map((day) => {
                    const height = (day.total_sales_cents / maxDailySale) * 100
                    return (
                      <div
                        key={day.date}
                        className="flex-1 min-w-[20px] max-w-[40px] flex flex-col items-center group"
                      >
                        <div
                          className="w-full bg-[var(--primary-500)] rounded-t transition-all hover:bg-orange-400"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${day.date}: ${formatCurrency(day.total_sales_cents)}`}
                        />
                        <span className="text-[10px] text-[var(--text-muted)] mt-1 rotate-45 origin-left whitespace-nowrap">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Top Products */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.sales.topProducts')}</h3>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : topProducts.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
                  {t('pages.sales.noDataForPeriod')}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {topProducts.map((product, index) => {
                    const maxQty = topProducts[0]?.quantity_sold || 1
                    const width = (product.quantity_sold / maxQty) * 100
                    return (
                      <div key={product.product_id} className="flex items-center gap-3">
                        <span className="text-[var(--text-muted)] w-6 text-right">{index + 1}.</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-[var(--text-primary)] truncate">{product.product_name}</span>
                            <span className="text-[var(--text-tertiary)] ml-2">
                              {product.quantity_sold} {t('pages.sales.units')}
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                            <div
                              className="h-full bg-[var(--info-border)] rounded"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[var(--success-text)] text-sm w-24 text-right">
                          {formatCurrency(product.total_revenue_cents)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Hourly Orders Distribution */}
          <Card className="p-4 mb-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.sales.ordersByHour')}</h3>
            {isLoading ? (
              <div className="h-48 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
            ) : hourlyOrders.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
                {t('pages.sales.noDataForPeriod')}
              </div>
            ) : (
              <div className="h-48 flex items-end gap-[2px] overflow-x-auto pb-6 relative">
                {fullHourlyData.map((entry) => {
                  const height = (entry.order_count / maxHourlyOrders) * 100
                  const isBusiest = summary?.busiest_hour === entry.hour
                  return (
                    <div
                      key={entry.hour}
                      className="flex-1 min-w-[28px] flex flex-col items-center group relative"
                    >
                      {/* Count label on hover */}
                      {entry.order_count > 0 && (
                        <span className="text-[10px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                          {entry.order_count}
                        </span>
                      )}
                      <div
                        className={`w-full rounded-t transition-all ${
                          isBusiest
                            ? 'bg-orange-500 hover:bg-orange-400'
                            : entry.order_count > 0
                              ? 'bg-[var(--primary-500)]/70 hover:bg-[var(--primary-500)]'
                              : 'bg-[var(--bg-tertiary)]'
                        }`}
                        style={{ height: `${Math.max(height, entry.order_count > 0 ? 4 : 1)}%` }}
                        title={`${entry.hour}:00 — ${entry.order_count} pedidos`}
                      />
                      <span className={`text-[10px] mt-1 absolute -bottom-5 ${
                        entry.hour % 2 === 0 ? 'text-[var(--text-muted)]' : 'text-transparent'
                      }`}>
                        {entry.hour}h
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Daily Sales Table */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.sales.dailyDetail')}</h3>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-10 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
                ))}
              </div>
            ) : dailySales.length === 0 ? (
              <div className="text-center text-[var(--text-muted)] py-8">
                {t('pages.sales.noDataForPeriod')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-default)]">
                      <th className="pb-2 font-medium">{t('pages.sales.dateColumn')}</th>
                      <th className="pb-2 font-medium text-right">{t('pages.sales.salesColumn')}</th>
                      <th className="pb-2 font-medium text-right">{t('pages.sales.ordersColumn')}</th>
                      <th className="pb-2 font-medium text-right">{t('pages.sales.avgTicketColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySales.slice().reverse().map((day) => (
                      <tr key={day.date} className="border-b border-[var(--border-default)]/50 hover:bg-[var(--bg-tertiary)]/30">
                        <td className="py-2 text-[var(--text-primary)]">{day.date}</td>
                        <td className="py-2 text-right text-[var(--success-text)]">
                          {formatCurrency(day.total_sales_cents)}
                        </td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">{day.order_count}</td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">
                          {formatCurrency(day.avg_order_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === 'waiters' && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {t('pages.sales.waiterPerformance')}
          </h3>
          {isLoadingWaiters ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
              ))}
            </div>
          ) : sortedWaiters.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-8">
              {t('pages.sales.noWaitersFound')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-default)]">
                    <th className="pb-2 font-medium">{t('pages.sales.waiterName')}</th>
                    <SortHeader field="total_tables_served" label={t('pages.sales.tablesServed')} />
                    <SortHeader field="total_rounds_processed" label={t('pages.sales.roundsProcessed')} />
                    <SortHeader field="total_revenue_cents" label={t('pages.sales.revenue')} />
                    <SortHeader field="total_tips_cents" label={t('pages.sales.tips')} />
                    <SortHeader field="avg_service_time_minutes" label={t('pages.sales.avgServiceTime')} />
                    <SortHeader field="total_service_calls" label={t('pages.sales.serviceCalls')} />
                    <SortHeader field="avg_response_time_seconds" label={t('pages.sales.avgResponseTime')} />
                  </tr>
                </thead>
                <tbody>
                  {sortedWaiters.map((waiter) => (
                    <tr
                      key={waiter.user_id}
                      className="border-b border-[var(--border-default)]/50 hover:bg-[var(--bg-tertiary)]/30"
                    >
                      <td className="py-2 text-[var(--text-primary)] font-medium">{waiter.user_name}</td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">{waiter.total_tables_served}</td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">{waiter.total_rounds_processed}</td>
                      <td className="py-2 text-right text-[var(--success-text)]">
                        {formatCurrency(waiter.total_revenue_cents)}
                      </td>
                      <td className="py-2 text-right text-[var(--primary-500)]">
                        {formatCurrency(waiter.total_tips_cents)}
                      </td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">
                        {waiter.avg_service_time_minutes} {t('pages.sales.minutes')}
                      </td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">{waiter.total_service_calls}</td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">
                        {waiter.avg_response_time_seconds} {t('pages.sales.seconds')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Screen reader announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {isLoading
          ? t('pages.sales.loadingStats')
          : t('pages.sales.showingSalesFor', { days: dateRange })}
      </div>
    </PageContainer>
  )
}

export default SalesPage
