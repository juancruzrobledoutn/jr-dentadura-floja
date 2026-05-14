import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Plus, BarChart3, Pencil, Trash2 } from 'lucide-react'
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

interface Invoice {
  id: number
  branch_id: number
  number: string
  type: 'A' | 'B' | 'C'
  date: string
  net_amount_cents: number
  iva_amount_cents: number
  total_amount_cents: number
  cae: string | null
  cae_expiry: string | null
  status: 'AUTHORIZED' | 'DRAFT' | 'REJECTED' | 'VOIDED'
  customer_doc: string | null
  check_id: number | null
}

interface FiscalPoint {
  id: number
  tenant_id: number
  number: number
  type: string
  cuit: string
  business_name: string
  iva_condition: string
  is_active: boolean
}

interface CreditNote {
  id: number
  invoice_number: string
  number: string
  date: string
  amount_cents: number
  reason: string
  status: string
}

interface MonthlyIVAReport {
  year: number
  month: number
  by_type: { type: string; count: number; net_cents: number; iva_cents: number; total_cents: number }[]
  total_net_cents: number
  total_iva_cents: number
  total_cents: number
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

// STATUS_CONFIG and IVA_CONDITIONS moved to component for i18n

type TabKey = 'invoices' | 'points' | 'credit-notes' | 'iva-report'

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function FiscalPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.fiscal.title'))

