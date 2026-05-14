import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTableStore } from '../../stores/tableStore'

/**
 * Warning banner shown when diner registration failed.
 * PWAM-004: Allows user to retry registration before placing orders.
 */
export default function DinerRegistrationWarning() {
  const { t } = useTranslation()
  const currentDiner = useTableStore((s) => s.currentDiner)
  const retryDinerRegistration = useTableStore((s) => s.retryDinerRegistration)
  const [isRetrying, setIsRetrying] = useState(false)

  // Don't show if no diner or registration succeeded
  if (!currentDiner?.registrationFailed) {
    return null
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await retryDinerRegistration()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div
      className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mx-4 mb-4"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-yellow-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-yellow-400 text-sm font-medium">
            {t('errors.dinerRegistrationFailed', 'Error de registro')}
          </p>
          <p className="text-yellow-400/70 text-xs mt-1">
            {t('errors.dinerRegistrationFailedDesc', 'No se pudo registrar tu sesion. Reintenta antes de hacer pedidos.')}
          </p>
        </div>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRetrying ? t('common.retrying', 'Reintentando...') : t('common.retry', 'Reintentar')}
        </button>
      </div>
    </div>
  )
}
