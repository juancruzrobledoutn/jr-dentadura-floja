import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Button, Badge, Modal } from '../components/ui'
import { ChefHat, Clock, CheckCircle2, AlertCircle, RefreshCw, Wifi, WifiOff, Truck, X, Printer, Volume2, VolumeX, Ban } from 'lucide-react'
import { kitchenAPI, type Round } from '../services/api'
import { printKitchenTicket } from '../utils/print'
import { dashboardWS, type WSEvent } from '../services/websocket'
import { useAuthStore, selectIsAuthenticated, selectUserBranchIds, selectUserRoles } from '../stores/authStore'
import { logger } from '../utils/logger'

// =============================================================================
// Audio notification helpers
// =============================================================================

const KITCHEN_SOUND_KEY = 'kitchen-sound-enabled'

function getStoredSoundPreference(): boolean {
  try {
    const stored = localStorage.getItem(KITCHEN_SOUND_KEY)
    return stored !== 'false' // Default to ON
  } catch {
    return true
  }
}

/**
 * Generate a short beep tone using Web Audio API.
 * No external sound file needed.
 */
function playKitchenBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime) // A5 note
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.5)

    // Second beep for urgency
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1046, ctx.currentTime + 0.15) // C6 note
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.65)
  } catch {
    // Silently fail if Web Audio API is not available
  }
}

type RoundStatus = Round['status']

// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
// Kitchen sees SUBMITTED, IN_KITCHEN, and READY
function getStatusConfig(t: (key: string) => string): Record<RoundStatus, { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger'; next?: RoundStatus; color: string; actionLabel?: string; actionIcon?: 'chef' | 'check' | 'truck' }> {
  return {
    DRAFT: { label: t('pages.kitchen.statusLabels.DRAFT'), variant: 'default', color: 'bg-gray-200' },
    PENDING: { label: t('pages.kitchen.statusLabels.PENDING'), variant: 'danger', color: 'bg-red-100 border-red-300' },
    CONFIRMED: { label: t('pages.kitchen.statusLabels.CONFIRMED'), variant: 'info', color: 'bg-blue-100 border-blue-300' },
    SUBMITTED: { label: t('pages.kitchen.statusLabels.SUBMITTED'), variant: 'warning', next: 'IN_KITCHEN', color: 'bg-yellow-100 border-yellow-300', actionLabel: t('pages.kitchen.actionLabels.start'), actionIcon: 'chef' },
    IN_KITCHEN: { label: t('pages.kitchen.statusLabels.IN_KITCHEN'), variant: 'info', next: 'READY', color: 'bg-blue-100 border-blue-300', actionLabel: t('pages.kitchen.actionLabels.ready'), actionIcon: 'check' },
    READY: { label: t('pages.kitchen.statusLabels.READY'), variant: 'success', next: 'SERVED', color: 'bg-green-100 border-green-300', actionLabel: t('pages.kitchen.actionLabels.served'), actionIcon: 'truck' },
    SERVED: { label: t('pages.kitchen.statusLabels.SERVED'), variant: 'default', color: 'bg-gray-100' },
    CANCELED: { label: t('pages.kitchen.statusLabels.CANCELED'), variant: 'danger', color: 'bg-gray-100' },
  }
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--:--'
  const date = new Date(dateStr)
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function getElapsedMinutes(dateStr: string | null): number {
  if (!dateStr) return 0
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / 60000)
}

// Color coding based on elapsed time
function getUrgencyColor(elapsed: number, status: RoundStatus): string {
  if (status === 'READY' || status === 'SERVED') return ''
  if (elapsed > 20) return 'ring-2 ring-red-500 shadow-red-200 shadow-lg kds-pulse-urgent'
  if (elapsed > 10) return 'ring-2 ring-orange-400 shadow-orange-200 shadow-md'
  return ''
}

function getTimeColor(elapsed: number, status: RoundStatus): string {
  if (status === 'READY' || status === 'SERVED') return 'text-green-600'
  if (elapsed > 20) return 'text-red-600 font-bold'
  if (elapsed > 10) return 'text-orange-600 font-semibold'
  return 'text-gray-500'
}