  const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
    AUTHORIZED: { label: t('pages.fiscal.statusAuthorized'), variant: 'success' },
    DRAFT: { label: t('pages.fiscal.statusDraft'), variant: 'warning' },
    REJECTED: { label: t('pages.fiscal.statusRejected'), variant: 'danger' },
    VOIDED: { label: t('pages.fiscal.statusVoided'), variant: 'default' },
  }

  const IVA_CONDITIONS = [
    { value: 'RESPONSABLE_INSCRIPTO', label: t('pages.fiscal.ivaResponsableInscripto') },
    { value: 'MONOTRIBUTISTA', label: t('pages.fiscal.ivaMonotributista') },
    { value: 'EXENTO', label: t('pages.fiscal.ivaExento') },
    { value: 'CONSUMIDOR_FINAL', label: t('pages.fiscal.ivaConsumidorFinal') },
  ]

  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [activeTab, setActiveTab] = useState<TabKey>('invoices')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [fiscalPoints, setFiscalPoints] = useState<FiscalPoint[]>([])
  const [creditNotes] = useState<CreditNote[]>([])
  const [ivaReport, setIvaReport] = useState<MonthlyIVAReport | null>(null)

  // Filters
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceType, setInvoiceType] = useState('B')
  const [invoiceCheckId, setInvoiceCheckId] = useState('')
  const [invoiceCustomerDoc, setInvoiceCustomerDoc] = useState('')

  // Fiscal point modal
  const [showPointModal, setShowPointModal] = useState(false)
  const [editingPoint, setEditingPoint] = useState<FiscalPoint | null>(null)
  const [pointNumber, setPointNumber] = useState('')
  const [pointType, setPointType] = useState('ELECTRONIC')
  const [pointCuit, setPointCuit] = useState('')
  const [pointBusinessName, setPointBusinessName] = useState('')
  const [pointIvaCondition, setPointIvaCondition] = useState('RESPONSABLE_INSCRIPTO')

  // IVA report
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()))
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1))

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (filterType) result = result.filter((i) => i.type === filterType)
    if (filterStatus) result = result.filter((i) => i.status === filterStatus)
    return result
  }, [invoices, filterType, filterStatus])

  const resetPointForm = useCallback(() => {
    setPointNumber('')
    setPointType('ELECTRONIC')
    setPointCuit('')
    setPointBusinessName('')
    setPointIvaCondition('RESPONSABLE_INSCRIPTO')
  }, [])

  const handleCreateInvoice = useCallback(() => {
    if (!invoiceCheckId) { toast.error(t('pages.fiscal.selectCheck')); return }
    const newInvoice: Invoice = {
      id: Date.now(),
      branch_id: parseInt(selectedBranchId || '0', 10),
      number: `0001-${String(invoices.length + 1).padStart(8, '0')}`,
      type: invoiceType as 'A' | 'B' | 'C',
      date: new Date().toISOString(),
      net_amount_cents: 100000,
      iva_amount_cents: 21000,
      total_amount_cents: 121000,
      cae: `${Date.now()}`,
      cae_expiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'AUTHORIZED',
      customer_doc: invoiceCustomerDoc || null,
      check_id: parseInt(invoiceCheckId, 10),
    }
    setInvoices((prev) => [newInvoice, ...prev])
    setShowInvoiceModal(false)
    setInvoiceCheckId('')
    setInvoiceCustomerDoc('')
    toast.success(t('pages.fiscal.invoiceIssued'))
  }, [invoiceType, invoiceCheckId, invoiceCustomerDoc, selectedBranchId, invoices.length])

  const handleSavePoint = useCallback(() => {
    if (!pointCuit.trim() || !pointBusinessName.trim()) { toast.error(t('pages.fiscal.cuitRequired')); return }
    if (editingPoint) {
      setFiscalPoints((prev) => prev.map((p) => p.id === editingPoint.id ? { ...p, number: parseInt(pointNumber, 10) || 1, type: pointType, cuit: pointCuit, business_name: pointBusinessName, iva_condition: pointIvaCondition } : p))
      toast.success(t('pages.fiscal.pointUpdated'))
    } else {
      setFiscalPoints((prev) => [...prev, { id: Date.now(), tenant_id: 1, number: parseInt(pointNumber, 10) || 1, type: pointType, cuit: pointCuit, business_name: pointBusinessName, iva_condition: pointIvaCondition, is_active: true }])
      toast.success(t('pages.fiscal.pointCreated'))
    }
    setShowPointModal(false)
    setEditingPoint(null)
    resetPointForm()
  }, [editingPoint, pointNumber, pointType, pointCuit, pointBusinessName, pointIvaCondition, resetPointForm])

  const openEditPoint = useCallback((point: FiscalPoint) => {
    setEditingPoint(point)
    setPointNumber(String(point.number))
    setPointType(point.type)
    setPointCuit(point.cuit)
    setPointBusinessName(point.business_name)
    setPointIvaCondition(point.iva_condition)
    setShowPointModal(true)
  }, [])

  const handleDeletePoint = useCallback((id: number) => {
    setFiscalPoints((prev) => prev.filter((p) => p.id !== id))
    toast.success(t('pages.fiscal.pointDeleted'))
  }, [])

  const handleGenerateIVAReport = useCallback(() => {
    const year = parseInt(reportYear, 10)
    const month = parseInt(reportMonth, 10)
    const monthInvoices = invoices.filter((inv) => {
      const d = new Date(inv.date)
      return d.getFullYear() === year && d.getMonth() + 1 === month && inv.status === 'AUTHORIZED'
    })
    const byType = new Map<string, { count: number; net_cents: number; iva_cents: number; total_cents: number }>()
    for (const inv of monthInvoices) {
      const e = byType.get(inv.type) || { count: 0, net_cents: 0, iva_cents: 0, total_cents: 0 }
      e.count += 1; e.net_cents += inv.net_amount_cents; e.iva_cents += inv.iva_amount_cents; e.total_cents += inv.total_amount_cents
      byType.set(inv.type, e)
    }
    const arr = Array.from(byType.entries()).map(([type, data]) => ({ type, ...data }))
    setIvaReport({ year, month, by_type: arr, total_net_cents: arr.reduce((s, r) => s + r.net_cents, 0), total_iva_cents: arr.reduce((s, r) => s + r.iva_cents, 0), total_cents: arr.reduce((s, r) => s + r.total_cents, 0) })
  }, [reportYear, reportMonth, invoices])

  const invoiceTypeOptions = [{ value: '', label: t('pages.fiscal.allTypes') }, { value: 'A', label: t('pages.fiscal.invoiceA') }, { value: 'B', label: t('pages.fiscal.invoiceB') }, { value: 'C', label: t('pages.fiscal.invoiceC') }]
  const statusOptions = [{ value: '', label: t('pages.fiscal.allStatuses') }, { value: 'AUTHORIZED', label: t('pages.fiscal.statusAuthorized') }, { value: 'DRAFT', label: t('pages.fiscal.statusDraft') }, { value: 'REJECTED', label: t('pages.fiscal.statusRejected') }, { value: 'VOIDED', label: t('pages.fiscal.statusVoided') }]
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2024, i).toLocaleString('es-AR', { month: 'long' }) }))

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.fiscal.title')} description={t('pages.fiscal.selectBranchDesc')}>
        <Card>
          <div className="text-center py-12 text-[var(--text-muted)]">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
            <p className="text-lg">{t('pages.fiscal.selectBranchMessage')}</p>
          </div>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('pages.fiscal.title')} description={t('pages.fiscal.description')}>
      <div className="flex gap-2 mb-6" role="tablist">
        {([{ key: 'invoices' as TabKey, label: t('pages.fiscal.tabInvoices') }, { key: 'points' as TabKey, label: t('pages.fiscal.tabPoints') }, { key: 'credit-notes' as TabKey, label: t('pages.fiscal.tabCreditNotes') }, { key: 'iva-report' as TabKey, label: t('pages.fiscal.tabIvaReport') }]).map((tab) => (
          <button key={tab.key} role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-orange-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'invoices' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.fiscal.invoices')}</h3>
            <Button variant="primary" size="sm" onClick={() => setShowInvoiceModal(true)} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>{t('pages.fiscal.issueInvoice')}</Button>
          </div>
          <div className="flex gap-4 mb-4">
            <div className="w-48"><Select id="filter-type" label={t('pages.fiscal.typeCol')} options={invoiceTypeOptions} value={filterType} onChange={(e) => setFilterType(e.target.value)} /></div>
            <div className="w-48"><Select id="filter-status" label={t('pages.fiscal.invoiceStatus')} options={statusOptions} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} /></div>
          </div>
          {filteredInvoices.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.fiscal.noInvoices')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.fiscal.invoiceTableLabel')}>
                <thead><tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceNumber')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.typeCol')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceDate')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceAmount')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceCae')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceStatus')}</th>
                </tr></thead>
                <tbody>
                  {filteredInvoices.map((inv) => {
                    const cfg = STATUS_CONFIG[inv.status] || { label: inv.status, variant: 'default' as const }
                    return (
                      <tr key={inv.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                        <td className="py-2 px-3 font-mono text-[var(--text-primary)]">{inv.number}</td>
                        <td className="py-2 px-3 text-center"><Badge variant="default">{inv.type}</Badge></td>
                        <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDate(inv.date)}</td>
                        <td className="py-2 px-3 text-right font-medium text-[var(--text-primary)]">{formatCurrency(inv.total_amount_cents)}</td>
                        <td className="py-2 px-3 text-[var(--text-muted)] font-mono text-xs">{inv.cae || '-'}</td>
                        <td className="py-2 px-3 text-center"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'points' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.fiscal.salesPoints')}</h3>
            <Button variant="primary" size="sm" onClick={() => { setEditingPoint(null); resetPointForm(); setShowPointModal(true) }} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>{t('pages.fiscal.addPoint')}</Button>
          </div>
          {fiscalPoints.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.fiscal.noPoints')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.fiscal.pointsTableLabel')}>
                <thead><tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceNumber')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.typeCol')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.pointCuit')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.pointBusinessName')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.pointIvaCondition')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.actionsCol')}</th>
                </tr></thead>
                <tbody>
                  {fiscalPoints.map((pt) => (
                    <tr key={pt.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 font-mono text-[var(--text-primary)]">{String(pt.number).padStart(4, '0')}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{pt.type}</td>
                      <td className="py-2 px-3 font-mono text-[var(--text-primary)]">{pt.cuit}</td>
                      <td className="py-2 px-3 text-[var(--text-primary)]">{pt.business_name}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{IVA_CONDITIONS.find((c) => c.value === pt.iva_condition)?.label || pt.iva_condition}</td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => openEditPoint(pt)} aria-label={`Editar punto ${pt.number}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeletePoint(pt.id)} aria-label={`Eliminar punto ${pt.number}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
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

      {activeTab === 'credit-notes' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.fiscal.creditNotes')}</h3>
          {creditNotes.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.fiscal.noCreditNotes')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.fiscal.creditNotesTableLabel')}>
                <thead><tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceNumber')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.originalInvoice')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceDate')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceAmount')}</th>
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.creditNoteReason')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.invoiceStatus')}</th>
                </tr></thead>
                <tbody>
                  {creditNotes.map((cn) => (
                    <tr key={cn.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 font-mono text-[var(--text-primary)]">{cn.number}</td>
                      <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">{cn.invoice_number}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDate(cn.date)}</td>
                      <td className="py-2 px-3 text-right font-medium text-red-400">-{formatCurrency(cn.amount_cents)}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{cn.reason}</td>
                      <td className="py-2 px-3 text-center"><Badge variant="default">{cn.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'iva-report' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
              IVA Ventas Mensual
            </h3>
            <div className="flex gap-4 items-end">
              <div className="w-32">
                <label htmlFor="iva-year" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.year')}</label>
                <input id="iva-year" type="number" min="2020" max="2030" value={reportYear} onChange={(e) => setReportYear(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div className="w-48"><Select id="iva-month" label={t('pages.fiscal.month')} options={monthOptions} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></div>
              <Button variant="primary" size="sm" onClick={handleGenerateIVAReport}>{t('pages.fiscal.generateReport')}</Button>
            </div>
          </Card>
          {ivaReport && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.fiscal.netTaxable')}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(ivaReport.total_net_cents)}</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.fiscal.iva')}</p><p className="text-2xl font-bold text-blue-400">{formatCurrency(ivaReport.total_iva_cents)}</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.fiscal.total')}</p><p className="text-2xl font-bold text-green-400">{formatCurrency(ivaReport.total_cents)}</p></Card>
              </div>
              <Card className="p-6">
                <h4 className="text-md font-semibold text-[var(--text-primary)] mb-3">{t('pages.fiscal.detailByInvoiceType')}</h4>
                {ivaReport.by_type.length === 0 ? <p className="text-[var(--text-muted)] text-sm">{t('pages.fiscal.noInvoicesInPeriod')}</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border-default)]">
                        <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.typeCol')}</th>
                        <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.quantityCol')}</th>
                        <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.netCol')}</th>
                        <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.iva')}</th>
                        <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.fiscal.total')}</th>
                      </tr></thead>
                      <tbody>{ivaReport.by_type.map((r) => (
                        <tr key={r.type} className="border-b border-[var(--border-default)]">
                          <td className="py-2 px-3 text-[var(--text-primary)]">{t('pages.fiscal.typeCol')} {r.type}</td>
                          <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{r.count}</td>
                          <td className="py-2 px-3 text-right text-[var(--text-primary)]">{formatCurrency(r.net_cents)}</td>
                          <td className="py-2 px-3 text-right text-blue-400">{formatCurrency(r.iva_cents)}</td>
                          <td className="py-2 px-3 text-right font-medium text-green-400">{formatCurrency(r.total_cents)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modal: Emitir Factura */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInvoiceModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.fiscal.issueInvoice')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="inv-check" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.checkId')}</label>
                <input id="inv-check" type="number" value={invoiceCheckId} onChange={(e) => setInvoiceCheckId(e.target.value)} placeholder="Ej: 42" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Select id="inv-type" label={t('pages.fiscal.invoiceTypeLabel')} options={[{ value: 'A', label: t('pages.fiscal.invoiceA') }, { value: 'B', label: t('pages.fiscal.invoiceB') }, { value: 'C', label: t('pages.fiscal.invoiceC') }]} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} />
              <div>
                <label htmlFor="inv-doc" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.customerDocument')}</label>
                <input id="inv-doc" type="text" value={invoiceCustomerDoc} onChange={(e) => setInvoiceCustomerDoc(e.target.value)} placeholder="CUIT/CUIL/DNI" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowInvoiceModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleCreateInvoice}>{t('pages.fiscal.issue')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Punto de Venta */}
      {showPointModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPointModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingPoint ? t('pages.fiscal.editPoint') : t('pages.fiscal.newPoint')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="pt-num" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.invoiceNumber')}</label>
                <input id="pt-num" type="number" min="1" value={pointNumber} onChange={(e) => setPointNumber(e.target.value)} placeholder="Ej: 1" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Select id="pt-type" label={t('pages.fiscal.typeCol')} options={[{ value: 'ELECTRONIC', label: t('pages.fiscal.typeElectronic') }, { value: 'FISCAL_PRINTER', label: t('pages.fiscal.typeFiscalPrinter') }]} value={pointType} onChange={(e) => setPointType(e.target.value)} />
              <div>
                <label htmlFor="pt-cuit" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.pointCuit')}</label>
                <input id="pt-cuit" type="text" value={pointCuit} onChange={(e) => setPointCuit(e.target.value)} placeholder="Ej: 20-12345678-9" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="pt-biz" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.fiscal.pointBusinessName')}</label>
                <input id="pt-biz" type="text" value={pointBusinessName} onChange={(e) => setPointBusinessName(e.target.value)} placeholder="Nombre del negocio" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Select id="pt-iva" label={t('pages.fiscal.pointIvaCondition')} options={IVA_CONDITIONS} value={pointIvaCondition} onChange={(e) => setPointIvaCondition(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowPointModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSavePoint}>{editingPoint ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default FiscalPage
