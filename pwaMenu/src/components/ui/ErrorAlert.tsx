import { useTranslation } from 'react-i18next'

interface ErrorAlertProps {
  title?: string
  message: string
  onClose?: () => void
  className?: string
}

export default function ErrorAlert({
  title,
  message,
  onClose,
  className = '',
}: ErrorAlertProps) {
  const { t } = useTranslation()

  return (
    <div
      className={`bg-red-500/10 border border-red-500/30 rounded-xl p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-red-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-red-400 text-sm font-medium">{title || t('errors.generic')}</p>
          <p className="text-red-400/70 text-xs mt-1">{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-red-400 hover:text-red-300 text-xs font-medium"
          >
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  )
}
