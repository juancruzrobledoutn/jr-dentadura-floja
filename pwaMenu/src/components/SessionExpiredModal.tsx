import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { useSessionStore, selectIsSessionExpired } from '../stores/sessionStore'

/**
 * Modal shown when the table session token expires (8 hours).
 * User must scan QR code again to start a new session.
 * This modal cannot be dismissed without action.
 */
export function SessionExpiredModal() {
  const { t } = useTranslation()
  const isExpired = useSessionStore(selectIsSessionExpired)
  const dismissSessionExpired = useSessionStore((s) => s.dismissSessionExpired)

  const handleRescan = () => {
    // Clear session and redirect to home
    dismissSessionExpired()
    // Navigation will happen automatically due to session being cleared
  }

  return (
    <Modal
      isOpen={isExpired}
      onClose={handleRescan}
      closeOnBackdrop={false}
      closeOnEscape={false}
      preventClose={true}
      mobileAlign="center"
      ariaLabelledBy="session-expired-title"
    >
      <div className="bg-dark-card rounded-2xl p-6 mx-4 max-w-sm text-center shadow-xl">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="session-expired-title"
          className="text-xl font-bold text-white mb-2"
        >
          {t('session.expiredTitle', 'Sesion Expirada')}
        </h2>

        {/* Message */}
        <p className="text-dark-muted mb-6">
          {t('session.expiredMessage', 'Tu sesion ha expirado. Por favor, escanea el codigo QR de tu mesa nuevamente para continuar.')}
        </p>

        {/* Button */}
        <button
          onClick={handleRescan}
          className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-colors"
        >
          {t('session.rescanQR', 'Escanear QR')}
        </button>
      </div>
    </Modal>
  )
}
