import { useActionState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAutoCloseTimer } from '../hooks/useAutoCloseTimer'
import { useEscapeKey } from '../hooks/useEscapeKey'
import LoadingSpinner from './ui/LoadingSpinner'
import { dinerAPI } from '../services/api'
import { callWaiterLogger } from '../utils/logger'

interface CallWaiterModalProps {
  isOpen: boolean
  onClose: () => void
  tableNumber: string
}

// React 19: Form state type for useActionState
// Note: 'calling' state is handled by isPending from useActionState
interface CallWaiterState {
  status: 'idle' | 'success' | 'error'
  error: string | null
  serviceCallId?: number
}

/**
 * Modal to call the waiter.
 * Shows confirmation before calling and success feedback after.
 * Uses React 19 useActionState for form handling.
 * C001 FIX: Now connected to backend via dinerAPI.createServiceCall
 */
export default function CallWaiterModal({
  isOpen,
  onClose,
  tableNumber,
}: CallWaiterModalProps) {
  const { t } = useTranslation()

  // React 19: useActionState for call waiter action
  // C001 FIX: Connected to backend instead of mock
  const [formState, formAction, isPending] = useActionState(
    async (_prevState: CallWaiterState): Promise<CallWaiterState> => {
      try {
        callWaiterLogger.info('Creating service call', { type: 'WAITER_CALL' })
        const response = await dinerAPI.createServiceCall({ type: 'WAITER_CALL' })
        callWaiterLogger.info('Service call created', { callId: response.id })
        return { status: 'success', error: null, serviceCallId: response.id }
      } catch (error) {
        callWaiterLogger.error('Failed to create service call', error)
        const message = error instanceof Error ? error.message : t('callWaiter.error')
        return { status: 'error', error: message }
      }
    },
    { status: 'idle', error: null }
  )

  const showSuccess = formState.status === 'success'
  const showError = formState.status === 'error'

  // Use reusable hooks for auto-close and escape key handling
  useAutoCloseTimer({
    enabled: showSuccess,
    onClose,
    delay: 2000, // AUTO_CLOSE_MS
  })

  useEscapeKey({
    enabled: isOpen,
    onEscape: onClose,
    disabled: isPending,
  })

  const handleClose = () => {
    if (isPending) return
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-waiter-title"
    >
      {/* Backdrop for click-outside to close */}
      <div
        className="absolute inset-0"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative bg-dark-card rounded-2xl w-full max-w-sm p-6 text-center">
        {showSuccess ? (
          <SuccessState />
        ) : showError ? (
          <ErrorState error={formState.error} onRetry={() => { }} onClose={handleClose} />
        ) : (
          <ConfirmationState
            tableNumber={tableNumber}
            isPending={isPending}
            onCancel={handleClose}
            formAction={formAction}
          />
        )}
      </div>
    </div>
  )
}

function SuccessState() {
  const { t } = useTranslation()
  return (
    <div className="animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{t('callWaiter.called')}</h2>
      <p className="text-dark-muted">
        {t('callWaiter.calledDescription')}
      </p>
    </div>
  )
}

interface ErrorStateProps {
  error: string | null
  onRetry: () => void
  onClose: () => void
}

function ErrorState({ error, onClose }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className="animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{t('callWaiter.errorTitle', 'Error')}</h2>
      <p className="text-dark-muted mb-4">
        {error || t('callWaiter.error', 'No se pudo llamar al mozo')}
      </p>
      <button
        onClick={onClose}
        className="w-full bg-dark-elevated hover:bg-dark-border text-white font-semibold py-3 px-4 rounded-xl transition-colors"
      >
        {t('common.close', 'Cerrar')}
      </button>
    </div>
  )
}

interface ConfirmationStateProps {
  tableNumber: string
  isPending: boolean
  onCancel: () => void
  formAction: (payload: FormData) => void
}

function ConfirmationState({
  tableNumber,
  isPending,
  onCancel,
  formAction,
}: ConfirmationStateProps) {
  const { t } = useTranslation()
  return (
    <form action={formAction}>
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
      </div>
      <h2 id="call-waiter-title" className="text-xl font-bold text-white mb-2">{t('callWaiter.title')}</h2>
      <p className="text-dark-muted mb-6">
        {t('callWaiter.confirm')} {t('joinTable.table')} {tableNumber}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 bg-dark-elevated hover:bg-dark-border text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <LoadingSpinner size="sm" />
              <span>{t('callWaiter.calling')}</span>
            </>
          ) : (
            t('common.confirm')
          )}
        </button>
      </div>
    </form>
  )
}
