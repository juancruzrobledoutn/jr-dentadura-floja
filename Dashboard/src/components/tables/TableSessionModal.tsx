/**
 * TableSessionModal - Modal showing current order/session details for a table
 * Displays diners, rounds with items, and check status
 */
import { useState, useEffect, useCallback } from 'react'
import { Users, Clock, ShoppingBag, CreditCard, Loader2, RefreshCw, AlertCircle, ChevronRight, Send } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { tableAPI, kitchenAPI, type TableSessionDetail, type RoundDetail, type RoundItemDetail } from '../../services/api'
import { toast } from '../../stores/toastStore'
import { useTableStore } from '../../stores/tableStore'
import type { RestaurantTable } from '../../types'

interface TableSessionModalProps {
  isOpen: boolean
  onClose: () => void
  table: RestaurantTable | null
}

// Format cents to currency
function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(cents / 100)
}

// Format datetime
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get badge variant for round status
// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
function getRoundStatusVariant(status: string): 'default' | 'warning' | 'info' | 'success' | 'danger' {
  switch (status) {
    case 'PENDING':      // Waiting for waiter to verify at table
      return 'danger'
    case 'CONFIRMED':    // Waiter verified, waiting for admin to send to kitchen
      return 'info'
    case 'SUBMITTED':    // Admin sent to kitchen "Nuevo"
      return 'warning'
    case 'IN_KITCHEN':
      return 'info'
    case 'READY':
      return 'success'
    case 'SERVED':
      return 'default'
    default:
      return 'default'
  }
}

// Get label for round status
// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
function getRoundStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':      // Waiting for waiter to verify at table
      return 'Pendiente'
    case 'CONFIRMED':    // Waiter verified, waiting for admin to send to kitchen
      return 'Confirmado'
    case 'SUBMITTED':    // Admin sent to kitchen "Nuevo"
      return 'Enviado'
    case 'IN_KITCHEN':
      return 'En cocina'
    case 'READY':
      return 'Listo'
    case 'SERVED':
      return 'Servido'
    case 'CANCELED':
      return 'Cancelado'
    default:
      return status
  }
}

// Category display order: Bebidas, Entradas, Platos Principales, Postres, then others
// Uses partial matching to handle variations (e.g., "Platos Principales" matches "principal")
const CATEGORY_ORDER = [
  { name: 'Bebidas', keywords: ['bebida'] },
  { name: 'Entradas', keywords: ['entrada'] },
  { name: 'Platos Principales', keywords: ['principal', 'plato'] },
  { name: 'Postres', keywords: ['postre'] },
]

function getCategoryOrder(categoryName: string | null): number {
  if (!categoryName) return 999
  const lowerName = categoryName.toLowerCase()
  const index = CATEGORY_ORDER.findIndex((cat) =>
    cat.keywords.some((kw) => lowerName.includes(kw))
  )
  return index === -1 ? 998 : index
}

// Group items by category and sort by order
function groupItemsByCategory(items: RoundItemDetail[]): Map<string, RoundItemDetail[]> {
  const grouped = new Map<string, RoundItemDetail[]>()

  // Sort items by category order first
  const sortedItems = [...items].sort((a, b) => {
    return getCategoryOrder(a.category_name) - getCategoryOrder(b.category_name)
  })

  for (const item of sortedItems) {
    const category = item.category_name || 'Otros'
    if (!grouped.has(category)) {
      grouped.set(category, [])
    }
    grouped.get(category)!.push(item)
  }

  return grouped
}

// Item row component
function ItemRow({ item }: { item: RoundItemDetail }) {
  return (
    <div className="px-4 py-2 flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--text-primary)]">
            {item.qty}x {item.product_name}
          </span>
          {item.diner_name && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: item.diner_color ? `${item.diner_color}20` : 'var(--bg-tertiary)',
                color: item.diner_color || 'var(--text-tertiary)',
              }}
            >
              {item.diner_name}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5 italic">
            {item.notes}
          </p>
        )}
      </div>
      <span className="text-sm font-medium text-[var(--text-secondary)]">
        {formatPrice(item.unit_price_cents * item.qty)}
      </span>
    </div>
  )
}

// Get next status for a round (Dashboard/Admin perspective)
// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
// Note: PENDING → CONFIRMED is done by WAITER in pwaWaiter
// Note: SUBMITTED → IN_KITCHEN and IN_KITCHEN → READY is done by KITCHEN role only
function getNextStatus(currentStatus: string): 'SUBMITTED' | 'SERVED' | null {
  switch (currentStatus) {
    case 'PENDING':      // Waiter must confirm first in pwaWaiter
      return null        // Admin cannot advance - waiter must verify at table
    case 'CONFIRMED':    // Admin sends to kitchen "Nuevo"
      return 'SUBMITTED'
    case 'SUBMITTED':    // In Kitchen "Nuevo" - waiting for cook
      return null        // Admin cannot advance - kitchen must start preparing
    case 'IN_KITCHEN':
      // Admin cannot advance this - must wait for kitchen to mark READY
      return null
    case 'READY':
      // Kitchen marked as ready, admin can now mark as served
      return 'SERVED'
    default:
      return null
  }
}

