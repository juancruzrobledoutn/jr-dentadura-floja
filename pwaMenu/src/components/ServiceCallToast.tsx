/**
 * A001 FIX: Toast component to show service call feedback
 * Shows when waiter acknowledges or completes a service call
 */

import { useTranslation } from 'react-i18next'
import { useServiceCallUpdates } from '../hooks/useServiceCallUpdates'

/**
 * Toast that shows service call status updates
 * Appears when waiter acknowledges the call
 */
export function ServiceCallToast() {
  const { t } = useTranslation()
  const { serviceCall, reset } = useServiceCallUpdates()

  // Only show for acked or closed status
  if (serviceCall.status !== 'acked' && serviceCall.status !== 'closed') {
    return null
  }

  const isAcked = serviceCall.status === 'acked'
  const isClosed = serviceCall.status === 'closed'

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-center animate-slide-down">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm w-full ${
          isAcked
            ? 'bg-blue-600 text-white'
            : isClosed
              ? 'bg-green-600 text-white'
              : 'bg-dark-card text-white'
        }`}
        role="alert"
        aria-live="polite"
      >
        {/* Icon */}
        <div className="flex-shrink-0">
          {isAcked ? (
            <WaiterIcon className="w-6 h-6" />
          ) : (
            <CheckIcon className="w-6 h-6" />
          )}
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            {isAcked
              ? t('serviceCall.waiterComing', 'El mozo viene en camino')
              : t('serviceCall.resolved', 'Llamada atendida')}
          </p>
          {isAcked && (
            <p className="text-xs opacity-80 mt-0.5">
              {t('serviceCall.waiterAcknowledged', 'Tu llamada fue recibida')}
            </p>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={reset}
          className="flex-shrink-0 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label={t('common.close', 'Cerrar')}
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Inline SVG icons
function WaiterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

export default ServiceCallToast
