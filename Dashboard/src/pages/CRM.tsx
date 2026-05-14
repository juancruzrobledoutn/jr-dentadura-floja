import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, Search, BarChart3, Pencil, Trash2, Eye, Download, ShieldOff } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface Customer {
  id: number
  name: string
  email: string | null
  phone: string | null
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'
  points: number
  total_visits: number
  total_spent_cents: number
  last_visit: string | null
  created_at: string
  is_active: boolean
}

interface CustomerVisit {
  id: number
  date: string
  branch_name: string
  amount_cents: number
}

interface LoyaltyRule {
  id: number
  name: string
  description: string
  points_per_unit: number
  min_amount_cents: number
  is_active: boolean
}

interface LoyaltyReport {
  active_members: number
  by_tier: { tier: string; count: number }[]
  total_points_issued: number
  total_points_redeemed: number
  redemption_rate: number
}

interface CustomerReport {
  retention_rate: number
  avg_visits_per_month: number
  avg_spending_cents: number
  top_spenders: { name: string; total_cents: number }[]
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// TIER_CONFIG moved to component for i18n

type TabKey = 'customers' | 'top' | 'loyalty' | 'reports'

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function CRMPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.crm.title'))

  const TIER_CONFIG: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'danger'; color: string }> = {
    BRONZE: { label: t('pages.crm.tierBronze'), variant: 'warning', color: 'text-amber-700' },
    SILVER: { label: t('pages.crm.tierSilver'), variant: 'default', color: 'text-gray-400' },
    GOLD: { label: t('pages.crm.tierGold'), variant: 'success', color: 'text-yellow-400' },
    PLATINUM: { label: t('pages.crm.tierPlatinum'), variant: 'danger', color: 'text-purple-400' },
  }

  const [activeTab, setActiveTab] = useState<TabKey>('customers')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loyaltyRules, setLoyaltyRules] = useState<LoyaltyRule[]>([])
  const [loyaltyReport, setLoyaltyReport] = useState<LoyaltyReport | null>(null)
  const [customerReport, setCustomerReport] = useState<CustomerReport | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerVisits] = useState<CustomerVisit[]>([])

  // Customer modal
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [custName, setCustName] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')

  // Loyalty rule modal
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<LoyaltyRule | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [rulePoints, setRulePoints] = useState('1')
  const [ruleMinAmount, setRuleMinAmount] = useState('0')

  // Top sort
  const [topSortBy, setTopSortBy] = useState<'spending' | 'visits'>('spending')

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)))
  }, [customers, searchQuery])

  const topCustomers = useMemo(() => {
    return [...customers].sort((a, b) => topSortBy === 'spending' ? b.total_spent_cents - a.total_spent_cents : b.total_visits - a.total_visits).slice(0, 10)
  }, [customers, topSortBy])

  const handleSaveCustomer = useCallback(() => {
    if (!custName.trim()) { toast.error(t('pages.crm.nameRequired')); return }
    if (editingCustomer) {
      setCustomers((prev) => prev.map((c) => c.id === editingCustomer.id ? { ...c, name: custName, email: custEmail || null, phone: custPhone || null } : c))
      toast.success(t('pages.crm.customerUpdated'))
    } else {
      setCustomers((prev) => [...prev, { id: Date.now(), name: custName, email: custEmail || null, phone: custPhone || null, tier: 'BRONZE' as const, points: 0, total_visits: 0, total_spent_cents: 0, last_visit: null, created_at: new Date().toISOString(), is_active: true }])
      toast.success(t('pages.crm.customerCreated'))
    }
    setShowCustomerModal(false)
    setEditingCustomer(null)
    setCustName('')
    setCustEmail('')
    setCustPhone('')
  }, [custName, custEmail, custPhone, editingCustomer])

  const handleDeleteCustomer = useCallback((id: number) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    toast.success(t('pages.crm.customerDeleted'))
  }, [])

  const handleExportCustomerData = useCallback((customer: Customer) => {
    // Build a client-side JSON export of the customer data
    const exportData = {
      export_metadata: {
        exported_at: new Date().toISOString(),
        customer_id: customer.id,
        format_version: '1.0',
      },
      profile: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        tier: customer.tier,
        points: customer.points,
        total_visits: customer.total_visits,
        total_spent_cents: customer.total_spent_cents,
        last_visit: customer.last_visit,
        created_at: customer.created_at,
      },
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customer_${customer.id}_export.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('pages.crm.dataExported'))
  }, [])

  const handleAnonymizeCustomer = useCallback((id: number) => {
    if (!window.confirm(t('pages.crm.anonymizeConfirm'))) return
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, name: 'Cliente Anonimo', email: 'anonimo@redacted.com', phone: '0000000000' }
          : c
      )
    )
    toast.success(t('pages.crm.dataAnonymized'))
  }, [])

  const openCustomerDetail = useCallback((customer: Customer) => {
    setSelectedCustomer(customer)
    setShowDetailModal(true)
  }, [])

  const openEditCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer)
    setCustName(customer.name)
    setCustEmail(customer.email || '')
    setCustPhone(customer.phone || '')
    setShowCustomerModal(true)
  }, [])

  const handleSaveRule = useCallback(() => {
    if (!ruleName.trim()) { toast.error(t('pages.crm.nameRequired')); return }
    if (editingRule) {
      setLoyaltyRules((prev) => prev.map((r) => r.id === editingRule.id ? { ...r, name: ruleName, description: ruleDescription, points_per_unit: parseInt(rulePoints, 10) || 1, min_amount_cents: Math.round(parseFloat(ruleMinAmount || '0') * 100) } : r))
      toast.success(t('pages.crm.ruleUpdated'))
    } else {
      setLoyaltyRules((prev) => [...prev, { id: Date.now(), name: ruleName, description: ruleDescription, points_per_unit: parseInt(rulePoints, 10) || 1, min_amount_cents: Math.round(parseFloat(ruleMinAmount || '0') * 100), is_active: true }])
      toast.success(t('pages.crm.ruleCreated'))
    }
    setShowRuleModal(false)
    setEditingRule(null)
    setRuleName('')
    setRuleDescription('')
    setRulePoints('1')
    setRuleMinAmount('0')
  }, [ruleName, ruleDescription, rulePoints, ruleMinAmount, editingRule])

  const handleDeleteRule = useCallback((id: number) => {
    setLoyaltyRules((prev) => prev.filter((r) => r.id !== id))
    toast.success(t('pages.crm.ruleDeleted'))
  }, [])

  const handleGenerateLoyaltyReport = useCallback(() => {
    const byTier = new Map<string, number>()
    for (const c of customers) byTier.set(c.tier, (byTier.get(c.tier) || 0) + 1)
    const totalPts = customers.reduce((s, c) => s + c.points, 0)
    setLoyaltyReport({ active_members: customers.filter((c) => c.is_active).length, by_tier: Array.from(byTier.entries()).map(([tier, count]) => ({ tier, count })), total_points_issued: totalPts, total_points_redeemed: Math.round(totalPts * 0.3), redemption_rate: totalPts > 0 ? 30 : 0 })
  }, [customers])

  const handleGenerateCustomerReport = useCallback(() => {
    const totalVisits = customers.reduce((s, c) => s + c.total_visits, 0)
    const totalSpent = customers.reduce((s, c) => s + c.total_spent_cents, 0)
    const count = customers.length || 1
    setCustomerReport({
      retention_rate: customers.length > 0 ? 75 : 0,
      avg_visits_per_month: Math.round((totalVisits / count) * 10) / 10,
      avg_spending_cents: Math.round(totalSpent / count),
      top_spenders: [...customers].sort((a, b) => b.total_spent_cents - a.total_spent_cents).slice(0, 5).map((c) => ({ name: c.name, total_cents: c.total_spent_cents })),
    })
  }, [customers])

  return (
    <PageContainer title={t('pages.crm.title')} description={t('pages.crm.description')}>
      <div className="flex gap-2 mb-6" role="tablist">
        {([{ key: 'customers' as TabKey, label: t('pages.crm.tabCustomers') }, { key: 'top' as TabKey, label: t('pages.crm.tabTopCustomers') }, { key: 'loyalty' as TabKey, label: t('pages.crm.tabLoyalty') }, { key: 'reports' as TabKey, label: t('pages.crm.tabReports') }]).map((tab) => (
          <button key={tab.key} role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-orange-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>{tab.label}</button>
        ))}
      </div>

      {/* Tab: Clientes */}
      {activeTab === 'customers' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.crm.customers')}</h3>
            <Button variant="primary" size="sm" onClick={() => { setEditingCustomer(null); setCustName(''); setCustEmail(''); setCustPhone(''); setShowCustomerModal(true) }} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>{t('pages.crm.newCustomer')}</Button>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('pages.crm.searchPlaceholder')} className="w-full pl-10 pr-4 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" aria-label={t('pages.crm.searchLabel')} />
          </div>
          {filteredCustomers.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{searchQuery ? t('pages.crm.noCustomersFound') : t('pages.crm.noCustomers')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.crm.customersTableLabel')}>
                <thead><tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.nameCol')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.emailCol')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.phoneCol')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.tierCol')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.pointsCol')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.visits')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.totalSpentCol')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.actionsCol')}</th>
                </tr></thead>
                <tbody>{filteredCustomers.map((c) => {
                  const cfg = TIER_CONFIG[c.tier] || TIER_CONFIG.BRONZE
                  return (
                    <tr key={c.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)] cursor-pointer" onClick={() => openCustomerDetail(c)}>
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{c.name}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{c.email || '-'}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{c.phone || '-'}</td>
                      <td className="py-2 px-3 text-center"><Badge variant={cfg.variant}><span className={cfg.color}>{cfg.label}</span></Badge></td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{c.points}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{c.total_visits}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{formatCurrency(c.total_spent_cents)}</td>
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => openCustomerDetail(c)} aria-label={`Ver ${c.name}`}><Eye className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="secondary" size="sm" onClick={() => openEditCustomer(c)} aria-label={`Editar ${c.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="secondary" size="sm" onClick={() => handleExportCustomerData(c)} aria-label={t('pages.crm.exportData') + ' ' + c.name}><Download className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="outline" size="sm" onClick={() => handleAnonymizeCustomer(c.id)} aria-label={t('pages.crm.anonymize') + ' ' + c.name}><ShieldOff className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteCustomer(c.id)} aria-label={`Eliminar ${c.name}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Top Clientes */}
      {activeTab === 'top' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-4 items-center">
              <span className="text-sm text-[var(--text-secondary)]">{t('pages.crm.sortBy')}</span>
              <div className="flex gap-2">
                <Button variant={topSortBy === 'spending' ? 'primary' : 'secondary'} size="sm" onClick={() => setTopSortBy('spending')}>{t('pages.crm.spending')}</Button>
                <Button variant={topSortBy === 'visits' ? 'primary' : 'secondary'} size="sm" onClick={() => setTopSortBy('visits')}>{t('pages.crm.visits')}</Button>
              </div>
            </div>
          </Card>
          {topCustomers.length === 0 ? (
            <Card className="p-6"><p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.crm.noCustomersToShow')}</p></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topCustomers.map((c, i) => {
                const cfg = TIER_CONFIG[c.tier] || TIER_CONFIG.BRONZE
                return (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--primary-500)]/20 flex items-center justify-center">
                        <span className="text-lg font-bold text-[var(--primary-600)]">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-[var(--text-primary)] truncate">{c.name}</h4>
                          <Badge variant={cfg.variant}><span className={cfg.color}>{cfg.label}</span></Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-[var(--text-muted)]">{t('pages.crm.totalSpentCol')}</p><p className="font-medium text-green-400">{formatCurrency(c.total_spent_cents)}</p></div>
                          <div><p className="text-[var(--text-muted)]">{t('pages.crm.visits')}</p><p className="font-medium text-[var(--text-primary)]">{c.total_visits}</p></div>
                          <div><p className="text-[var(--text-muted)]">{t('pages.crm.pointsCol')}</p><p className="font-medium text-[var(--primary-600)]">{c.points}</p></div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Programa de Lealtad */}
      {activeTab === 'loyalty' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.crm.loyaltyRules')}</h3>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleGenerateLoyaltyReport}>{t('pages.crm.viewStats')}</Button>
                <Button variant="primary" size="sm" onClick={() => { setEditingRule(null); setRuleName(''); setRuleDescription(''); setRulePoints('1'); setRuleMinAmount('0'); setShowRuleModal(true) }} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>{t('pages.crm.newRule')}</Button>
              </div>
            </div>
            {loyaltyRules.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.crm.noRules')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label={t('pages.crm.loyaltyTableLabel')}>
                  <thead><tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.nameCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.descriptionCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.pointsPerUnit')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.minAmount')}</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.statusCol')}</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.crm.actionsCol')}</th>
                  </tr></thead>
                  <tbody>{loyaltyRules.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{r.name}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{r.description || '-'}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{r.points_per_unit}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{formatCurrency(r.min_amount_cents)}</td>
                      <td className="py-2 px-3 text-center"><Badge variant={r.is_active ? 'success' : 'default'}>{r.is_active ? 'Activa' : 'Inactiva'}</Badge></td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => { setEditingRule(r); setRuleName(r.name); setRuleDescription(r.description); setRulePoints(String(r.points_per_unit)); setRuleMinAmount(String(r.min_amount_cents / 100)); setShowRuleModal(true) }} aria-label={`Editar ${r.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteRule(r.id)} aria-label={`Eliminar ${r.name}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
          {loyaltyReport && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.activeMembers')}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{loyaltyReport.active_members}</p></Card>
              <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.pointsIssued')}</p><p className="text-2xl font-bold text-[var(--primary-600)]">{loyaltyReport.total_points_issued}</p></Card>
              <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.pointsRedeemed')}</p><p className="text-2xl font-bold text-green-400">{loyaltyReport.total_points_redeemed}</p></Card>
              <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.redemptionRate')}</p><p className="text-2xl font-bold text-blue-400">{loyaltyReport.redemption_rate}%</p></Card>
            </div>
          )}
        </div>
      )}

      {/* Tab: Reportes */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
                Reportes de Clientes
              </h3>
              <Button variant="primary" size="sm" onClick={handleGenerateCustomerReport}>{t('pages.crm.generateReport')}</Button>
            </div>
          </Card>
          {customerReport && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.retentionRate')}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{customerReport.retention_rate}%</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.avgVisitsPerMonth')}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{customerReport.avg_visits_per_month}</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.crm.avgSpending')}</p><p className="text-2xl font-bold text-green-400">{formatCurrency(customerReport.avg_spending_cents)}</p></Card>
              </div>
              <Card className="p-6">
                <h4 className="text-md font-semibold text-[var(--text-primary)] mb-3">{t('pages.crm.topBySpending')}</h4>
                {customerReport.top_spenders.length === 0 ? <p className="text-[var(--text-muted)] text-sm">{t('pages.crm.noData')}</p> : (
                  <div className="space-y-2">
                    {customerReport.top_spenders.map((s, i) => (
                      <div key={s.name} className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-[var(--primary-600)]">{i + 1}</span>
                          <span className="font-medium text-[var(--text-primary)]">{s.name}</span>
                        </div>
                        <span className="font-medium text-green-400">{formatCurrency(s.total_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modal: Cliente */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCustomerModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingCustomer ? t('pages.crm.editCustomer') : t('pages.crm.newCustomerTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="cust-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.nameCol')}</label>
                <input id="cust-name" type="text" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Nombre completo" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="cust-email" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.emailOptional')}</label>
                <input id="cust-email" type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="email@ejemplo.com" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="cust-phone" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.phoneOptional')}</label>
                <input id="cust-phone" type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="+54 11 1234-5678" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowCustomerModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSaveCustomer}>{editingCustomer ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle Cliente */}
      {showDetailModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDetailModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-lg border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{selectedCustomer.name}</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.emailCol')}</p><p className="text-sm text-[var(--text-primary)]">{selectedCustomer.email || '-'}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.phoneCol')}</p><p className="text-sm text-[var(--text-primary)]">{selectedCustomer.phone || '-'}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.tierCol')}</p><Badge variant={TIER_CONFIG[selectedCustomer.tier]?.variant || 'default'}>{TIER_CONFIG[selectedCustomer.tier]?.label || selectedCustomer.tier}</Badge></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.pointsCol')}</p><p className="text-sm font-medium text-[var(--primary-600)]">{selectedCustomer.points}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.visits')}</p><p className="text-sm text-[var(--text-primary)]">{selectedCustomer.total_visits}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.totalSpentCol')}</p><p className="text-sm font-medium text-green-400">{formatCurrency(selectedCustomer.total_spent_cents)}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.lastVisit')}</p><p className="text-sm text-[var(--text-secondary)]">{formatDate(selectedCustomer.last_visit)}</p></div>
              <div><p className="text-xs text-[var(--text-muted)]">{t('pages.crm.customerSince')}</p><p className="text-sm text-[var(--text-secondary)]">{formatDate(selectedCustomer.created_at)}</p></div>
            </div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('pages.crm.visitHistory')}</h4>
            {customerVisits.length === 0 ? <p className="text-[var(--text-muted)] text-xs">{t('pages.crm.noVisits')}</p> : (
              <div className="space-y-2">{customerVisits.map((v) => (
                <div key={v.id} className="flex justify-between text-xs p-2 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)]">{formatDate(v.date)}</span>
                  <span className="text-[var(--text-muted)]">{v.branch_name}</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatCurrency(v.amount_cents)}</span>
                </div>
              ))}</div>
            )}
            <div className="flex justify-between mt-6">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleExportCustomerData(selectedCustomer)} leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}>{t('pages.crm.exportData')}</Button>
                <Button variant="outline" size="sm" onClick={() => { handleAnonymizeCustomer(selectedCustomer.id); setShowDetailModal(false) }} leftIcon={<ShieldOff className="w-3.5 h-3.5" aria-hidden="true" />}>{t('pages.crm.anonymize')}</Button>
              </div>
              <Button variant="secondary" onClick={() => setShowDetailModal(false)}>{t('common.close')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Regla de Lealtad */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRuleModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingRule ? t('pages.crm.editRule') : t('pages.crm.newRuleTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="rule-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.nameCol')}</label>
                <input id="rule-name" type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Ej: Puntos por compra" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="rule-desc" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.descriptionCol')}</label>
                <input id="rule-desc" type="text" value={ruleDescription} onChange={(e) => setRuleDescription(e.target.value)} placeholder="Descripcion de la regla" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rule-pts" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.rulePointsPerUnit')}</label>
                  <input id="rule-pts" type="number" min="1" value={rulePoints} onChange={(e) => setRulePoints(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
                <div>
                  <label htmlFor="rule-min" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.crm.ruleMinAmount')}</label>
                  <input id="rule-min" type="number" min="0" step="0.01" value={ruleMinAmount} onChange={(e) => setRuleMinAmount(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowRuleModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSaveRule}>{editingRule ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default CRMPage