// Get label for next status button
// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
function getNextStatusLabel(currentStatus: string): string {
  switch (currentStatus) {
    case 'PENDING':      // Waiting for waiter to verify - no button for admin
      return ''
    case 'CONFIRMED':    // Admin can now send to kitchen
      return 'Enviar a Cocina'
    case 'SUBMITTED':    // In Kitchen "Nuevo" - waiting for cook to start
      return ''          // No button - kitchen controls this
    case 'IN_KITCHEN':
      // No button shown - waiting for kitchen
      return ''
    case 'READY':
      return 'Servido'
    default:
      return ''
  }
}

// Round card component
interface RoundCardProps {
  round: RoundDetail
  onAdvanceStatus: (roundId: number, newStatus: 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED') => Promise<void>
  isUpdating: boolean
}

function RoundCard({ round, onAdvanceStatus, isUpdating }: RoundCardProps) {
  const groupedItems = groupItemsByCategory(round.items)
  const nextStatus = getNextStatus(round.status)
  const nextStatusLabel = getNextStatusLabel(round.status)

  // Track which categories have been marked as "sent" (green)
  const [sentCategories, setSentCategories] = useState<Set<string>>(new Set())

  const handleAdvance = () => {
    if (nextStatus) {
      onAdvanceStatus(round.id, nextStatus)
    }
  }

  const toggleCategorySent = (category: string) => {
    setSentCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return (
    <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
      {/* Round header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)]">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-[var(--text-tertiary)]" />
          <span className="font-medium text-[var(--text-primary)]">Ronda #{round.round_number}</span>
        </div>
        <div className="flex items-center gap-2">
          {round.submitted_at && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatTime(round.submitted_at)}
            </span>
          )}
          <Badge variant={getRoundStatusVariant(round.status)} className="!text-black">
            {getRoundStatusLabel(round.status)}
          </Badge>
        </div>
      </div>

      {/* Items grouped by category */}
      <div className="divide-y divide-[var(--border-subtle)]">
        {Array.from(groupedItems.entries()).map(([category, items]) => {
          const isSent = sentCategories.has(category)
          return (
            <div key={category}>
              {/* Category header with send icon */}
              <div className="px-4 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  {category}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCategorySent(category)}
                  className={`p-1 rounded-full transition-colors ${
                    isSent
                      ? 'text-[var(--success-icon)] bg-[var(--success-bg)] hover:bg-green-200'
                      : 'text-[var(--danger-icon)] bg-[var(--danger-bg)] hover:bg-red-200'
                  }`}
                  title={isSent ? 'Marcar como pendiente' : 'Marcar como enviado'}
                  aria-label={isSent ? `${category} enviado - clic para desmarcar` : `${category} pendiente - clic para marcar como enviado`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {/* Items in category */}
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
          )
        })}
      </div>

      {/* Advance status button */}
      {nextStatus && (
        <div className="px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)]">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdvance}
            isLoading={isUpdating}
            leftIcon={<ChevronRight className="w-4 h-4" />}
          >
            {nextStatusLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

export function TableSessionModal({ isOpen, onClose, table }: TableSessionModalProps) {
  const [session, setSession] = useState<TableSessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingRoundId, setUpdatingRoundId] = useState<number | null>(null)

  // Get clearNewOrderFlag action from store
  const clearNewOrderFlag = useTableStore((s) => s.clearNewOrderFlag)

  // Fetch session details
  const fetchSession = useCallback(async () => {
    if (!table) return

    // Skip API call if table is FREE - no session exists
    if (table.status === 'libre' || table.status === 'FREE') {
      setError('Mesa libre - sin sesión activa')
      setSession(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const tableId = parseInt(table.id, 10)
      if (isNaN(tableId)) {
        setError('ID de mesa inválido')
        return
      }

      const data = await tableAPI.getSessionDetail(tableId)
      setSession(data)
    } catch (err) {
      // CRIT-03 FIX: Use proper error type checking instead of string matching
      const message = err instanceof Error ? err.message : 'Error al cargar la sesión'

      // Check for HTTP status code first (more reliable than string matching)
      // fetchAPI throws errors with "HTTP XXX" format for non-ok responses
      const httpStatusMatch = message.match(/HTTP\s*(\d{3})/i)
      const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : null

      if (httpStatus === 404) {
        setError('Esta mesa no tiene una sesión activa')
      } else if (httpStatus === 401 || httpStatus === 403) {
        setError('No tienes permiso para ver esta sesión')
      } else if (message.toLowerCase().includes('no active session') || message.toLowerCase().includes('not found')) {
        // Fallback to string matching for backend-specific messages
        setError('Esta mesa no tiene una sesión activa')
      } else {
        setError(message)
      }
      setSession(null)
    } finally {
      setIsLoading(false)
    }
  }, [table])

  // Fetch when modal opens or table changes
  useEffect(() => {
    if (isOpen && table) {
      fetchSession()
    } else {
      // Reset state when modal closes
      setSession(null)
      setError(null)
    }
  }, [isOpen, table, fetchSession])

  // Advance round status
  const handleAdvanceStatus = useCallback(async (roundId: number, newStatus: 'SUBMITTED' | 'IN_KITCHEN' | 'READY' | 'SERVED') => {
    setUpdatingRoundId(roundId)
    try {
      await kitchenAPI.updateRoundStatus(roundId, newStatus)
      toast.success(`Estado actualizado a "${getNextStatusLabel(session?.rounds.find(r => r.id === roundId)?.status || '')}"`)
      // Clear the new order flag when advancing status (stops the blink animation)
      if (table?.id) {
        clearNewOrderFlag(table.id)
      }
      // Refresh session to get updated data
      await fetchSession()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar estado'
      toast.error(message)
    } finally {
      setUpdatingRoundId(null)
    }
  }, [fetchSession, session?.rounds, table?.id, clearNewOrderFlag])

  // Calculate totals
  const remainingCents = session ? session.total_cents - session.paid_cents : 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Mesa #${table?.number || ''} - ${table?.sector || ''}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-500)]" />
          <span className="ml-3 text-[var(--text-muted)]">Cargando sesión...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--warning-icon)] mb-4" />
          <p className="text-[var(--text-muted)] mb-4">{error}</p>
          <Button variant="outline" onClick={fetchSession} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Reintentar
          </Button>
        </div>
      ) : session ? (
        <div className="space-y-6">
          {/* Session header info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs mb-1">
                <Clock className="w-3 h-3" />
                Abierta
              </div>
              <div className="font-medium text-[var(--text-primary)]">
                {formatTime(session.opened_at)}
              </div>
            </div>

            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs mb-1">
                <Users className="w-3 h-3" />
                Comensales
              </div>
              <div className="font-medium text-[var(--text-primary)]">
                {session.diners.length}
              </div>
            </div>

            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs mb-1">
                <ShoppingBag className="w-3 h-3" />
                Rondas
              </div>
              <div className="font-medium text-[var(--text-primary)]">
                {session.rounds.length}
              </div>
            </div>

            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs mb-1">
                <CreditCard className="w-3 h-3" />
                Estado
              </div>
              <div>
                <Badge variant={session.status === 'PAYING' ? 'warning' : 'success'}>
                  {session.status === 'OPEN' ? 'Abierta' : session.status === 'PAYING' ? 'Pagando' : 'Cerrada'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Diners list */}
          {session.diners.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                Comensales
              </h4>
              <div className="flex flex-wrap gap-2">
                {session.diners.map((diner) => (
                  <span
                    key={diner.id}
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: `${diner.color}20`,
                      color: diner.color,
                    }}
                  >
                    {diner.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rounds */}
          {session.rounds.length > 0 ? (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                Pedidos
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {session.rounds.map((round) => (
                  <RoundCard
                    key={round.id}
                    round={round}
                    onAdvanceStatus={handleAdvanceStatus}
                    isUpdating={updatingRoundId === round.id}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No hay pedidos todavía</p>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-[var(--border-default)] pt-4">
            <div className="flex justify-between items-center">
              <div>
                {session.check_status && (
                  <Badge
                    variant={
                      session.check_status === 'PAID'
                        ? 'success'
                        : session.check_status === 'PARTIALLY_PAID'
                        ? 'warning'
                        : 'info'
                    }
                  >
                    {session.check_status === 'PAID'
                      ? 'Pagado'
                      : session.check_status === 'PARTIALLY_PAID'
                      ? 'Pago parcial'
                      : session.check_status === 'OPEN'
                      ? 'Cuenta abierta'
                      : session.check_status}
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-[var(--text-muted)]">
                  {session.paid_cents > 0 && (
                    <span>Pagado: {formatPrice(session.paid_cents)} / </span>
                  )}
                  Total
                </div>
                <div className="text-xl font-bold text-[var(--primary-500)]">
                  {formatPrice(session.total_cents)}
                </div>
                {session.paid_cents > 0 && remainingCents > 0 && (
                  <div className="text-sm text-[var(--warning-text)]">
                    Pendiente: {formatPrice(remainingCents)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <p>No hay información disponible</p>
        </div>
      )}
    </Modal>
  )
}
