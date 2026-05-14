import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Button, Select } from '../components/ui'
import {
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
} from 'lucide-react'
import { useBranchStore, selectBranches, selectSelectedBranchId } from '../stores/branchStore'
import { handleError } from '../utils/logger'
import { toast } from '../stores/toastStore'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface CashSessionData {
  id: number
  cash_register_id: number
  status: string
  opened_at: string
  opening_amount_cents: number
  opened_by_id: number
}

interface CashMovementData {
  id: number
  movement_type: string
  amount_cents: number
  payment_method: string
  description: string | null
  created_at: string | null
}

interface SessionSummary {
  session_id: number
  status: string
  opened_at: string | null
  closed_at: string | null
  opening_amount_cents: number
  expected_amount_cents: number | null
  actual_amount_cents: number | null
  difference_cents: number | null
  notes: string | null
  totals_by_method: Record<string, number>
  totals_by_type: Record<string, number>
  movements: CashMovementData[]
  movement_count: number
}

interface SessionHistory {
  id: number
  status: string
  opened_at: string | null
  closed_at: string | null
  opening_amount_cents: number
  expected_amount_cents: number | null
  actual_amount_cents: number | null
  difference_cents: number | null
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

function getMovementTypeLabels(t: (key: string) => string): Record<string, string> {
  return {
    SALE: t('pages.cashRegister.movementTypes.SALE'),
    REFUND: t('pages.cashRegister.movementTypes.REFUND'),
    EXPENSE: t('pages.cashRegister.movementTypes.EXPENSE'),
    DEPOSIT: t('pages.cashRegister.movementTypes.DEPOSIT'),
    WITHDRAWAL: t('pages.cashRegister.movementTypes.WITHDRAWAL'),
    TIP_IN: t('pages.cashRegister.movementTypes.TIP_IN'),
  }
}

function getCashPaymentMethodLabels(t: (key: string) => string): Record<string, string> {
  return {
    CASH: t('pages.cashRegister.paymentMethods.CASH'),
    CARD: t('pages.cashRegister.paymentMethods.CARD'),
    TRANSFER: t('pages.cashRegister.paymentMethods.TRANSFER'),
    MERCADOPAGO: t('pages.cashRegister.paymentMethods.MERCADOPAGO'),
  }
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function CashRegisterPage() {
  const { t } = useTranslation()
  const MOVEMENT_TYPE_LABELS = getMovementTypeLabels(t)
  const PAYMENT_METHOD_LABELS = getCashPaymentMethodLabels(t)
  useDocumentTitle(t('pages.cashRegister.title'))

  const branches = useBranchStore(selectBranches)
  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [branchFilter, setBranchFilter] = useState<string>(selectedBranchId || '')
  const [currentSession, setCurrentSession] = useState<CashSessionData | null>(null)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Open session form
  const [openingAmount, setOpeningAmount] = useState<string>('')

  // Add movement form
  const [movementType, setMovementType] = useState<string>('SALE')
  const [movementAmount, setMovementAmount] = useState<string>('')
  const [movementMethod, setMovementMethod] = useState<string>('CASH')
  const [movementDescription, setMovementDescription] = useState<string>('')

  // Close session form
  const [actualAmount, setActualAmount] = useState<string>('')
  const [closeNotes, setCloseNotes] = useState<string>('')
  const [showCloseForm, setShowCloseForm] = useState(false)

  // View state
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')

  // Branch options
  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: b.id, label: b.name })),
    [branches]
  )

  // NOTE: In a real implementation, these would call the API.
  // For now, this is a UI scaffold that shows the full workflow.

  const handleOpenSession = useCallback(() => {
    const cents = Math.round(parseFloat(openingAmount || '0') * 100)
    if (cents < 0) {
      toast.error(t('pages.cashRegister.negativeAmount'))
      return
    }

    // Simulated session open
    const session: CashSessionData = {
      id: Date.now(),
      cash_register_id: 1,
      status: 'OPEN',
      opened_at: new Date().toISOString(),
      opening_amount_cents: cents,
      opened_by_id: 1,
    }
    setCurrentSession(session)
    setSessionSummary({
      session_id: session.id,
      status: 'OPEN',
      opened_at: session.opened_at,
      closed_at: null,
      opening_amount_cents: cents,
      expected_amount_cents: null,
      actual_amount_cents: null,
      difference_cents: null,
      notes: null,
      totals_by_method: {},
      totals_by_type: {},
      movements: [],
      movement_count: 0,
    })
    setOpeningAmount('')
    toast.success(t('pages.cashRegister.cashOpened'))
  }, [openingAmount])

  const handleAddMovement = useCallback(() => {
    if (!sessionSummary) return

    const cents = Math.round(parseFloat(movementAmount || '0') * 100)
    if (cents === 0) {
      toast.error(t('pages.cashRegister.invalidAmount'))
      return
    }

    // For expenses/withdrawals/refunds, amount should be negative
    const signedAmount =
      movementType === 'EXPENSE' || movementType === 'WITHDRAWAL' || movementType === 'REFUND'
        ? -Math.abs(cents)
        : Math.abs(cents)

    const movement: CashMovementData = {
      id: Date.now(),
      movement_type: movementType,
      amount_cents: signedAmount,
      payment_method: movementMethod,
      description: movementDescription || null,
      created_at: new Date().toISOString(),
    }

    setSessionSummary((prev) => {
      if (!prev) return prev
      const newMovements = [...prev.movements, movement]
      const newTotalsByMethod = { ...prev.totals_by_method }
      newTotalsByMethod[movementMethod] =
        (newTotalsByMethod[movementMethod] || 0) + signedAmount
      const newTotalsByType = { ...prev.totals_by_type }
      newTotalsByType[movementType] = (newTotalsByType[movementType] || 0) + signedAmount

      return {
        ...prev,
        movements: newMovements,
        movement_count: newMovements.length,
        totals_by_method: newTotalsByMethod,
        totals_by_type: newTotalsByType,
      }
    })

    setMovementAmount('')
    setMovementDescription('')
    toast.success(t('pages.cashRegister.movementRecorded'))
  }, [sessionSummary, movementType, movementAmount, movementMethod, movementDescription])

  const handleCloseSession = useCallback(() => {
    if (!sessionSummary || !currentSession) return

    const actualCents = Math.round(parseFloat(actualAmount || '0') * 100)
    if (actualCents < 0) {
      toast.error(t('pages.cashRegister.negativeActual'))
      return
    }

    // Calculate expected from opening + cash movements
    const cashTotal = sessionSummary.movements
      .filter((m) => m.payment_method === 'CASH')
      .reduce((sum, m) => sum + m.amount_cents, 0)
    const expected = currentSession.opening_amount_cents + cashTotal
    const difference = actualCents - expected

    // Add to history
    const historyEntry: SessionHistory = {
      id: currentSession.id,
      status: 'CLOSED',
      opened_at: currentSession.opened_at,
      closed_at: new Date().toISOString(),
      opening_amount_cents: currentSession.opening_amount_cents,
      expected_amount_cents: expected,
      actual_amount_cents: actualCents,
      difference_cents: difference,
    }

    setSessionHistory((prev) => [historyEntry, ...prev])
    setCurrentSession(null)
    setSessionSummary(null)
    setActualAmount('')
    setCloseNotes('')
    setShowCloseForm(false)
    toast.success(t('pages.cashRegister.cashClosed'))
  }, [sessionSummary, currentSession, actualAmount, closeNotes])

  // Movement type options
  const movementTypeOptions = Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }))

  const paymentMethodOptions = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
    value,
    label,
  }))

  return (
    <PageContainer
      title={t('pages.cashRegister.title')}
      description={t('pages.cashRegister.description')}
    >
      {/* Branch filter */}
      <div className="flex gap-4 mb-6">
        <div className="w-64">
          <Select
            id="cash-branch-filter"
            label={t('forms.labels.branch')}
            options={branchOptions}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-end">
          <Button
            variant={activeTab === 'current' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('current')}
          >
            Sesion Actual
          </Button>
          <Button
            variant={activeTab === 'history' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('history')}
          >
            Historial
          </Button>
        </div>
      </div>

      {activeTab === 'current' && (
        <>
          {/* No open session - show open form */}
          {!currentSession && (
            <Card className="p-6 max-w-lg">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
                Abrir Caja
              </h3>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="opening-amount"
                    className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                  >
                    Monto de apertura ($)
                  </label>
                  <input
                    id="opening-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                  />
                </div>
                <Button onClick={handleOpenSession} variant="primary">
                  Abrir Caja
                </Button>
              </div>
            </Card>
          )}

          {/* Open session - show movements and controls */}
          {currentSession && sessionSummary && (
            <div className="space-y-6">
              {/* Session info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-[var(--text-tertiary)] text-sm">{t('common.status')}</p>
                      <p className="text-lg font-bold text-green-400">{t('pages.cashRegister.openedStatus')}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--primary-500)]/10 rounded-lg">
                      <DollarSign className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-[var(--text-tertiary)] text-sm">{t('pages.cashRegister.opening')}</p>
                      <p className="text-lg font-bold text-[var(--text-primary)]">
                        {formatCurrency(currentSession.opening_amount_cents)}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-500" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-[var(--text-tertiary)] text-sm">{t('pages.cashRegister.openedSince')}</p>
                      <p className="text-lg font-bold text-[var(--text-primary)]">
                        {formatDateTime(currentSession.opened_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Add movement form */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
                  Registrar Movimiento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Select
                    id="movement-type"
                    label={t('pages.cashRegister.typeLabel')}
                    options={movementTypeOptions}
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value)}
                  />
                  <div>
                    <label
                      htmlFor="movement-amount"
                      className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                    >
                      Monto ($)
                    </label>
                    <input
                      id="movement-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementAmount}
                      onChange={(e) => setMovementAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                    />
                  </div>
                  <Select
                    id="movement-method"
                    label={t('pages.cashRegister.paymentMethodLabel')}
                    options={paymentMethodOptions}
                    value={movementMethod}
                    onChange={(e) => setMovementMethod(e.target.value)}
                  />
                  <div>
                    <label
                      htmlFor="movement-desc"
                      className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                    >
                      Descripcion
                    </label>
                    <input
                      id="movement-desc"
                      type="text"
                      value={movementDescription}
                      onChange={(e) => setMovementDescription(e.target.value)}
                      placeholder={t('common.optional')}
                      className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button onClick={handleAddMovement} variant="primary" size="sm">
                    Registrar
                  </Button>
                </div>
              </Card>

              {/* Movements table */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  {t('pages.cashRegister.movementsCount', { count: sessionSummary.movement_count })}
                </h3>
                {sessionSummary.movements.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm">{t('pages.cashRegister.noMovements')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-default)]">
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                            Hora
                          </th>
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                            Tipo
                          </th>
                          <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">
                            Monto
                          </th>
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                            Metodo
                          </th>
                          <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                            Descripcion
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionSummary.movements.map((m) => (
                          <tr
                            key={m.id}
                            className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]"
                          >
                            <td className="py-2 px-3 text-[var(--text-secondary)]">
                              {formatDateTime(m.created_at)}
                            </td>
                            <td className="py-2 px-3 text-[var(--text-primary)]">
                              {MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-medium ${m.amount_cents >= 0 ? 'text-green-400' : 'text-red-400'}`}
                            >
                              {m.amount_cents >= 0 ? '+' : ''}
                              {formatCurrency(m.amount_cents)}
                            </td>
                            <td className="py-2 px-3 text-[var(--text-secondary)]">
                              {PAYMENT_METHOD_LABELS[m.payment_method] || m.payment_method}
                            </td>
                            <td className="py-2 px-3 text-[var(--text-muted)]">
                              {m.description || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Totals by method */}
              {Object.keys(sessionSummary.totals_by_method).length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                    Totales por Metodo de Pago
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(sessionSummary.totals_by_method).map(([method, total]) => (
                      <div key={method} className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <p className="text-[var(--text-tertiary)] text-sm">
                          {PAYMENT_METHOD_LABELS[method] || method}
                        </p>
                        <p
                          className={`text-lg font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {formatCurrency(total)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Close session */}
              <Card className="p-6">
                {!showCloseForm ? (
                  <Button
                    onClick={() => setShowCloseForm(true)}
                    variant="danger"
                    leftIcon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
                  >
                    Cerrar Caja
                  </Button>
                ) : (
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" aria-hidden="true" />
                      Cerrar Caja
                    </h3>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label
                          htmlFor="actual-amount"
                          className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                        >
                          Monto real contado ($)
                        </label>
                        <input
                          id="actual-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={actualAmount}
                          onChange={(e) => setActualAmount(e.target.value)}
                          placeholder={t('pages.cashRegister.actualAmountPlaceholder')}
                          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="close-notes"
                          className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                        >
                          Notas (opcional)
                        </label>
                        <textarea
                          id="close-notes"
                          value={closeNotes}
                          onChange={(e) => setCloseNotes(e.target.value)}
                          placeholder={t('pages.cashRegister.closingNotesPlaceholder')}
                          rows={2}
                          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleCloseSession} variant="danger">
                          Confirmar Cierre
                        </Button>
                        <Button onClick={() => setShowCloseForm(false)} variant="secondary">
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Historial de Sesiones
          </h3>
          {sessionHistory.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">{t('pages.cashRegister.noClosedSessions')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Apertura
                    </th>
                    <th className="text-left py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Cierre
                    </th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Apertura ($)
                    </th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Esperado ($)
                    </th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Real ($)
                    </th>
                    <th className="text-right py-2 px-3 text-[var(--text-tertiary)] font-medium">
                      Diferencia
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessionHistory.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]"
                    >
                      <td className="py-2 px-3 text-[var(--text-secondary)]">
                        {formatDateTime(s.opened_at)}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">
                        {formatDateTime(s.closed_at)}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">
                        {formatCurrency(s.opening_amount_cents)}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">
                        {s.expected_amount_cents != null ? formatCurrency(s.expected_amount_cents) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-[var(--text-primary)]">
                        {s.actual_amount_cents != null ? formatCurrency(s.actual_amount_cents) : '-'}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-medium ${
                          s.difference_cents != null
                            ? s.difference_cents === 0
                              ? 'text-green-400'
                              : s.difference_cents > 0
                                ? 'text-blue-400'
                                : 'text-red-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {s.difference_cents != null ? (
                          <>
                            {s.difference_cents > 0 ? '+' : ''}
                            {formatCurrency(s.difference_cents)}
                          </>
                        ) : (
                          '-'
                        )}
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

export default CashRegisterPage
