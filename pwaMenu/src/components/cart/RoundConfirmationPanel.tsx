import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoundConfirmation } from '../../types'
import LoadingSpinner from '../ui/LoadingSpinner'

interface RoundConfirmationPanelProps {
  confirmation: RoundConfirmation
  currentDinerId: string
  onConfirm: () => void
  onCancel: () => void
  onCancelProposal: () => void
  getDinerColor: (dinerId: string) => string
}

/**
 * Panel that shows the group confirmation status for submitting a round.
 * All diners must confirm before the order is sent to the kitchen.
 */
export function RoundConfirmationPanel({
  confirmation,
  currentDinerId,
  onConfirm,
  onCancel,
  onCancelProposal,
  getDinerColor,
}: RoundConfirmationPanelProps) {
  const { t } = useTranslation()
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Calculate confirmation counts
  const ready = confirmation.dinerStatuses.filter(s => s.isReady).length
  const total = confirmation.dinerStatuses.length
  const allReady = ready === total
  const hasConfirmed = confirmation.dinerStatuses.find(
    s => s.dinerId === currentDinerId
  )?.isReady ?? false
  const isProposer = confirmation.proposedBy === currentDinerId

  // Calculate time left until expiration
  useEffect(() => {
    const calculateTimeLeft = () => {
      const expiresAt = new Date(confirmation.expiresAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
      return remaining
    }

    setTimeLeft(calculateTimeLeft())

    timerRef.current = setInterval(() => {
      const remaining = calculateTimeLeft()
      setTimeLeft(remaining)

      if (remaining <= 0) {
        // Expired - cancel the proposal
        onCancelProposal()
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [confirmation.expiresAt, onCancelProposal])

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  return (
    <div
      className={`rounded-xl p-4 border transition-colors ${
        allReady
          ? 'bg-green-500/10 border-green-500/50'
          : 'bg-primary/10 border-primary/30'
      }`}
      role="region"
      aria-label={t('roundConfirmation.title')}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          {allReady ? (
            <>
              <span className="text-green-400" aria-hidden="true">✅</span>
              {t('roundConfirmation.allReady')}
            </>
          ) : (
            <>
              <span className="text-yellow-400" aria-hidden="true">⏳</span>
              {t('roundConfirmation.title')}
            </>
          )}
        </h3>
        {!allReady && timeLeft > 0 && (
          <span
            className={`text-sm font-mono ${timeLeft <= 60 ? 'text-red-400' : 'text-dark-muted'}`}
            aria-label={t('roundConfirmation.timeRemaining', { time: formatTime(timeLeft) })}
          >
            {formatTime(timeLeft)}
          </span>
        )}
      </div>

      {/* Proposed by info */}
      <p className="text-dark-muted text-xs mb-3">
        {t('roundConfirmation.proposedBy', { name: confirmation.proposedByName })}
      </p>

      {/* Diner status list */}
      <div className="space-y-2 mb-4" role="list" aria-label={t('roundConfirmation.dinerList')}>
        {confirmation.dinerStatuses.map((status) => (
          <div
            key={status.dinerId}
            className="flex items-center justify-between text-sm"
            role="listitem"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: getDinerColor(status.dinerId) }}
                aria-hidden="true"
              />
              <span className="text-white">
                {status.dinerName}
                {status.dinerId === currentDinerId && (
                  <span className="text-primary ml-1">({t('cart.you')})</span>
                )}
              </span>
            </div>
            <span
              className={status.isReady ? 'text-green-400' : 'text-yellow-400'}
              aria-label={status.isReady ? t('roundConfirmation.ready') : t('roundConfirmation.waiting')}
            >
              {status.isReady ? '✅' : '⏳'}
              <span className="ml-1 text-xs">
                {status.isReady ? t('roundConfirmation.ready') : t('roundConfirmation.waiting')}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Counter */}
      <div
        className="text-center text-dark-muted text-sm mb-4"
        aria-live="polite"
      >
        [{ready} {t('roundConfirmation.of')} {total} {t('roundConfirmation.dinersReady')}]
      </div>

      {/* Action buttons */}
      {confirmation.status === 'pending' && !allReady && (
        <div className="space-y-2">
          {!hasConfirmed ? (
            <button
              onClick={onConfirm}
              className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              aria-label={t('roundConfirmation.confirmReady')}
            >
              <span aria-hidden="true">✅</span>
              {t('roundConfirmation.confirmReady')}
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 active:bg-yellow-500/40 text-yellow-400 font-semibold py-3 rounded-xl transition-colors border border-yellow-500/30 flex items-center justify-center gap-2"
              aria-label={t('roundConfirmation.cancelReady')}
            >
              <span aria-hidden="true">❌</span>
              {t('roundConfirmation.cancelReady')}
            </button>
          )}

          {/* Only the proposer can cancel the entire proposal */}
          {isProposer && (
            <button
              onClick={onCancelProposal}
              className="w-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 font-medium py-2 rounded-xl transition-colors text-sm"
              aria-label={t('roundConfirmation.cancelProposal')}
            >
              {t('roundConfirmation.cancelProposal')}
            </button>
          )}
        </div>
      )}

      {/* All ready - submitting state */}
      {allReady && confirmation.status === 'confirmed' && (
        <div
          className="flex items-center justify-center gap-2 text-green-400 py-2"
          role="status"
          aria-live="assertive"
        >
          <LoadingSpinner size="sm" />
          <span>{t('roundConfirmation.submitting')}</span>
        </div>
      )}

      {/* All ready - waiting for auto-submit */}
      {allReady && confirmation.status === 'pending' && (
        <div
          className="text-center text-green-400 py-2 animate-pulse"
          role="status"
          aria-live="assertive"
        >
          {t('roundConfirmation.preparing')}
        </div>
      )}
    </div>
  )
}

export default RoundConfirmationPanel