// Ticket card that shows items directly
interface TicketCardProps {
  round: Round
  onAction: (roundId: number, status: RoundStatus) => Promise<void>
  isUpdating: boolean
  onClick: () => void
  onVoidItem: (itemId: number, productName: string) => void
}

function TicketCard({ round, onAction, isUpdating, onClick, onVoidItem }: TicketCardProps) {
  const { t } = useTranslation()
  const statusConfig = getStatusConfig(t)
  const config = statusConfig[round.status]
  const elapsed = getElapsedMinutes(round.submitted_at)
  const urgencyColor = getUrgencyColor(elapsed, round.status)
  const timeColor = getTimeColor(elapsed, round.status)

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (config.next) {
      await onAction(round.id, config.next)
    }
  }

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-lg border-2 cursor-pointer transition-all duration-200
        hover:shadow-lg ${config.color} ${urgencyColor}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {/* Header: Table code + time */}
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-800">
            {round.table_code || `Mesa #${round.table_id || '?'}`}
          </span>
          <Badge variant={config.variant} className="text-xs">
            Ronda #{round.round_number}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              printKitchenTicket(round.id)
            }}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Imprimir ticket"
            aria-label="Imprimir ticket de cocina"
          >
            <Printer className="w-4 h-4 text-gray-500" />
          </button>
          <div className={`flex items-center gap-1 text-sm ${timeColor}`}>
            <Clock className="w-4 h-4" />
            <span>{elapsed}min</span>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="px-3 pb-2 space-y-1">
        {round.items.map((item) => (
          <div key={item.id} className={`flex items-start gap-2 text-sm ${item.is_voided ? 'opacity-40 line-through' : ''}`}>
            <span className="font-bold text-gray-700 min-w-[24px]">{item.qty}x</span>
            <span className="text-gray-800 flex-1">
              {item.product_name}
              {item.is_voided && (
                <span className="ml-1 text-red-600 text-xs font-semibold no-underline">
                  ({t('pages.kitchen.voided')})
                </span>
              )}
            </span>
            {/* Per-item prep timer for IN_KITCHEN status */}
            {round.status === 'IN_KITCHEN' && !item.is_voided && (
              <span className={`text-xs font-mono flex-shrink-0 ${elapsed > 20 ? 'text-red-600 font-bold' : elapsed > 10 ? 'text-orange-500' : 'text-blue-500'}`}>
                {elapsed}m
              </span>
            )}
            {item.notes && !item.is_voided && (
              <span className="text-orange-600 text-xs italic truncate max-w-[120px]" title={item.notes}>
                ⚠ {item.notes}
              </span>
            )}
            {!item.is_voided && ['SUBMITTED', 'IN_KITCHEN', 'READY'].includes(round.status) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onVoidItem(item.id, item.product_name)
                }}
                className="p-0.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                title={t('pages.kitchen.voidItem')}
                aria-label={`${t('pages.kitchen.voidItem')}: ${item.product_name}`}
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Action button */}
      {config.next && config.actionLabel && (
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={handleAction}
            disabled={isUpdating}
            className={`
              w-full py-2 px-4 rounded-md text-sm font-semibold transition-colors
              flex items-center justify-center gap-2
              ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}
              ${round.status === 'SUBMITTED'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : round.status === 'IN_KITCHEN'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }
            `}
          >
            {isUpdating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {config.actionIcon === 'chef' && <ChefHat className="w-4 h-4" />}
                {config.actionIcon === 'check' && <CheckCircle2 className="w-4 h-4" />}
                {config.actionIcon === 'truck' && <Truck className="w-4 h-4" />}
              </>
            )}
            {config.actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// Modal for round details
interface RoundDetailModalProps {
  isOpen: boolean
  onClose: () => void
  round: Round | null
  onStatusChange: (roundId: number, status: RoundStatus) => Promise<void>
  isUpdating: boolean
  onVoidItem: (itemId: number, productName: string) => void
}

function RoundDetailModal({ isOpen, onClose, round, onStatusChange, isUpdating, onVoidItem }: RoundDetailModalProps) {
  const { t } = useTranslation()
  if (!round) return null

  const statusConfig = getStatusConfig(t)
  const config = statusConfig[round.status]
  const elapsed = getElapsedMinutes(round.submitted_at)
  const timeColor = getTimeColor(elapsed, round.status)

  const handleNextStatus = async () => {
    if (config.next) {
      await onStatusChange(round.id, config.next)
      onClose()
    }
  }

  const canVoidItems = ['SUBMITTED', 'IN_KITCHEN', 'READY'].includes(round.status)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Mesa ${round.table_code || round.id}`}>
      <div className="space-y-4">
        {/* Header info */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-primary)]">
          <Badge variant={config.variant} className="text-sm px-3 py-1">
            {config.label}
          </Badge>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className={`text-sm ${timeColor}`}>
              {formatTime(round.submitted_at)} ({elapsed} min)
            </span>
          </div>
        </div>

        {/* Items list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {round.items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between p-3 bg-[var(--bg-tertiary)]/50 rounded-lg ${item.is_voided ? 'opacity-40' : ''}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold text-[var(--primary-500)] ${item.is_voided ? 'line-through' : ''}`}>
                    {item.qty}x
                  </span>
                  <span className={`text-[var(--text-primary)] font-medium ${item.is_voided ? 'line-through' : ''}`}>
                    {item.product_name}
                  </span>
                  {item.is_voided && (
                    <Badge variant="danger" className="text-xs">
                      {t('pages.kitchen.voided')}
                    </Badge>
                  )}
                </div>
                {item.is_voided && item.void_reason && (
                  <p className="mt-1 text-sm text-red-500 italic">
                    {item.void_reason}
                  </p>
                )}
                {item.notes && !item.is_voided && (
                  <p className="mt-1 text-sm text-[var(--warning-text)] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {item.notes}
                  </p>
                )}
              </div>
              {canVoidItems && !item.is_voided && (
                <button
                  onClick={() => onVoidItem(item.id, item.product_name)}
                  className="ml-2 p-1.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  title={t('pages.kitchen.voidItem')}
                  aria-label={`${t('pages.kitchen.voidItem')}: ${item.product_name}`}
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-[var(--border-primary)] space-y-2">
          <Button
            variant="secondary"
            onClick={() => printKitchenTicket(round.id)}
            className="w-full"
            leftIcon={<Printer className="w-5 h-5" />}
          >
            Imprimir Ticket
          </Button>
          {config.next && config.actionLabel ? (
            <Button
              onClick={handleNextStatus}
              disabled={isUpdating}
              isLoading={isUpdating}
              className="w-full"
              size="lg"
              leftIcon={
                config.actionIcon === 'chef' ? (
                  <ChefHat className="w-5 h-5" />
                ) : config.actionIcon === 'truck' ? (
                  <Truck className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )
              }
            >
              {t('pages.kitchen.markAs')} {config.actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

// Column header component
interface ColumnHeaderProps {
  title: string
  count: number
  variant: 'warning' | 'info' | 'success'
  icon: React.ReactNode
}

function ColumnHeader({ title, count, variant, icon }: ColumnHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      <Badge variant={variant}>{count}</Badge>
    </div>
  )
}

export function KitchenPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.kitchen.title'))

  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const userBranchIds = useAuthStore(selectUserBranchIds)
  const userRoles = useAuthStore(selectUserRoles)

  const canAccessKitchen = userRoles.includes('KITCHEN') ||
                           userRoles.includes('ADMIN') ||
                           userRoles.includes('MANAGER')

  const [rounds, setRounds] = useState<Round[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWsConnected, setIsWsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingRoundId, setUpdatingRoundId] = useState<number | null>(null)
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Audio alert state
  const [soundEnabled, setSoundEnabled] = useState(getStoredSoundPreference)
  const soundEnabledRef = useRef(soundEnabled)
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  })

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      localStorage.setItem(KITCHEN_SOUND_KEY, String(next))
      return next
    })
  }, [])

  // Void modal state
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidItemId, setVoidItemId] = useState<number | null>(null)
  const [voidItemName, setVoidItemName] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const [isVoiding, setIsVoiding] = useState(false)

  // Visual flash for new orders
  const [flashActive, setFlashActive] = useState(false)

  // Auto-update elapsed time every 15 seconds for KDS timer accuracy
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchRounds = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      setError(null)
      const data = await kitchenAPI.getPendingRounds()
      setRounds(data)
    } catch (err) {
      setError(t('pages.kitchen.errorLoadingOrders'))
      logger.error('KitchenPage', 'Fetch error', err)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  const handleWSEvent = useCallback((event: WSEvent) => {
    const { type, entity, branch_id } = event

    if (branch_id !== undefined && userBranchIds.length > 0 && !userBranchIds.includes(branch_id)) {
      return
    }

    switch (type) {
      case 'ROUND_SUBMITTED':
        // New round arrived - refetch to get full data
        fetchRounds()
        // Play audio alert if sound is enabled
        if (soundEnabledRef.current) {
          playKitchenBeep()
        }
        // Flash the page briefly
        setFlashActive(true)
        setTimeout(() => setFlashActive(false), 1500)
        break

      case 'ROUND_IN_KITCHEN':
        if (entity?.round_id) {
          setRounds((prev) =>
            prev.map((r) =>
              r.id === entity.round_id
                ? { ...r, status: 'IN_KITCHEN' as const }
                : r
            )
          )
        } else {
          fetchRounds()
        }
        // Also play sound for IN_KITCHEN transition
        if (soundEnabledRef.current) {
          playKitchenBeep()
        }
        break

      case 'ROUND_READY':
        if (entity?.round_id) {
          setRounds((prev) =>
            prev.map((r) =>
              r.id === entity.round_id
                ? { ...r, status: 'READY' as const }
                : r
            )
          )
        } else {
          fetchRounds()
        }
        break

      case 'ROUND_SERVED':
        if (entity?.round_id) {
          setRounds((prev) => prev.filter((r) => r.id !== entity.round_id))
          if (selectedRound?.id === entity.round_id) {
            setIsModalOpen(false)
            setSelectedRound(null)
          }
        }
        break

      case 'ROUND_CANCELED':
        if (entity?.round_id) {
          setRounds((prev) => prev.filter((r) => r.id !== entity.round_id))
          if (selectedRound?.id === entity.round_id) {
            setIsModalOpen(false)
            setSelectedRound(null)
          }
        }
        break

      case 'ROUND_ITEM_VOIDED':
        // Update item state in local rounds
        if (entity?.round_id && entity?.item_id) {
          if (entity.round_canceled) {
            // Round was auto-canceled, remove it
            setRounds((prev) => prev.filter((r) => r.id !== entity.round_id))
          } else {
            // Mark item as voided locally
            setRounds((prev) =>
              prev.map((r) =>
                r.id === entity.round_id
                  ? {
                      ...r,
                      items: r.items.map((item) =>
                        item.id === entity.item_id
                          ? { ...item, is_voided: true, void_reason: entity.void_reason ?? null }
                          : item
                      ),
                    }
                  : r
              )
            )
          }
        }
        break
    }
  }, [fetchRounds, userBranchIds, selectedRound])

  const handleWSEventRef = useRef(handleWSEvent)
  useEffect(() => {
    handleWSEventRef.current = handleWSEvent
  })

  useEffect(() => {
    if (isAuthenticated) {
      fetchRounds()
    }
  }, [isAuthenticated, fetchRounds])

  useEffect(() => {
    if (!isAuthenticated) return

    dashboardWS.connect('kitchen')
    const unsubscribeConnection = dashboardWS.onConnectionChange(setIsWsConnected)
    const unsubscribeEvents = dashboardWS.on('*', (event) => handleWSEventRef.current(event))

    return () => {
      unsubscribeConnection()
      unsubscribeEvents()
    }
  }, [isAuthenticated])

  // Fallback polling when WS is disconnected
  useEffect(() => {
    if (!isAuthenticated || isWsConnected) return
    const interval = setInterval(fetchRounds, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, isWsConnected, fetchRounds])

  const handleStatusChange = async (roundId: number, status: RoundStatus) => {
    setUpdatingRoundId(roundId)
    try {
      const updated = await kitchenAPI.updateRoundStatus(
        roundId,
        status as 'IN_KITCHEN' | 'READY' | 'SERVED'
      )
      setRounds((prev) =>
        prev
          .map((r) => (r.id === roundId ? updated : r))
          .filter((r) => r.status !== 'SERVED')
      )
    } catch (err) {
      setError(t('pages.kitchen.errorUpdatingStatus'))
      logger.error('KitchenPage', 'Update error', err)
    } finally {
      setUpdatingRoundId(null)
    }
  }

  const openRoundModal = (round: Round) => {
    setSelectedRound(round)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedRound(null)
  }

  // Void item handlers
  const openVoidModal = useCallback((itemId: number, productName: string) => {
    setVoidItemId(itemId)
    setVoidItemName(productName)
    setVoidReason('')
    setVoidModalOpen(true)
  }, [])

  const closeVoidModal = useCallback(() => {
    setVoidModalOpen(false)
    setVoidItemId(null)
    setVoidItemName('')
    setVoidReason('')
  }, [])

  const handleVoidConfirm = useCallback(async () => {
    if (!voidItemId || !voidReason.trim()) return

    setIsVoiding(true)
    try {
      const result = await kitchenAPI.voidItem(voidItemId, voidReason.trim())

      if (result.round_canceled) {
        // Round auto-canceled, remove from list
        setRounds((prev) => prev.filter((r) => r.id !== result.round_id))
      } else {
        // Mark item as voided locally
        setRounds((prev) =>
          prev.map((r) =>
            r.id === result.round_id
              ? {
                  ...r,
                  items: r.items.map((item) =>
                    item.id === voidItemId
                      ? { ...item, is_voided: true, void_reason: voidReason.trim() }
                      : item
                  ),
                }
              : r
          )
        )
      }

      closeVoidModal()
    } catch (err) {
      setError(t('pages.kitchen.voidError'))
      logger.error('KitchenPage', 'Void error', err)
    } finally {
      setIsVoiding(false)
    }
  }, [voidItemId, voidReason, closeVoidModal, t])

  // Group rounds by status into 3 columns
  const submittedRounds = rounds.filter((r) => r.status === 'SUBMITTED')
  const inKitchenRounds = rounds.filter((r) => r.status === 'IN_KITCHEN')
  const readyRounds = rounds.filter((r) => r.status === 'READY')

  if (!canAccessKitchen) {
    return (
      <PageContainer
        title={t('pages.kitchen.title')}
        description={t('pages.kitchen.description')}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[var(--danger-icon)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              {t('pages.kitchen.accessRestricted')}
            </h2>
            <p className="text-[var(--text-tertiary)]">
              {t('pages.kitchen.noKitchenAccess')}
            </p>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('pages.kitchen.title')}
      description={t('pages.kitchen.description')}
      actions={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isWsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-[var(--success-icon)]" />
                <span className="text-sm text-[var(--success-icon)]">{t('pages.kitchen.live')}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-[var(--warning-icon)]" />
                <span className="text-sm text-[var(--warning-icon)]">{t('pages.kitchen.reconnecting')}</span>
              </>
            )}
          </div>
          <button
            onClick={toggleSound}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              soundEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            aria-label={soundEnabled ? t('pages.kitchen.soundOn') : t('pages.kitchen.soundOff')}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? t('pages.kitchen.soundOn') : t('pages.kitchen.soundOff')}
          </button>
          <Button
            variant="secondary"
            onClick={fetchRounds}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Actualizar
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/50 rounded-lg text-[var(--danger-text)] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--danger-text)] hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading && !error ? (
        <div className="flex items-center justify-center h-64" role="status">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[var(--text-tertiary)]">{t('pages.kitchen.connectingToServer')}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: En Espera (SUBMITTED) - waiting to be started */}
          <div>
            <ColumnHeader
              title={t('pages.kitchen.waitingColumn')}
              count={submittedRounds.length}
              variant="warning"
              icon={<Clock className="w-5 h-5 text-yellow-500" />}
            />
            <div className="space-y-3">
              {submittedRounds.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] py-12 bg-[var(--bg-secondary)] rounded-lg border-2 border-dashed border-[var(--border-default)]">
                  {t('pages.kitchen.noWaiting')}
                </div>
              ) : (
                submittedRounds.map((round) => (
                  <TicketCard
                    key={round.id}
                    round={round}
                    onAction={handleStatusChange}
                    isUpdating={updatingRoundId === round.id}
                    onClick={() => openRoundModal(round)}
                    onVoidItem={openVoidModal}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 2: En Preparación (IN_KITCHEN) - being cooked */}
          <div>
            <ColumnHeader
              title={t('pages.kitchen.preparingColumn')}
              count={inKitchenRounds.length}
              variant="info"
              icon={<ChefHat className="w-5 h-5 text-blue-500" />}
            />
            <div className="space-y-3">
              {inKitchenRounds.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] py-12 bg-[var(--bg-secondary)] rounded-lg border-2 border-dashed border-[var(--border-default)]">
                  {t('pages.kitchen.noPreparing')}
                </div>
              ) : (
                inKitchenRounds.map((round) => (
                  <TicketCard
                    key={round.id}
                    round={round}
                    onAction={handleStatusChange}
                    isUpdating={updatingRoundId === round.id}
                    onClick={() => openRoundModal(round)}
                    onVoidItem={openVoidModal}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 3: Listos (READY) - waiting for waiter pickup */}
          <div>
            <ColumnHeader
              title={t('pages.kitchen.readyColumn')}
              count={readyRounds.length}
              variant="success"
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
            />
            <div className="space-y-3">
              {readyRounds.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] py-12 bg-[var(--bg-secondary)] rounded-lg border-2 border-dashed border-[var(--border-default)]">
                  {t('pages.kitchen.noReady')}
                </div>
              ) : (
                readyRounds.map((round) => (
                  <TicketCard
                    key={round.id}
                    round={round}
                    onAction={handleStatusChange}
                    isUpdating={updatingRoundId === round.id}
                    onClick={() => openRoundModal(round)}
                    onVoidItem={openVoidModal}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Round Detail Modal */}
      <RoundDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        round={selectedRound}
        onStatusChange={handleStatusChange}
        isUpdating={updatingRoundId === selectedRound?.id}
        onVoidItem={openVoidModal}
      />

      {/* Void Confirmation Modal */}
      <Modal
        isOpen={voidModalOpen}
        onClose={closeVoidModal}
        title={t('pages.kitchen.voidItem')}
      >
        <div className="space-y-4">
          <p className="text-[var(--text-primary)]">
            {t('pages.kitchen.voidItem')}: <strong>{voidItemName}</strong>
          </p>
          <div>
            <label
              htmlFor="void-reason"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
            >
              {t('pages.kitchen.voidReason')}
            </label>
            <textarea
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder={t('pages.kitchen.voidReasonPlaceholder')}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={closeVoidModal}>
              {t('pages.kitchen.voidCancel')}
            </Button>
            <Button
              onClick={handleVoidConfirm}
              disabled={!voidReason.trim() || isVoiding}
              isLoading={isVoiding}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('pages.kitchen.voidConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Visual flash for new orders */}
      {flashActive && (
        <div className="fixed inset-0 bg-orange-500/10 pointer-events-none z-50 animate-pulse" />
      )}

      {/* Screen reader announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {t('pages.kitchen.srAnnouncement', { preparing: inKitchenRounds.length, ready: readyRounds.length })}
      </div>
    </PageContainer>
  )
}

export default KitchenPage
