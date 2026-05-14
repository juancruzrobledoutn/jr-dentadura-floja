import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Coins,
  Plus,
  PieChart,
  BarChart3,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui'
import { useBranchStore, selectSelectedBranchId } from '../stores/branchStore'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface Tip {
  id: number
  branch_id: number
  session_id: number
  waiter_id: number
  waiter_name: string
  table_code: string
  amount_cents: number
  payment_method: string
  created_at: string
  distributed: boolean
}

interface TipPool {
  id: number
  tenant_id: number
  name: string
  waiter_pct: number
  kitchen_pct: number
  other_pct: number
  is_active: boolean
}

interface TipDistribution {
  id: number
  tip_id: number
  pool_id: number
  pool_name: string
  waiter_amount_cents: number
  kitchen_amount_cents: number
  other_amount_cents: number
  distributed_at: string
}

interface TipReport {
  total_tips_cents: number
  by_waiter: { waiter_name: string; total_cents: number; count: number }[]
  by_method: { method: string; total_cents: number; count: number }[]
  daily_average_cents: number
  period_days: number
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(cents / 100)
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// PAYMENT_METHOD_LABELS moved to component for i18n

type TabKey = 'tips' | 'distribution' | 'pools' | 'reports'

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function TipsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.tips.title'))

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: t('pages.tips.cash'),
    CARD: t('pages.tips.card'),
    MP: t('pages.tips.mercadoPago'),
  }

  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [activeTab, setActiveTab] = useState<TabKey>('tips')
  const [tips, setTips] = useState<Tip[]>([])
  const [pools, setPools] = useState<TipPool[]>([])
  const [distributions, setDistributions] = useState<TipDistribution[]>([])
  const [report, setReport] = useState<TipReport | null>(null)

  // Tip modal state
  const [showTipModal, setShowTipModal] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [tipMethod, setTipMethod] = useState('CASH')
  const [tipWaiter, setTipWaiter] = useState('')
  const [tipSession, setTipSession] = useState('')

  // Pool modal state
  const [showPoolModal, setShowPoolModal] = useState(false)
  const [editingPool, setEditingPool] = useState<TipPool | null>(null)
  const [poolName, setPoolName] = useState('')
  const [poolWaiterPct, setPoolWaiterPct] = useState('70')
  const [poolKitchenPct, setPoolKitchenPct] = useState('20')
  const [poolOtherPct, setPoolOtherPct] = useState('10')

  // Distribution modal state
  const [showDistributeModal, setShowDistributeModal] = useState(false)
  const [distributeTipId, setDistributeTipId] = useState('')
  const [distributePoolId, setDistributePoolId] = useState('')

  // Report filters
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')

  const paymentMethodOptions = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
    value,
    label,
  }))

  const handleCreateTip = useCallback(() => {
    const cents = Math.round(parseFloat(tipAmount || '0') * 100)
    if (cents <= 0) {
      toast.error(t('pages.tips.amountGreaterThanZero'))
      return
    }

    const newTip: Tip = {
      id: Date.now(),
      branch_id: parseInt(selectedBranchId || '0', 10),
      session_id: parseInt(tipSession || '0', 10),
      waiter_id: parseInt(tipWaiter || '0', 10),
      waiter_name: `Mozo #${tipWaiter || '0'}`,
      table_code: `Mesa-${tipSession || '?'}`,
      amount_cents: cents,
      payment_method: tipMethod,
      created_at: new Date().toISOString(),
      distributed: false,
    }

    setTips((prev) => [newTip, ...prev])
    setShowTipModal(false)
    setTipAmount('')
    setTipSession('')
    setTipWaiter('')
    toast.success(t('pages.tips.tipRegistered'))
  }, [tipAmount, tipMethod, tipWaiter, tipSession, selectedBranchId])

  const handleSavePool = useCallback(() => {
    const waiter = parseFloat(poolWaiterPct || '0')
    const kitchen = parseFloat(poolKitchenPct || '0')
    const other = parseFloat(poolOtherPct || '0')
    const total = waiter + kitchen + other

    if (!poolName.trim()) {
      toast.error(t('pages.tips.nameRequired'))
      return
    }
    if (Math.abs(total - 100) > 0.01) {
      toast.error(t('pages.tips.pctError', { actual: total.toFixed(1) }))
      return
    }

    if (editingPool) {
      setPools((prev) =>
        prev.map((p) =>
          p.id === editingPool.id
            ? { ...p, name: poolName, waiter_pct: waiter, kitchen_pct: kitchen, other_pct: other }
            : p
        )
      )
      toast.success(t('pages.tips.poolUpdated'))
    } else {
      const newPool: TipPool = {
        id: Date.now(),
        tenant_id: 1,
        name: poolName,
        waiter_pct: waiter,
        kitchen_pct: kitchen,
        other_pct: other,
        is_active: true,
      }
      setPools((prev) => [...prev, newPool])
      toast.success(t('pages.tips.poolCreated'))
    }

    setShowPoolModal(false)
    setEditingPool(null)
    setPoolName('')
    setPoolWaiterPct('70')
    setPoolKitchenPct('20')
    setPoolOtherPct('10')
  }, [poolName, poolWaiterPct, poolKitchenPct, poolOtherPct, editingPool])

  const handleDeletePool = useCallback((poolId: number) => {
    setPools((prev) => prev.filter((p) => p.id !== poolId))
    toast.success(t('pages.tips.poolDeleted'))
  }, [])

  const openEditPool = useCallback((pool: TipPool) => {
    setEditingPool(pool)
    setPoolName(pool.name)
    setPoolWaiterPct(String(pool.waiter_pct))
    setPoolKitchenPct(String(pool.kitchen_pct))
    setPoolOtherPct(String(pool.other_pct))
    setShowPoolModal(true)
  }, [])

  const handleDistribute = useCallback(() => {
    if (!distributeTipId || !distributePoolId) {
      toast.error(t('pages.tips.selectTipAndPool'))
      return
    }

    const tip = tips.find((t) => t.id === parseInt(distributeTipId, 10))
    const pool = pools.find((p) => p.id === parseInt(distributePoolId, 10))
    if (!tip || !pool) return

    const dist: TipDistribution = {
      id: Date.now(),
      tip_id: tip.id,
      pool_id: pool.id,
      pool_name: pool.name,
      waiter_amount_cents: Math.round((tip.amount_cents * pool.waiter_pct) / 100),
      kitchen_amount_cents: Math.round((tip.amount_cents * pool.kitchen_pct) / 100),
      other_amount_cents: Math.round((tip.amount_cents * pool.other_pct) / 100),
      distributed_at: new Date().toISOString(),
    }

    setDistributions((prev) => [dist, ...prev])
    setTips((prev) => prev.map((t) => (t.id === tip.id ? { ...t, distributed: true } : t)))
    setShowDistributeModal(false)
    setDistributeTipId('')
    setDistributePoolId('')
    toast.success(t('pages.tips.tipDistributed'))
  }, [distributeTipId, distributePoolId, tips, pools])

  const handleGenerateReport = useCallback(() => {
    if (!reportFrom || !reportTo) {
      toast.error(t('pages.tips.selectDateRange'))
      return
    }

    const from = new Date(reportFrom)
    const to = new Date(reportTo)
    const filtered = tips.filter((t) => {
      const d = new Date(t.created_at)
      return d >= from && d <= to
    })

    const byWaiter = new Map<string, { total_cents: number; count: number }>()
    const byMethod = new Map<string, { total_cents: number; count: number }>()

    for (const t of filtered) {
      const w = byWaiter.get(t.waiter_name) || { total_cents: 0, count: 0 }
      w.total_cents += t.amount_cents
      w.count += 1
      byWaiter.set(t.waiter_name, w)

      const m = byMethod.get(t.payment_method) || { total_cents: 0, count: 0 }
      m.total_cents += t.amount_cents
      m.count += 1
      byMethod.set(t.payment_method, m)
    }

    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)))
    const totalCents = filtered.reduce((sum, t) => sum + t.amount_cents, 0)

    setReport({
      total_tips_cents: totalCents,
      by_waiter: Array.from(byWaiter.entries()).map(([waiter_name, data]) => ({ waiter_name, ...data })),
      by_method: Array.from(byMethod.entries()).map(([method, data]) => ({ method, ...data })),
      daily_average_cents: Math.round(totalCents / days),
      period_days: days,
    })
  }, [reportFrom, reportTo, tips])

  const poolOptions = useMemo(
    () => pools.map((p) => ({ value: String(p.id), label: p.name })),
    [pools]
  )

  const undistributedTipOptions = useMemo(
    () =>
      tips
        .filter((t) => !t.distributed)
        .map((t) => ({
          value: String(t.id),
          label: `${t.table_code} - ${formatCurrency(t.amount_cents)} (${t.waiter_name})`,
        })),
    [tips]
  )

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.tips.title')} description={t('pages.tips.selectBranchDesc')}>
        <Card>
          <div className="text-center py-12 text-[var(--text-muted)]">
            <Coins className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
            <p className="text-lg">{t('pages.tips.selectBranchMessage')}</p>
          </div>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('pages.tips.title')} description={t('pages.tips.description')}>
      {/* Tabs */}
      <div className="flex gap-2 mb-6" role="tablist">
        {([
          { key: 'tips' as TabKey, label: t('pages.tips.tabTips') },
          { key: 'distribution' as TabKey, label: t('pages.tips.tabDistribution') },
          { key: 'pools' as TabKey, label: t('pages.tips.tabPools') },
          { key: 'reports' as TabKey, label: t('pages.tips.tabReports') },
        ]).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Propinas */}
      {activeTab === 'tips' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.tips.registeredTips')}</h3>
            <Button variant="primary" size="sm" onClick={() => setShowTipModal(true)} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>
              Registrar Propina
            </Button>
          </div>
          {tips.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.tips.noTips')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.tips.registeredTips')}>
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.dateCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.tableCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.waiterCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.amountCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.methodCol')}</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.statusCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tips.map((tip) => (
                    <tr key={tip.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDateTime(tip.created_at)}</td>
                      <td className="py-2 px-3 text-[var(--text-primary)]">{tip.table_code}</td>
                      <td className="py-2 px-3 text-[var(--text-primary)]">{tip.waiter_name}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-400">{formatCurrency(tip.amount_cents)}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{PAYMENT_METHOD_LABELS[tip.payment_method] || tip.payment_method}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={tip.distributed ? 'success' : 'warning'}>{tip.distributed ? 'Distribuida' : 'Pendiente'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Distribucion */}
      {activeTab === 'distribution' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.tips.tipDistribution')}</h3>
            <Button variant="primary" size="sm" onClick={() => setShowDistributeModal(true)} leftIcon={<PieChart className="w-4 h-4" aria-hidden="true" />}>
              Distribuir Propina
            </Button>
          </div>
          {distributions.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.tips.noDistributions')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.tips.tipDistribution')}>
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.dateCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.poolCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.waitersCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.kitchenCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.othersCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((d) => (
                    <tr key={d.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDateTime(d.distributed_at)}</td>
                      <td className="py-2 px-3 text-[var(--text-primary)]">{d.pool_name}</td>
                      <td className="py-2 px-3 text-right text-green-400">{formatCurrency(d.waiter_amount_cents)}</td>
                      <td className="py-2 px-3 text-right text-blue-400">{formatCurrency(d.kitchen_amount_cents)}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{formatCurrency(d.other_amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Pools */}
      {activeTab === 'pools' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.tips.distributionPools')}</h3>
            <Button variant="primary" size="sm" onClick={() => { setEditingPool(null); setPoolName(''); setPoolWaiterPct('70'); setPoolKitchenPct('20'); setPoolOtherPct('10'); setShowPoolModal(true) }} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>
              Crear Pool
            </Button>
          </div>
          {pools.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.tips.noPools')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.tips.distributionPools')}>
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.nameCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.waitersPct')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.kitchenPct')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.othersPct')}</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.actionsCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => (
                    <tr key={pool.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{pool.name}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{pool.waiter_pct}%</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{pool.kitchen_pct}%</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{pool.other_pct}%</td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => openEditPool(pool)} aria-label={`Editar pool ${pool.name}`}>
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeletePool(pool.id)} aria-label={`Eliminar pool ${pool.name}`}>
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Reportes */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
              Reporte de Propinas
            </h3>
            <div className="flex gap-4 items-end">
              <div>
                <label htmlFor="report-from" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.from')}</label>
                <input id="report-from" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="report-to" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.to')}</label>
                <input id="report-to" type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Button variant="primary" size="sm" onClick={handleGenerateReport}>{t('pages.tips.generateReport')}</Button>
            </div>
          </Card>
          {report && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-[var(--text-tertiary)] text-sm">{t('pages.tips.totalTips')}</p>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(report.total_tips_cents)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[var(--text-tertiary)] text-sm">{t('pages.tips.dailyAverage')}</p>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(report.daily_average_cents)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[var(--text-tertiary)] text-sm">{t('pages.tips.period')}</p>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{report.period_days} dias</p>
                </Card>
              </div>
              <Card className="p-6">
                <h4 className="text-md font-semibold text-[var(--text-primary)] mb-3">{t('pages.tips.byWaiter')}</h4>
                {report.by_waiter.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm">{t('pages.tips.noData')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-default)]">
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.waiterCol')}</th>
                          <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.quantityCol')}</th>
                          <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.totalCol')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.by_waiter.map((w) => (
                          <tr key={w.waiter_name} className="border-b border-[var(--border-default)]">
                            <td className="py-2 px-3 text-[var(--text-primary)]">{w.waiter_name}</td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{w.count}</td>
                            <td className="py-2 px-3 text-right font-medium text-green-400">{formatCurrency(w.total_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card className="p-6">
                <h4 className="text-md font-semibold text-[var(--text-primary)] mb-3">{t('pages.tips.byPaymentMethod')}</h4>
                {report.by_method.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm">{t('pages.tips.noData')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-default)]">
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.methodCol')}</th>
                          <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.quantityCol')}</th>
                          <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.tips.totalCol')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.by_method.map((m) => (
                          <tr key={m.method} className="border-b border-[var(--border-default)]">
                            <td className="py-2 px-3 text-[var(--text-primary)]">{PAYMENT_METHOD_LABELS[m.method] || m.method}</td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{m.count}</td>
                            <td className="py-2 px-3 text-right font-medium text-green-400">{formatCurrency(m.total_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modal: Registrar Propina */}
      {showTipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTipModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.tips.registerTip')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="tip-session" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.sessionId')}</label>
                <input id="tip-session" type="number" value={tipSession} onChange={(e) => setTipSession(e.target.value)} placeholder="Ej: 12" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="tip-amount" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.amount')}</label>
                <input id="tip-amount" type="number" min="0" step="0.01" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Select id="tip-method" label={t('pages.tips.paymentMethod')} options={paymentMethodOptions} value={tipMethod} onChange={(e) => setTipMethod(e.target.value)} />
              <div>
                <label htmlFor="tip-waiter" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.waiterId')}</label>
                <input id="tip-waiter" type="number" value={tipWaiter} onChange={(e) => setTipWaiter(e.target.value)} placeholder="Ej: 5" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowTipModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleCreateTip}>{t('pages.tips.register')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pool */}
      {showPoolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPoolModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingPool ? t('pages.tips.editPool') : t('pages.tips.createPoolTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="pool-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.nameCol')}</label>
                <input id="pool-name" type="text" value={poolName} onChange={(e) => setPoolName(e.target.value)} placeholder="Ej: Pool Estandar" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pool-waiter" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.waitersPct')}</label>
                  <input id="pool-waiter" type="number" min="0" max="100" value={poolWaiterPct} onChange={(e) => setPoolWaiterPct(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
                <div>
                  <label htmlFor="pool-kitchen" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.kitchenPct')}</label>
                  <input id="pool-kitchen" type="number" min="0" max="100" value={poolKitchenPct} onChange={(e) => setPoolKitchenPct(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
                <div>
                  <label htmlFor="pool-other" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.tips.othersPct')}</label>
                  <input id="pool-other" type="number" min="0" max="100" value={poolOtherPct} onChange={(e) => setPoolOtherPct(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('pages.tips.pctMustSum100')}</p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowPoolModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSavePool}>{editingPool ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Distribuir */}
      {showDistributeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDistributeModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.tips.distributeTip')}</h3>
            <div className="space-y-4">
              <Select id="distribute-tip" label={t('pages.tips.tip')} options={undistributedTipOptions} value={distributeTipId} onChange={(e) => setDistributeTipId(e.target.value)} />
              <Select id="distribute-pool" label={t('pages.tips.distributionPool')} options={poolOptions} value={distributePoolId} onChange={(e) => setDistributePoolId(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowDistributeModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleDistribute}>{t('pages.tips.distribute')}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default TipsPage
