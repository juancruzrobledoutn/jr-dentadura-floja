import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, DollarSign, Pencil, Trash2, PlayCircle, StopCircle, Copy } from 'lucide-react'
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

interface Shift {
  id: number
  branch_id: number
  user_name: string
  day: string
  start_time: string
  end_time: string
  role: string
}

interface ShiftTemplate {
  id: number
  name: string
  items: { day_of_week: number; start_time: string; end_time: string; role: string; min_staff: number }[]
  is_active: boolean
}

interface AttendanceRecord {
  id: number
  user_name: string
  clock_in: string
  clock_out: string | null
  total_hours: number | null
  overtime_hours: number | null
}

interface LaborCostReport {
  total_hours: number
  total_overtime: number
  by_role: { role: string; hours: number; overtime: number }[]
  estimated_cost_cents: number
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100)
}

// DAY_NAMES moved to component
// ROLE_LABELS moved to component

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

type TabKey = 'week' | 'templates' | 'attendance' | 'costs'

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function SchedulingPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.scheduling.title'))

  const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
  const ROLE_LABELS: Record<string, string> = {
    WAITER: t('pages.scheduling.roleWaiter'),
    KITCHEN: t('pages.scheduling.roleKitchen'),
    MANAGER: t('pages.scheduling.roleManager'),
    ADMIN: t('pages.scheduling.roleAdmin'),
    CASHIER: t('pages.scheduling.roleCashier'),
  }

  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [activeTab, setActiveTab] = useState<TabKey>('week')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [laborReport, setLaborReport] = useState<LaborCostReport | null>(null)

  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()))
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  // Shift modal
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [shiftUserName, setShiftUserName] = useState('')
  const [shiftDay, setShiftDay] = useState('')
  const [shiftStart, setShiftStart] = useState('09:00')
  const [shiftEnd, setShiftEnd] = useState('17:00')
  const [shiftRole, setShiftRole] = useState('WAITER')

  // Template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null)
  const [templateName, setTemplateName] = useState('')

  // Apply template modal
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [applyTemplateId, setApplyTemplateId] = useState('')
  const [applyWeekStart, setApplyWeekStart] = useState('')

  // Cost report
  const [costFrom, setCostFrom] = useState('')
  const [costTo, setCostTo] = useState('')

  const employeeNames = useMemo(() => Array.from(new Set(shifts.map((s) => s.user_name))).sort(), [shifts])

  const weekShifts = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const s of shifts) {
      if (weekDates.includes(s.day)) {
        const key = `${s.user_name}-${s.day}`
        const existing = map.get(key) || []
        existing.push(s)
        map.set(key, existing)
      }
    }
    return map
  }, [shifts, weekDates])

  const handleSaveShift = useCallback(() => {
    if (!shiftUserName.trim() || !shiftDay) { toast.error(t('pages.scheduling.employeeNameAndDayRequired')); return }
    if (editingShift) {
      setShifts((prev) => prev.map((s) => s.id === editingShift.id ? { ...s, user_name: shiftUserName, day: shiftDay, start_time: shiftStart, end_time: shiftEnd, role: shiftRole } : s))
      toast.success(t('pages.scheduling.shiftUpdated'))
    } else {
      setShifts((prev) => [...prev, { id: Date.now(), branch_id: parseInt(selectedBranchId || '0', 10), user_name: shiftUserName, day: shiftDay, start_time: shiftStart, end_time: shiftEnd, role: shiftRole }])
      toast.success(t('pages.scheduling.shiftCreated'))
    }
    setShowShiftModal(false)
    setEditingShift(null)
    setShiftUserName('')
    setShiftDay('')
    setShiftStart('09:00')
    setShiftEnd('17:00')
    setShiftRole('WAITER')
  }, [editingShift, shiftUserName, shiftDay, shiftStart, shiftEnd, shiftRole, selectedBranchId])

  const openCellShift = useCallback((day: string) => {
    setEditingShift(null)
    setShiftDay(day)
    setShiftUserName('')
    setShiftStart('09:00')
    setShiftEnd('17:00')
    setShiftRole('WAITER')
    setShowShiftModal(true)
  }, [])

  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim()) { toast.error(t('pages.scheduling.templateNameRequired')); return }
    if (editingTemplate) {
      setTemplates((prev) => prev.map((tmpl) => tmpl.id === editingTemplate.id ? { ...tmpl, name: templateName } : tmpl))
      toast.success(t('pages.scheduling.templateUpdated'))
    } else {
      setTemplates((prev) => [...prev, { id: Date.now(), name: templateName, items: [], is_active: true }])
      toast.success(t('pages.scheduling.templateCreated'))
    }
    setShowTemplateModal(false)
    setEditingTemplate(null)
    setTemplateName('')
  }, [templateName, editingTemplate, t])

  const handleDeleteTemplate = useCallback((id: number) => {
    setTemplates((prev) => prev.filter((tmpl) => tmpl.id !== id))
    toast.success(t('pages.scheduling.templateDeleted'))
  }, [t])

  const handleApplyTemplate = useCallback(() => {
    if (!applyTemplateId || !applyWeekStart) { toast.error(t('pages.scheduling.selectTemplateAndWeek')); return }
    toast.success(t('pages.scheduling.templateApplied'))
    setShowApplyModal(false)
    setApplyTemplateId('')
    setApplyWeekStart('')
  }, [applyTemplateId, applyWeekStart])

  const handleClockIn = useCallback(() => {
    setAttendance((prev) => [{ id: Date.now(), user_name: 'Usuario Actual', clock_in: new Date().toISOString(), clock_out: null, total_hours: null, overtime_hours: null }, ...prev])
    toast.success(t('pages.scheduling.clockedIn'))
  }, [])

  const handleClockOut = useCallback(() => {
    setAttendance((prev) => {
      const open = prev.find((r) => r.clock_out === null)
      if (!open) { toast.error(t('pages.scheduling.noOpenClockIn')); return prev }
      const now = new Date()
      const hours = (now.getTime() - new Date(open.clock_in).getTime()) / (1000 * 60 * 60)
      return prev.map((r) => r.id === open.id ? { ...r, clock_out: now.toISOString(), total_hours: Math.round(hours * 100) / 100, overtime_hours: Math.round(Math.max(0, hours - 8) * 100) / 100 } : r)
    })
    toast.success(t('pages.scheduling.clockedOut'))
  }, [])

  const handleGenerateLaborCost = useCallback(() => {
    if (!costFrom || !costTo) { toast.error(t('pages.scheduling.selectDateRange')); return }
    const from = new Date(costFrom)
    const to = new Date(costTo)
    const filtered = attendance.filter((r) => { const d = new Date(r.clock_in); return d >= from && d <= to && r.total_hours !== null })
    let totalH = 0, totalOT = 0
    for (const r of filtered) { totalH += r.total_hours || 0; totalOT += r.overtime_hours || 0 }
    setLaborReport({ total_hours: Math.round(totalH * 100) / 100, total_overtime: Math.round(totalOT * 100) / 100, by_role: [{ role: 'GENERAL', hours: Math.round(totalH * 100) / 100, overtime: Math.round(totalOT * 100) / 100 }], estimated_cost_cents: Math.round(totalH * 1500 * 100) })
  }, [costFrom, costTo, attendance])

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
  const templateOptions = useMemo(() => templates.map((tmpl) => ({ value: String(tmpl.id), label: tmpl.name })), [templates])

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.scheduling.title')} description={t('pages.scheduling.description')}>
        <Card>
          <div className="text-center py-12 text-[var(--text-muted)]">
            <CalendarDays className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
            <p className="text-lg">{t('pages.scheduling.selectBranchMessage')}</p>
          </div>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('pages.scheduling.title')} description={t('pages.scheduling.descriptionFull')}>
      <div className="flex gap-2 mb-6" role="tablist">
        {([{ key: 'week' as TabKey, label: t('pages.scheduling.tabWeek') }, { key: 'templates' as TabKey, label: t('pages.scheduling.tabTemplates') }, { key: 'attendance' as TabKey, label: t('pages.scheduling.tabAttendance') }, { key: 'costs' as TabKey, label: t('pages.scheduling.tabCosts') }]).map((tab) => (
          <button key={tab.key} role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-orange-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>{tab.label}</button>
        ))}
      </div>

      {/* Tab: Semana */}
      {activeTab === 'week' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label htmlFor="week-start" className="text-sm font-medium text-[var(--text-secondary)]">{t('pages.scheduling.weekOf')}</label>
                <input id="week-start" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowApplyModal(true)} leftIcon={<Copy className="w-4 h-4" aria-hidden="true" />}>{t('pages.scheduling.applyTemplate')}</Button>
            </div>
          </Card>
          <Card className="p-4 overflow-x-auto">
            <table className="w-full text-sm" aria-label={t('pages.scheduling.weeklyGridLabel')}>
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium w-40">{t('pages.scheduling.employee')}</th>
                  {weekDates.map((date, i) => (
                    <th key={date} className="text-center py-2 px-2 text-[var(--text-tertiary)] font-medium">
                      <div>{DAY_NAMES[i]}</div><div className="text-xs">{date.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeNames.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[var(--text-muted)]">{t('pages.scheduling.noShifts')}</td></tr>
                ) : employeeNames.map((name) => (
                  <tr key={name} className="border-b border-[var(--border-default)]">
                    <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{name}</td>
                    {weekDates.map((date) => {
                      const cellShifts = weekShifts.get(`${name}-${date}`) || []
                      return (
                        <td key={date} className="py-1 px-1 text-center cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors" onClick={() => openCellShift(date)}>
                          {cellShifts.map((s) => (
                            <div key={s.id} className="text-xs bg-[var(--primary-500)]/20 text-[var(--primary-600)] rounded px-1 py-0.5 mb-0.5">
                              {s.start_time}-{s.end_time}
                              <span className="block text-[10px] opacity-70">{ROLE_LABELS[s.role] || s.role}</span>
                            </div>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="py-2 px-3 text-[var(--text-muted)] text-xs">{t('pages.scheduling.newShift')}</td>
                  {weekDates.map((date) => (
                    <td key={date} className="py-1 px-1 text-center cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors" onClick={() => openCellShift(date)}>
                      <Plus className="w-4 h-4 mx-auto text-[var(--text-muted)] opacity-30" aria-hidden="true" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Tab: Plantillas */}
      {activeTab === 'templates' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('pages.scheduling.shiftTemplates')}</h3>
            <Button variant="primary" size="sm" onClick={() => { setEditingTemplate(null); setTemplateName(''); setShowTemplateModal(true) }} leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}>{t('pages.scheduling.createTemplate')}</Button>
          </div>
          {templates.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.scheduling.noTemplates')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('pages.scheduling.templatesTableLabel')}>
                <thead><tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.employee')}</th>
                  <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.items')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('common.status')}</th>
                  <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.actionsCol')}</th>
                </tr></thead>
                <tbody>{templates.map((tmpl) => (
                  <tr key={tmpl.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                    <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{tmpl.name}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{tmpl.items.length}</td>
                    <td className="py-2 px-3 text-center"><Badge variant={tmpl.is_active ? 'success' : 'default'}>{tmpl.is_active ? t('pages.scheduling.statusActive') : t('pages.scheduling.statusInactive')}</Badge></td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => { setEditingTemplate(tmpl); setTemplateName(tmpl.name); setShowTemplateModal(true) }} aria-label={`${t('common.edit')} ${tmpl.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteTemplate(tmpl.id)} aria-label={`${t('common.delete')} ${tmpl.name}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Asistencia */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-3">
              <Button variant="primary" size="sm" onClick={handleClockIn} leftIcon={<PlayCircle className="w-4 h-4" aria-hidden="true" />}>{t('pages.scheduling.clockIn')}</Button>
              <Button variant="secondary" size="sm" onClick={handleClockOut} leftIcon={<StopCircle className="w-4 h-4" aria-hidden="true" />}>{t('pages.scheduling.clockOut')}</Button>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.scheduling.attendanceLog')}</h3>
            {attendance.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm py-8 text-center">{t('pages.scheduling.noAttendance')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label={t('pages.scheduling.attendanceTableLabel')}>
                  <thead><tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.employee')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.entryCol')}</th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.exitCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.hoursCol')}</th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.overtimeCol')}</th>
                  </tr></thead>
                  <tbody>{attendance.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{r.user_name}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDateTime(r.clock_in)}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{formatDateTime(r.clock_out)}</td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">{r.total_hours != null ? `${r.total_hours}h` : '-'}</td>
                      <td className="py-2 px-3 text-right">{r.overtime_hours != null && r.overtime_hours > 0 ? <span className="text-yellow-400">{r.overtime_hours}h</span> : <span className="text-[var(--text-muted)]">-</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab: Costos */}
      {activeTab === 'costs' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
              {t('pages.scheduling.laborCosts')}
            </h3>
            <div className="flex gap-4 items-end">
              <div>
                <label htmlFor="cost-from" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.from')}</label>
                <input id="cost-from" type="date" value={costFrom} onChange={(e) => setCostFrom(e.target.value)} className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="cost-to" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.to')}</label>
                <input id="cost-to" type="date" value={costTo} onChange={(e) => setCostTo(e.target.value)} className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <Button variant="primary" size="sm" onClick={handleGenerateLaborCost}>{t('pages.scheduling.calculate')}</Button>
            </div>
          </Card>
          {laborReport && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.scheduling.totalHours')}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{laborReport.total_hours}h</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.scheduling.overtimeCol')}</p><p className="text-2xl font-bold text-yellow-400">{laborReport.total_overtime}h</p></Card>
                <Card className="p-4"><p className="text-[var(--text-tertiary)] text-sm">{t('pages.scheduling.estimatedCost')}</p><p className="text-2xl font-bold text-green-400">{formatCurrency(laborReport.estimated_cost_cents)}</p></Card>
              </div>
              <Card className="p-6">
                <h4 className="text-md font-semibold text-[var(--text-primary)] mb-3">{t('pages.scheduling.byRole')}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-[var(--border-default)]">
                      <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.roleCol')}</th>
                      <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.hoursCol')}</th>
                      <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">{t('pages.scheduling.overtimeCol')}</th>
                    </tr></thead>
                    <tbody>{laborReport.by_role.map((r) => (
                      <tr key={r.role} className="border-b border-[var(--border-default)]">
                        <td className="py-2 px-3 text-[var(--text-primary)]">{ROLE_LABELS[r.role] || r.role}</td>
                        <td className="py-2 px-3 text-right text-[var(--text-primary)]">{r.hours}h</td>
                        <td className="py-2 px-3 text-right text-yellow-400">{r.overtime}h</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modal: Turno */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowShiftModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingShift ? t('pages.scheduling.editShift') : t('pages.scheduling.newShiftTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="shift-emp" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.employee')}</label>
                <input id="shift-emp" type="text" value={shiftUserName} onChange={(e) => setShiftUserName(e.target.value)} placeholder="Nombre del empleado" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div>
                <label htmlFor="shift-day" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.day')}</label>
                <input id="shift-day" type="date" value={shiftDay} onChange={(e) => setShiftDay(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="shift-start" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.entryCol')}</label>
                  <input id="shift-start" type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
                <div>
                  <label htmlFor="shift-end" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.exitCol')}</label>
                  <input id="shift-end" type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
                </div>
              </div>
              <Select id="shift-role" label={t('pages.scheduling.role')} options={roleOptions} value={shiftRole} onChange={(e) => setShiftRole(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowShiftModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSaveShift}>{editingShift ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Plantilla */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTemplateModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{editingTemplate ? t('pages.scheduling.editTemplate') : t('pages.scheduling.newTemplateTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="tmpl-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.employee')}</label>
                <input id="tmpl-name" type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Ej: Turno Fin de Semana" className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleSaveTemplate}>{editingTemplate ? t('common.save') : t('common.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aplicar Plantilla */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowApplyModal(false)} />
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl p-6 w-full max-w-md border border-[var(--border-default)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('pages.scheduling.applyTemplate')}</h3>
            <div className="space-y-4">
              <Select id="apply-tmpl" label={t('pages.scheduling.template')} options={templateOptions} value={applyTemplateId} onChange={(e) => setApplyTemplateId(e.target.value)} />
              <div>
                <label htmlFor="apply-week" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('pages.scheduling.weekOf')}</label>
                <input id="apply-week" type="date" value={applyWeekStart} onChange={(e) => setApplyWeekStart(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowApplyModal(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleApplyTemplate}>{t('pages.scheduling.apply')}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default SchedulingPage
