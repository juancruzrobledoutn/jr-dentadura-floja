import { memo } from 'react'
import { useTranslation } from 'react-i18next'

interface CloseTableHeaderProps {
  tableNumber: string
  onBack: () => void
}

export const CloseTableHeader = memo(function CloseTableHeader({
  tableNumber,
  onBack,
}: CloseTableHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="bg-dark-bg border-b border-dark-border px-4 sm:px-6 py-4 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center hover:bg-dark-elevated transition-colors"
          aria-label={t('common.back')}
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{t('closeTable.title')}</h1>
          <p className="text-dark-muted text-sm">{t('header.table')} {tableNumber}</p>
        </div>
      </div>
    </header>
  )
})
